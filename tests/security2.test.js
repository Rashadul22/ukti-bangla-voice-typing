// Security, second pass: a compromised renderer. Chromium's guidance is to
// treat content scripts as less trustworthy, because a page that takes over
// its renderer can send any message a content script could. These tests
// send such messages from a tab context (an extension page in a tab has the
// same sender shape as a content script: it has sender.tab) and check that
// only the service worker can drive the microphone, only the offscreen
// document can speak for it, and the page cannot be fed words that belong
// to no session. Plus: Chrome itself refuses network from Ukti's pages.

const nodeTest = require('node:test');
const { before, after, beforeEach } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serve, launch, storage, waitFor, command, ROOT } = require('./helpers');
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
beforeEach(async () => { await off.eval('stopDictation(), true'); });

// Ukti has no "tabs" permission, so a tab's URL reads as null: a page's own
// id comes from tabs.getCurrent(), the victim's from the live session.
const ownTabId = page => page.evaluate(() => chrome.tabs.getCurrent().then(t => t.id));
const sessionTabId = () => off.eval('state.tabId');

test('the manifest forbids network from every extension page (connect-src none)', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const csp = m.content_security_policy?.extension_pages || '';
  for (const d of ["script-src 'self'", "object-src 'none'", "connect-src 'none'", "base-uri 'none'", "form-action 'none'"])
    assert.ok(csp.includes(d), `missing ${d}: ${csp}`);
});

test('Chrome enforces it: a fetch from the popup is refused by the policy', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('popup.html'));
    const r = await page.evaluate(() => new Promise(done => {
      let violated = null;
      document.addEventListener('securitypolicyviolation', e => { violated = e.effectiveDirective; });
      fetch('https://example.com/').then(() => done({ ok: true, violated }), () => setTimeout(() => done({ ok: false, violated }), 100));
    }));
    assert.equal(r.ok, false);
    assert.equal(r.violated, 'connect-src');
  } finally { await page.close(); }
});

test('a tab context cannot start the microphone by talking to the offscreen document directly', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('setup.html'));
    const tabId = await ownTabId(page);
    assert.ok(Number.isInteger(tabId));
    await page.evaluate(id => chrome.runtime.sendMessage({ target: 'offscreen', type: 'START_DICTATION', tabId: id, frameId: 0,
      sessionId: 'forged', epoch: 999, settings: {} }).catch(() => {}), tabId);
    await page.waitForTimeout(800);
    assert.equal(await off.eval('__fake.live().length'), 0, 'the microphone started');
  } finally { await page.close(); }
});

async function victimListening() {
  const victim = await ext.context.newPage();
  await victim.goto(`${base}/textarea.html`);
  await victim.waitForFunction(() => window.mimic);
  await victim.evaluate(() => { mimic.setText(''); mimic.el.focus(); });
  await command(ext, victim, 'toggle-dictation');
  assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')));
  return victim;
}

test('a tab context cannot pose as the offscreen document to put words in another tab', async () => {
  const victim = await victimListening();
  const attacker = await ext.context.newPage();
  try {
    await attacker.goto(ext.extUrl('setup.html'));
    const victimTab = await sessionTabId();
    assert.ok(Number.isInteger(victimTab));
    const sid = await off.eval('state.sessionId');
    await attacker.evaluate(([id, s]) => chrome.runtime.sendMessage({ source: 'ukti-offscreen', type: 'FINAL_RESULT', tabId: id, frameId: 0,
      sessionId: s, text: 'ভুয়া কথা' }).catch(() => {}), [victimTab, sid]);
    await victim.waitForTimeout(800);
    assert.equal((await victim.evaluate(() => mimic.el.value)).includes('ভুয়া'), false, 'the forged words went in');
  } finally { await attacker.close(); await victim.close(); }
});

test('the page ignores dictation results that belong to no session', async () => {
  const victim = await victimListening();
  try {
    const victimTab = await sessionTabId();
    assert.ok(Number.isInteger(victimTab));
    await ext.worker.evaluate(id => chrome.tabs.sendMessage(id, { source: 'ukti-background', type: 'FINAL_RESULT', text: 'ভুয়া কথা' }, { frameId: 0 }).catch(() => {}), victimTab);
    await victim.waitForTimeout(500);
    assert.equal((await victim.evaluate(() => mimic.el.value)).includes('ভুয়া'), false);
  } finally { await victim.close(); }
});

test('an oversized repair request is refused quickly instead of tying up the engine', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('setup.html'));
    const r = await page.evaluate(async () => {
      const t0 = performance.now();
      const reply = await chrome.runtime.sendMessage({ type: 'REPAIR_WORDS', text: 'শকাল '.repeat(40000) });
      return { ms: performance.now() - t0, ok: reply?.ok, error: reply?.error };
    });
    assert.ok(r.ms < 1500, `${Math.round(r.ms)} ms`);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'TOO_LONG');
  } finally { await page.close(); }
});

test('a tab in the background cannot start the microphone', async () => {
  const hidden = await ext.context.newPage();
  await hidden.goto(ext.extUrl('setup.html'));
  const front = await ext.context.newPage();
  try {
    await front.goto(ext.extUrl('popup.html'));
    await front.bringToFront();
    await hidden.waitForTimeout(200);
    const reply = await hidden.evaluate(() => chrome.runtime.sendMessage({ type: 'START_DICTATION', sessionId: 'bg', epoch: 1 }));
    await hidden.waitForTimeout(600);
    assert.equal(reply?.ok, false, JSON.stringify(reply));
    assert.equal(await off.eval('__fake.live().length'), 0, 'a background tab started the microphone');
  } finally { await front.close(); await hidden.close(); }
});
