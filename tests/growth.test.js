// What helps Ukti spread, without a server and without nagging:
//  1. "বলে দেখুন": the setup page has a box to try speaking at once, over
//     the same path as any page (no new permission, no new network path).
//  2. "বন্ধুকে জানান": copies a short message to the clipboard. Nothing is
//     sent; the user pastes it wherever they like.
//  3. A rating request in the popup, once in a lifetime, after real use,
//     and only when there is a store page to send people to.

const nodeTest = require('node:test');
const { before, after, beforeEach } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const { launch, storage, waitFor } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

let ext, off;
before(async () => {
  const cdp = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdp}`] });
  off = await fakeSpeech(ext, cdp);
  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write']);
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); });
beforeEach(async () => { await off.eval('stopDictation(), true'); await storage.set(ext.worker, { uiLang: 'bn' }); });

test('setup: the try-it box writes what was said, and the button stops it again', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('setup.html'));
    await page.waitForTimeout(300);
    assert.ok(await page.$('#tryStep #tryBox'), 'no try-it box');
    await page.click('#tryMic');
    assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')), 'did not start listening');
    await off.eval('__fake.say("আমি ভালো আছি", false)');
    assert.ok(await waitFor(() => page.evaluate(() => document.querySelector('#tryBox').textContent.includes('আমি ভালো'))), 'interim words not shown');
    await off.eval('__fake.say("আমি ভালো আছি")');
    assert.ok(await waitFor(() => page.evaluate(() => document.querySelector('#tryBox .said')?.textContent.includes('আমি ভালো আছি'))));
    await page.click('#tryMic');
    assert.ok(await waitFor(() => off.eval('__fake.live().length === 0')), 'did not stop');
  } finally { await page.close(); }
});

test('setup: closing the page stops a try-it dictation', async () => {
  const page = await ext.context.newPage();
  await page.goto(ext.extUrl('setup.html'));
  await page.click('#tryMic');
  assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')));
  await page.close();
  assert.ok(await waitFor(() => off.eval('__fake.live().length === 0')), 'the microphone stayed on');
});

for (const file of ['setup.html', 'popup.html']) {
  test(`${file}: "tell a friend" copies a message, and sends nothing`, async () => {
    const page = await ext.context.newPage();
    const requests = [];
    page.on('request', r => { if (!r.url().startsWith('chrome-extension://')) requests.push(r.url()); });
    try {
      await page.goto(ext.extUrl(file));
      await page.waitForTimeout(300);
      await page.click('#share');
      const text = await page.evaluate(() => navigator.clipboard.readText());
      assert.match(text, /উক্তি/);
      assert.ok(text.length > 40 && text.length < 400, text);
      assert.match(await page.textContent('#share'), /কপি/);
      assert.deepEqual(requests, []);
    } finally { await page.close(); }
  });
}

test('background counts each dictation started', async () => {
  await storage.set(ext.worker, { uses: 0 });
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('setup.html'));
    for (let i = 0; i < 2; i++) {
      await page.click('#tryMic');
      await waitFor(() => off.eval('__fake.live().length === 1'));
      await page.click('#tryMic');
      await waitFor(() => off.eval('__fake.live().length === 0'));
    }
    assert.equal((await storage.get(ext.worker, 'uses')).uses, 2);
  } finally { await page.close(); }
});

const rateShown = page => page.evaluate(() => { const r = document.querySelector('#rate'); return !!r && !r.hidden; });

test('popup: no rating request before real use, or when there is no store page', async () => {
  await storage.set(ext.worker, { uses: 3, rateDone: false });
  let page = await ext.context.newPage();
  await page.addInitScript(() => { window.UKTI_STORE_URL = 'https://chromewebstore.google.com/detail/example'; });
  await page.goto(ext.extUrl('popup.html'));
  await page.waitForTimeout(400);
  assert.equal(await rateShown(page), false, 'asked after 3 uses');
  await page.close();

  await storage.set(ext.worker, { uses: 40 });
  page = await ext.context.newPage();
  await page.goto(ext.extUrl('popup.html'));           // no store URL yet
  await page.waitForTimeout(400);
  assert.equal(await rateShown(page), false, 'asked with nowhere to send people');
  await page.close();
});

test('popup: asks once after 15 uses; either answer means never again', async () => {
  for (const answer of ['#rateLater', '#rateGo']) {
    await storage.set(ext.worker, { uses: 15, rateDone: false });
    let page = await ext.context.newPage();
    await page.addInitScript(() => { window.UKTI_STORE_URL = 'https://chromewebstore.google.com/detail/example'; });
    await page.goto(ext.extUrl('popup.html'));
    assert.ok(await waitFor(() => rateShown(page)), 'not asked after 15 uses');
    await page.evaluate(() => { window.__opened = []; chrome.tabs.create = o => { window.__opened.push(o.url); return Promise.resolve({}); }; });
    await page.click(answer);
    const opened = await page.evaluate(() => window.__opened);
    assert.deepEqual(opened, answer === '#rateGo' ? ['https://chromewebstore.google.com/detail/example'] : []);
    assert.ok(await waitFor(async () => (await storage.get(ext.worker, 'rateDone')).rateDone === true));
    await page.close();
    page = await ext.context.newPage();
    await page.addInitScript(() => { window.UKTI_STORE_URL = 'https://chromewebstore.google.com/detail/example'; });
    await page.goto(ext.extUrl('popup.html'));
    await page.waitForTimeout(400);
    assert.equal(await rateShown(page), false, 'asked twice');
    await page.close();
  }
});
