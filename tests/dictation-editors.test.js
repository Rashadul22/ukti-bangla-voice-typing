// Dictation into every editor archetype: each final sentence must land
// exactly once, in order. The author saw one dictated line come out twice
// on Gemini and three times on WhatsApp. tests/pages/quill-late.html and
// lexical-async.html reproduce those two; the rest guard the others.

const nodeTest = require('node:test');
const { before, after, beforeEach } = nodeTest;
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
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn', voiceCommands: true, outputMode: 'bangla' });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => { await off.eval('stopDictation(), true'); });

const norm = s => String(s).replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

for (const file of ['lexical-async', 'quill-late', 'model-paste', 'quill', 'plain', 'textarea', 'late-selection', 'caret-restore']) {
  test(`${file}: each dictated sentence lands exactly once, in order`, async () => {
    const page = await ext.context.newPage();
    try {
      await page.goto(`${base}/${file}.html`);
      await page.waitForFunction(() => window.mimic);
      await page.evaluate(() => mimic.setText(''));
      await page.evaluate(() => mimic.el.focus());
      await command(ext, page, 'toggle-dictation');
      assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')), 'not listening');
      await page.waitForTimeout(200);

      await off.eval('__fake.say("আমি ভালো আছি")');
      await page.waitForTimeout(700);
      assert.equal(norm(await page.evaluate(() => mimic.model())), 'আমি ভালো আছি', 'first sentence');

      // Two sentences in quick succession: still once each, in order.
      await off.eval('__fake.say("তুমি কেমন")');
      await off.eval('__fake.say("ভালো থেকো")');
      await page.waitForTimeout(1200);
      assert.equal(norm(await page.evaluate(() => mimic.model())), 'আমি ভালো আছি তুমি কেমন ভালো থেকো');
      // And what the page shows agrees with what the editor holds.
      assert.equal(norm(await page.evaluate(() => mimic.el.value ?? mimic.el.innerText)), 'আমি ভালো আছি তুমি কেমন ভালো থেকো');
    } finally { await page.close(); }
  });
}
