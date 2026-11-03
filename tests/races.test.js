// Task 4: races in the dictation flow, through the real service worker and
// offscreen document with a fake recogniser.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, boxState, toast, command } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

let server, ext, port, cdpPort, off;
before(async () => {
  server = await serve();
  port = server.address().port;
  cdpPort = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdpPort}`] });
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn' });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => {
  off?.close();
  off = await fakeSpeech(ext, cdpPort);
  await off.eval('stopDictation(), true');
  await waitFor(() => off.eval('__fake.live().length === 0'));
});

const url = path => `http://127.0.0.1:${port}/${path}`;
const engine = () => off.eval('({ desired: state.desired, live: __fake.live().length, session: state.sessionId, tab: state.tabId })');
const micLive = page => page.evaluate(() =>
  !!document.querySelector('[data-ukti="bar"]')?.shadowRoot.querySelector('.main.live'));

async function open(path = 'textarea.html') {
  const page = await ext.context.newPage();
  await page.goto(url(path));
  await page.waitForFunction(() => window.mimic);
  await page.click('#ed');
  return page;
}

// After the dust settles, the button and the engine must agree.
async function settled(page) {
  await page.waitForTimeout(900);
  return { ui: await micLive(page), engine: (await engine()).desired, live: (await engine()).live };
}

test('start then stop, pressed back to back, ends stopped', async () => {
  const page = await open();
  try {
    await command(ext, page, 'toggle-dictation');
    await command(ext, page, 'toggle-dictation');
    assert.deepEqual(await settled(page), { ui: false, engine: false, live: 0 });
  } finally { await page.close(); }
});

test('three presses back to back end listening, with one session', async () => {
  const page = await open();
  try {
    for (let i = 0; i < 3; i++) await command(ext, page, 'toggle-dictation');
    assert.deepEqual(await settled(page), { ui: true, engine: true, live: 1 });
  } finally { await page.close(); }
});

// The invariant, not the parity: at 7 and 10 presses Playwright now and
// then loses a keystroke before it reaches the page (seen in a log: ten
// presses, nine keydowns), so the expected end state cannot be derived
// from the count. What must hold whatever arrives is that the button and
// the engine agree and that there is never a second session.
for (const presses of [4, 7, 10]) {
  test(`${presses} rapid presses: the button and the engine agree, never two sessions`, async () => {
    const page = await open();
    try {
      for (let i = 0; i < presses; i++) await command(ext, page, 'toggle-dictation');
      const s = await settled(page);
      assert.equal(s.ui, s.engine, `button ${s.ui ? 'on' : 'off'}, engine ${s.engine ? 'on' : 'off'}`);
      assert.equal(s.live, s.engine ? 1 : 0, `${s.live} live sessions`);
    } finally { await page.close(); }
  });
}

test('a second tab taking over tells the first one it has stopped', async () => {
  const a = await open();
  const b = await open();
  try {
    await a.bringToFront();
    await command(ext, a, 'toggle-dictation');
    assert.ok(await waitFor(() => micLive(a)));
    await b.bringToFront();
    await command(ext, b, 'toggle-dictation');
    assert.ok(await waitFor(() => micLive(b)));
    assert.ok(await waitFor(async () => !(await micLive(a)), { timeout: 2000 }), 'tab A still shows a live mic');
    assert.equal(await waitFor(() => toast(a)), 'অন্য ট্যাবে বলা শুরু হয়েছে, এখানে থামানো হলো');
    const e = await engine();
    assert.equal(e.live, 1);
    await off.eval('__fake.say("দ্বিতীয় ট্যাব")');
    assert.ok(await waitFor(async () => (await boxState(b)).dom === 'দ্বিতীয় ট্যাব'));
    assert.equal((await boxState(a)).dom, '');
  } finally { await Promise.all([a.close(), b.close()]); }
});

test("the first tab's stop does not stop the second tab's dictation", async () => {
  const a = await open();
  const b = await open();
  try {
    await a.bringToFront();
    await command(ext, a, 'toggle-dictation');
    assert.ok(await waitFor(() => micLive(a)));
    await b.bringToFront();
    await command(ext, b, 'toggle-dictation');
    assert.ok(await waitFor(() => micLive(b)));
    // A's page goes away, which sends its own stop.
    await a.goto(url('plain.html'));
    await a.waitForTimeout(600);
    const e = await engine();
    assert.equal(e.desired, true, 'B was stopped by A');
    assert.equal(e.live, 1);
  } finally { await Promise.all([a.close(), b.close()]); }
});

test('words the service hands back after stop still land in the box', async () => {
  const page = await open();
  try {
    await off.eval('__fake.slowEnd(400), true');
    await command(ext, page, 'toggle-dictation');
    assert.ok(await waitFor(() => micLive(page)));
    await off.eval('__fake.say("শেষ কথা", false)');
    await command(ext, page, 'toggle-dictation');
    await page.waitForTimeout(80);
    await off.eval('__fake.sayLast("শেষ কথা")');
    assert.ok(await waitFor(async () => (await boxState(page)).dom === 'শেষ কথা'), (await boxState(page)).dom);
    assert.deepEqual(await settled(page), { ui: false, engine: false, live: 0 });
  } finally { await page.close(); }
});

test('the offscreen document torn down mid-dictation: the button recovers on the next press', async () => {
  const page = await open();
  try {
    await command(ext, page, 'toggle-dictation');
    assert.ok(await waitFor(() => micLive(page)));
    off.close(); off = null;
    await ext.worker.evaluate(() => chrome.offscreen.closeDocument());
    await command(ext, page, 'toggle-dictation');
    await page.waitForTimeout(400);
    assert.equal(await micLive(page), false);
    assert.equal(await ext.worker.evaluate(() => hasOffscreenDocument()), false, 'stop must not create a document');
  } finally { await page.close(); }
});
