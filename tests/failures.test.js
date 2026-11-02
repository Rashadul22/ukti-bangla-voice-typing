// Task 10: every failure path ends with a message the user can act on, in
// the language they chose, and never with the control stuck.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, boxState, toast } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

let server, ext, port, cdpPort, off;
before(async () => {
  server = await serve();
  port = server.address().port;
  cdpPort = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdpPort}`] });
  await storage.set(ext.worker, { coachDone: true });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => {
  off?.close();
  off = await fakeSpeech(ext, cdpPort);
  await off.eval('__fake.dieInstantly(false); stopDictation(), true');
  await waitFor(() => off.eval('__fake.live().length === 0'));
});

const BENGALI = /[ঀ-৿]/;
const micLive = page => page.evaluate(() =>
  !!document.querySelector('[data-ukti="bar"]')?.shadowRoot.querySelector('.main.live'));

async function open(lang, text = '') {
  await storage.set(ext.worker, { uiLang: lang });
  const page = await ext.context.newPage();
  await page.goto(`http://127.0.0.1:${port}/textarea.html`);
  await page.waitForFunction(() => window.mimic);
  await page.evaluate(t => mimic.setText(t), text);
  return page;
}
async function dictate(page) {
  await page.keyboard.press('Control+Shift+Space');
  assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')), 'session live');
}
// Waits for a toast matching `re`, and returns it.
const said = (page, re, timeout = 4000) =>
  waitFor(async () => { const t = await toast(page); return re.test(t) ? t : null; }, { timeout });

const CASES = {
  'not-allowed': { bn: /মাইক্রোফোনের অনুমতি নাই/, en: /^Microphone access is blocked/ },
  'audio-capture': { bn: /মাইক্রোফোন পাওয়া যাচ্ছে না/, en: /^No microphone was found/ },
  'service-not-allowed': { bn: /ভয়েস সার্ভিস চালু হলো না/, en: /^The speech service would not start/ }
};

for (const [error, want] of Object.entries(CASES)) {
  for (const lang of ['bn', 'en']) {
    test(`speech error ${error} (${lang}): told plainly, mic off, engine stopped`, async () => {
      const page = await open(lang);
      try {
        await dictate(page);
        await off.eval(`__fake.fail(${JSON.stringify(error)})`);
        const message = await said(page, want[lang]);
        assert.ok(message, `toast was: ${await toast(page)}`);
        if (lang === 'en') assert.equal(BENGALI.test(message), false, message);
        assert.equal(await micLive(page), false);
        assert.equal(await off.eval('state.desired'), false);
      } finally { await page.close(); }
    });
  }
}

for (const lang of ['bn', 'en']) {
  test(`offline (${lang}): said at the first network error, keeps trying, recovers`, async () => {
    const page = await open(lang);
    try {
      await dictate(page);
      await off.eval('__fake.fail("network")');
      const message = await said(page, lang === 'en' ? /^No internet/ : /ইন্টারনেট নাই/);
      assert.ok(message, `toast was: ${await toast(page)}`);
      assert.equal(await off.eval('state.desired'), true, 'gave up after one network error');
      assert.ok(await waitFor(() => off.eval('__fake.live().length === 1'), { timeout: 6000 }), 'no retry');
      await off.eval('__fake.say("ফিরে এসেছি")');
      assert.ok(await waitFor(async () => (await boxState(page)).dom === 'ফিরে এসেছি'));
    } finally { await page.close(); }
  });
}

test('offline for good (en): after the retry limit, a final message and the mic off', async () => {
  const page = await open('en');
  try {
    await dictate(page);
    await off.eval('state.networkErrors = 9; __fake.fail("network")');
    const message = await said(page, /internet/i, 6000);
    assert.ok(message && !BENGALI.test(message), `toast was: ${await toast(page)}`);
    assert.ok(await waitFor(async () => !(await micLive(page))));
  } finally { await page.close(); }
});

for (const lang of ['bn', 'en']) {
  test(`rate-limited (${lang}): says so, and has a restart queued rather than giving up`, async () => {
    const page = await open(lang);
    try {
      await off.eval('__fake.dieInstantly(true), true');
      await page.keyboard.press('Control+Shift+Space');
      const message = await said(page, lang === 'en' ? /speech service needs a short break/ : /বিশ্রাম/, 8000);
      assert.ok(message, `toast was: ${await toast(page)}`);
      assert.equal(await off.eval('state.desired'), true);
      assert.equal(await off.eval('state.restartTimer !== null && state.cooldownUntil > Date.now()'), true,
        'no restart queued after the cooldown');
    } finally {
      await off.eval('__fake.dieInstantly(false), true');
      await page.close();
    }
  });
}

for (const lang of ['bn', 'en']) {
  test(`language pack missing (${lang}): the EN button says to open setup, box untouched`, async () => {
    const page = await open(lang, 'আমি ভালো আছি');
    try {
      await page.keyboard.press('Control+Shift+KeyE');
      const message = await said(page, lang === 'en' ? /language pack/ : /ভাষা প্যাক/, 8000);
      assert.ok(message, `toast was: ${await toast(page)}`);
      assert.equal((await boxState(page)).dom, 'আমি ভালো আছি');
    } finally { await page.close(); }
  });
}

for (const lang of ['bn', 'en']) {
  test(`no Translator API (${lang}): says Chrome is too old, not that a pack is missing`, async () => {
    await off.eval('delete self.Translator; true');
    const page = await open(lang, 'আমি ভালো আছি');
    try {
      await page.keyboard.press('Control+Shift+KeyE');
      const message = await said(page, lang === 'en' ? /Chrome 138/ : /Chrome 138/, 8000);
      assert.ok(message, `toast was: ${await toast(page)}`);
    } finally { await page.close(); }
  });
}

test('the offscreen document fails to create (en): a readable message, nothing stuck', async () => {
  await ext.worker.evaluate(() => {
    self.__realCreate = chrome.offscreen.createDocument;
    chrome.offscreen.createDocument = () => Promise.reject(new Error('Only a single offscreen document may be created.'));
  });
  off?.close(); off = null;
  await ext.worker.evaluate(() => chrome.offscreen.closeDocument().catch(() => {}));
  const page = await open('en');
  try {
    await page.keyboard.press('Control+Shift+Space');
    const message = await said(page, /could not start/i);
    assert.ok(message && !BENGALI.test(message), `toast was: ${await toast(page)}`);
    assert.equal(await micLive(page), false);
  } finally {
    await ext.worker.evaluate(() => { chrome.offscreen.createDocument = self.__realCreate; });
    await page.close();
  }
});

test('reconnecting is said in English when the setting is English', async () => {
  const page = await open('en');
  try {
    await dictate(page);
    await off.eval('__fake.fail("aborted-by-test")');
    const message = await said(page, /./, 4000);
    assert.equal(BENGALI.test(message || ''), false, `toast was: ${message}`);
  } finally { await page.close(); }
});
