// The new settings reach storage from the popup and the corrections page,
// and the start and stop sound plays when chosen.

const nodeTest = require('node:test');
const { before, after } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, command } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

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

test('popup: the new switches and choices save', async () => {
  await storage.set(ext.worker, { voiceCommands: true, mixedEnglish: false, sounds: false, digits: 'asis', recogLang: 'bn-BD' });
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('popup.html'));
    await page.locator('.tabs button').nth(2).click();
    await page.waitForTimeout(300);
    for (const id of ['voiceCommands', 'mixedEnglish', 'sounds']) await page.click(`label:has(#${id})`);
    await page.click('#digitsSeg button[data-v="bn"]');
    await page.click('#recogSeg button[data-v="bn-IN"]');
    const want = { voiceCommands: false, mixedEnglish: true, sounds: true, digits: 'bn', recogLang: 'bn-IN' };
    const same = async () => { const got = await storage.get(ext.worker, Object.keys(want)); return Object.keys(want).every(k => got[k] === want[k]); };
    assert.ok(await waitFor(same), JSON.stringify(await storage.get(ext.worker, Object.keys(want))));
  } finally { await page.close(); }
});

test('corrections page: snippets are edited, saved and shown again', async () => {
  await storage.set(ext.worker, { snippets: [] });
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('words.html#snippets'));
    await page.fill('#snipList', 'আমার ঠিকানা = বাড়ি ১২, রোড ৩\nভুল লাইন\nআমার ইমেইল = me@example.com');
    const want = [{ say: 'আমার ঠিকানা', text: 'বাড়ি ১২, রোড ৩' }, { say: 'আমার ইমেইল', text: 'me@example.com' }];
    assert.ok(await waitFor(async () => JSON.stringify((await storage.get(ext.worker, 'snippets')).snippets) === JSON.stringify(want)));
    await page.reload();
    assert.equal(await page.inputValue('#snipList'), 'আমার ঠিকানা = বাড়ি ১২, রোড ৩\nআমার ইমেইল = me@example.com');
  } finally { await page.close(); }
});

test('the start and stop sound plays only when chosen', async () => {
  for (const sounds of [false, true]) {
    await storage.set(ext.worker, { sounds });
    await off.eval('stopDictation(), true');
    const page = await ext.context.newPage();
    try {
      await page.goto(`${base}/textarea.html`);
      await page.waitForFunction(() => window.mimic);
      await page.click('#ed');
      await command(ext, page, 'toggle-dictation');
      assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')));
      await page.waitForTimeout(300);
      const tone = await page.evaluate(() => document.querySelector('[data-ukti="bar"]').dataset.tone || null);
      assert.equal(tone, sounds ? 'start' : null);
    } finally { await page.close(); }
  }
});
