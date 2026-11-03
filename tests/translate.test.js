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
  const table = { 'bn>en': { ${JSON.stringify(BN)}: ${JSON.stringify(EN)}, ${JSON.stringify(BN2)}: ${JSON.stringify(EN2)} },
                  'en>bn': { ${JSON.stringify(EN)}: ${JSON.stringify(BN)}, ${JSON.stringify(EN2)}: ${JSON.stringify(BN2)} } };
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
