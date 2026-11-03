// The Bangla -> English -> Bangla round trip. Reported on 3 November: after
// EN turned Bangla into English, pressing অ on that English garbled it.
// The offscreen document gets a stand-in Translator, since this machine has
// no language packs; everything else runs for real.

const nodeTest = require('node:test');
const { before, after, beforeEach } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, toast, command } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

const BN = 'আমি প্রতিদিন বাংলায় কথা বলি';
const EN = 'I speak Bangla every day';
const BN2 = 'আমি বাড়ি যেতে চাই';
const EN2 = 'I want to go home';
// Reported 3 November with these sentences: the translator's way back is
// not the original, so EN then অ gave "ভাল এখন এটা ভাল কাজ করে".
const BN3 = 'আচ্ছা দেখি তো এখন ঠিক মতন কাজ করে নাকি';
const EN3 = 'Well now it works fine';
const BN3_BACK = 'ভাল এখন এটা ভাল কাজ করে';
const EN3_EDITED = 'Well now it works';
const BN3_EDITED = 'ভাল এখন এটা কাজ করে';

let server, base, ext, off;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  const cdp = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdp}`] });
  off = await fakeSpeech(ext, cdp);
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn' });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });

// A translator that knows two sentences each way. `missing` names a pair
// whose pack is not downloaded.
const install = missing => off.eval(`(() => {
  const table = { 'bn>en': { ${JSON.stringify(BN)}: ${JSON.stringify(EN)}, ${JSON.stringify(BN2)}: ${JSON.stringify(EN2)},
                             ${JSON.stringify(BN3)}: ${JSON.stringify(EN3)} },
                  'en>bn': { ${JSON.stringify(EN)}: ${JSON.stringify(BN)}, ${JSON.stringify(EN2)}: ${JSON.stringify(BN2)},
                             ${JSON.stringify(EN3)}: ${JSON.stringify(BN3_BACK)}, ${JSON.stringify(EN3_EDITED)}: ${JSON.stringify(BN3_EDITED)} } };
  translators.clear(); pending.clear();
  self.Translator = {
    availability: async o => ${JSON.stringify(missing || '')} === o.sourceLanguage + '>' + o.targetLanguage ? 'downloadable' : 'available',
    create: async o => ({ translate: async t => table[o.sourceLanguage + '>' + o.targetLanguage][t.trim()] ?? ('?' + t), destroy() {} })
  };
  return true;
})()`);

async function open(text) {
  const page = await ext.context.newPage();
  await page.goto(`${base}/textarea.html`);
  await page.waitForFunction(() => window.mimic);
  await page.evaluate(t => mimic.setText(t), text);
  return page;
}
const value = page => page.evaluate(() => mimic.el.value);

for (const [bn, en] of [[BN, EN], [BN2, EN2]]) {
  test(`round trip: "${bn}" to English and back to Bangla`, async () => {
    await install();
    const page = await open(bn);
    try {
      await command(ext, page, 'to-english');
      assert.ok(await waitFor(async () => (await value(page)) === en), `after EN: ${await value(page)}`);
      await page.waitForTimeout(300);
      await command(ext, page, 'to-bangla');
      assert.ok(await waitFor(async () => (await value(page)) === bn, { timeout: 4000 }),
        `after অ: "${await value(page)}" (toast: ${await toast(page)})`);
    } finally { await page.close(); }
  });
}

test('English to Bangla with that pack missing: a message, and the box untouched', async () => {
  await install('en>bn');
  const page = await open(EN);
  try {
    await command(ext, page, 'to-bangla');
    const said = await waitFor(() => toast(page).then(t => /ভাষা প্যাক/.test(t) ? t : null), { timeout: 4000 });
    assert.ok(said, `toast: ${await toast(page)}`);
    assert.equal(await value(page), EN);
  } finally { await page.close(); }
});

test('EN then অ, untouched in between, gives back the words the user said', async () => {
  await install();
  const page = await open(BN3);
  try {
    await command(ext, page, 'to-english');
    assert.ok(await waitFor(async () => (await value(page)) === EN3), `after EN: ${await value(page)}`);
    await page.waitForTimeout(300);
    await command(ext, page, 'to-bangla');
    assert.ok(await waitFor(async () => (await value(page)) === BN3, { timeout: 4000 }),
      `after অ: "${await value(page)}", want the original back`);
  } finally { await page.close(); }
});

test('but if the user edited the English first, অ translates the edited text', async () => {
  await install();
  const page = await open(BN3);
  try {
    await command(ext, page, 'to-english');
    assert.ok(await waitFor(async () => (await value(page)) === EN3));
    await page.evaluate(t => mimic.setText(t), EN3_EDITED);
    await command(ext, page, 'to-bangla');
    assert.ok(await waitFor(async () => (await value(page)) === BN3_EDITED, { timeout: 4000 }), await value(page));
  } finally { await page.close(); }
});

test('Banglish, EN, then অ gives the Bangla form of what was typed', async () => {
  await install();
  const page = await open('ami bhalo achi');
  try {
    await command(ext, page, 'to-english');
    // The stand-in has no entry for it, so it answers "?" + the Bangla it was given.
    assert.ok(await waitFor(async () => (await value(page)).startsWith('?')), await value(page));
    await page.waitForTimeout(300);
    await command(ext, page, 'to-bangla');
    assert.ok(await waitFor(async () => (await value(page)) === 'আমি ভালো আছি', { timeout: 4000 }), await value(page));
  } finally { await page.close(); }
});

test('Banglish, অ, then EN translates: it never hands the Banglish back', async () => {
  await install();
  const page = await open('ami bhalo achi');
  try {
    await command(ext, page, 'to-bangla');
    assert.ok(await waitFor(async () => (await value(page)) === 'আমি ভালো আছি'), await value(page));
    await page.waitForTimeout(300);
    await command(ext, page, 'to-english');
    // The stand-in answers "?" + whatever Bangla it was asked to translate.
    assert.ok(await waitFor(async () => (await value(page)) === '?আমি ভালো আছি', { timeout: 4000 }), await value(page));
  } finally { await page.close(); }
});

test('English, অ, then EN, untouched, gives back the English the user wrote', async () => {
  await install();
  const page = await open(EN3);
  try {
    await command(ext, page, 'to-bangla');
    assert.ok(await waitFor(async () => (await value(page)) === BN3_BACK), await value(page));
    await page.waitForTimeout(300);
    await command(ext, page, 'to-english');
    assert.ok(await waitFor(async () => (await value(page)) === EN3, { timeout: 4000 }), await value(page));
  } finally { await page.close(); }
});
