// The dictation pipeline end to end, with a fake recogniser and a real box:
// voice commands, snippets, English words in English letters, digits, and
// the recognition language.

const nodeTest = require('node:test');
const { before, after, beforeEach } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, command } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

let server, base, ext, off;
const RESET = { voiceCommands: true, snippets: [], mixedEnglish: false, digits: 'asis', recogLang: 'bn-BD', outputMode: 'bangla', cleanFillers: true, replacements: [] };
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  const cdp = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdp}`] });
  off = await fakeSpeech(ext, cdp);
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn' });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => { await off.eval('stopDictation(), true'); await storage.set(ext.worker, RESET); });

async function session(settings = {}) {
  await storage.set(ext.worker, settings);
  const page = await ext.context.newPage();
  await page.goto(`${base}/textarea.html`);
  await page.waitForFunction(() => window.mimic);
  await page.evaluate(() => { mimic.setText(''); mimic.el.focus(); });
  await command(ext, page, 'toggle-dictation');
  assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')), 'not listening');
  return page;
}
const value = page => page.evaluate(() => mimic.el.value);
async function say(page, text, want) {
  await off.eval(`__fake.say(${JSON.stringify(text)})`);
  const ok = await waitFor(async () => (await value(page)).normalize('NFC') === want.normalize('NFC'));
  assert.ok(ok, `after "${text}": ${JSON.stringify(await value(page))}, wanted ${JSON.stringify(want)}`);
}

test('a question mark said at the end of a sentence', async () => {
  const page = await session();
  try { await say(page, 'তুমি কেমন আছো প্রশ্নবোধক', 'তুমি কেমন আছো?'); } finally { await page.close(); }
});

test('দাঁড়ি said alone sticks to the sentence before it', async () => {
  const page = await session();
  try {
    await say(page, 'আমি ভালো আছি', 'আমি ভালো আছি');
    await say(page, 'দাঁড়ি', 'আমি ভালো আছি।');
    await say(page, 'তুমি', 'আমি ভালো আছি। তুমি');
  } finally { await page.close(); }
});

test('নতুন লাইন starts a new line', async () => {
  const page = await session();
  try {
    await say(page, 'প্রথম লাইন নতুন লাইন', 'প্রথম লাইন\n');
    await say(page, 'দ্বিতীয়', 'প্রথম লাইন\nদ্বিতীয়');
  } finally { await page.close(); }
});

test('মুছে দাও takes back the last sentence', async () => {
  const page = await session();
  try {
    await say(page, 'এক', 'এক');
    await say(page, 'দুই', 'এক দুই');
    await off.eval('__fake.say("মুছে দাও")');
    assert.ok(await waitFor(async () => (await value(page)) === 'এক'), await value(page));
  } finally { await page.close(); }
});

test('with voice commands off, the words are just words', async () => {
  const page = await session({ voiceCommands: false });
  try { await say(page, 'দাঁড়ি', 'দাঁড়ি'); } finally { await page.close(); }
});

test('a snippet: the trigger said alone puts in the saved text', async () => {
  const page = await session({ snippets: [{ say: 'আমার ঠিকানা', text: 'বাড়ি ১২, রোড ৩, ঢাকা' }] });
  try {
    await say(page, 'আমার ঠিকানা', 'বাড়ি ১২, রোড ৩, ঢাকা');
    await say(page, 'আমার ঠিকানা বদলেছে', 'বাড়ি ১২, রোড ৩, ঢাকা আমার ঠিকানা বদলেছে');
  } finally { await page.close(); }
});

test('English words in English letters, when chosen', async () => {
  const page = await session({ mixedEnglish: true });
  try { await say(page, 'আমি অফিসে আছি', 'আমি office এ আছি'); } finally { await page.close(); }
});

test('digits as chosen', async () => {
  const page = await session({ digits: 'bn' });
  try { await say(page, 'রুম 12', 'রুম ১২'); } finally { await page.close(); }
});

test('recognition language: Bangladesh by default, India when chosen', async () => {
  let page = await session();
  assert.equal(await off.eval('__fake.live()[0].lang'), 'bn-BD');
  await page.close();
  await off.eval('stopDictation(), true');
  page = await session({ recogLang: 'bn-IN' });
  try { assert.equal(await off.eval('__fake.live()[0].lang'), 'bn-IN'); } finally { await page.close(); }
});
