// Task 3: what happens to the content script's state over the life of a
// page. Dictation runs through the real service worker and offscreen
// document with a fake recogniser (tests/speech.js).

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, boxState, toast, barShown } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

let server, ext, port, cdpPort, off;
before(async () => {
  server = await serve();
  port = server.address().port;
  cdpPort = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdpPort}`, '--host-resolver-rules=MAP *.test 127.0.0.1'] });
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn' });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => {
  await storage.set(ext.worker, { enabled: true, disabledSites: [] });
  off?.close();
  off = await fakeSpeech(ext, cdpPort);
  await off.eval('stopDictation(), true');
});

const url = (path, host = '127.0.0.1') => `http://${host}:${port}/${path}`;
const listening = () => off.eval('state.desired === true && __fake.live().length > 0');
const idle = () => off.eval('state.desired === false && __fake.live().length === 0');

async function openAndDictate(path = 'textarea.html', box = '#ed') {
  const page = await ext.context.newPage();
  await page.goto(url(path));
  await page.waitForFunction(() => window.mimic);
  await page.click(box);
  await page.keyboard.press('Control+Shift+Space');
  assert.ok(await waitFor(listening), 'engine listening');
  return page;
}

test('navigating away mid-dictation stops the engine and the microphone', async () => {
  const page = await openAndDictate();
  try {
    await page.goto(url('plain.html'));
    assert.ok(await waitFor(idle, { timeout: 3000 }), 'engine still listening after the page left');
  } finally { await page.close(); }
});

test('closing the tab mid-dictation stops the engine', async () => {
  const page = await openAndDictate();
  await page.close();
  assert.ok(await waitFor(idle, { timeout: 3000 }), 'engine still listening after the tab closed');
});

test('a result for a removed iframe stops the engine', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(url('frame-host.html?src=' + encodeURIComponent(url('textarea.html', 'b.test')), 'a.test'));
    const frame = await waitFor(() => page.frames().find(f => f !== page.mainFrame() && f.url().includes('b.test')));
    await frame.waitForFunction(() => window.mimic);
    await frame.click('#ed');
    await page.keyboard.press('Control+Shift+Space');
    assert.ok(await waitFor(listening));
    await page.evaluate(() => document.getElementById('frame').remove());
    await off.eval('__fake.say("হ্যালো")');
    assert.ok(await waitFor(idle, { timeout: 3000 }), 'engine kept listening for a frame that is gone');
  } finally { await page.close(); }
});

test('the box removed mid-dictation: the words stay in the preview and the user is told', async () => {
  const page = await openAndDictate('two-boxes.html', '#b');
  try {
    await page.click('#remove');
    await off.eval('__fake.say("আমি আছি")');
    assert.equal(await waitFor(() => toast(page)), 'বক্সটা আর নাই, লেখাটা প্রিভিউতে আছে');
    const preview = await page.evaluate(() =>
      document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.preview').textContent);
    assert.ok(preview.includes('আমি আছি'), preview);
  } finally { await page.close(); }
});

test('the service worker terminated mid-dictation: results still arrive, stop still works', async () => {
  const page = await openAndDictate();
  try {
    const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    const sw = list.find(t => t.type === 'service_worker');
    await fetch(`http://127.0.0.1:${cdpPort}/json/close/${sw.id}`);
    await page.waitForTimeout(300);
    await off.eval('__fake.say("আবার এসেছি")');
    assert.ok(await waitFor(async () => (await boxState(page)).dom === 'আবার এসেছি'), 'result after SW restart');
    await page.keyboard.press('Control+Shift+Space');
    assert.ok(await waitFor(idle), 'stop after SW restart');
  } finally {
    await page.close();
    ext.worker = await waitFor(() => ext.context.serviceWorkers()[0]) || await ext.context.waitForEvent('serviceworker');
  }
});

test('undo skips an entry whose box has gone instead of giving up', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(url('two-boxes.html'));
    await page.waitForFunction(() => window.mimic);
    await page.click('#a'); await page.keyboard.type('ami');
    await page.keyboard.press('Control+Shift+KeyB');
    assert.ok(await waitFor(() => page.evaluate(() => document.getElementById('a').value === 'আমি')));
    await page.click('#b'); await page.keyboard.type('tumi');
    await page.keyboard.press('Control+Shift+KeyB');
    assert.ok(await waitFor(() => page.evaluate(() => document.getElementById('b').value === 'তুমি')));
    await page.click('#remove');
    await page.click('#a');
    await page.keyboard.press('Control+Shift+KeyZ');
    assert.ok(await waitFor(() => page.evaluate(() => document.getElementById('a').value === 'ami'), { timeout: 3000 }),
      `box a: ${await page.inputValue('#a')}, toast: ${await toast(page)}`);
  } finally { await page.close(); }
});

test('the undo stack is bounded at 20 entries', async () => {
  const page = await openAndDictate();
  try {
    for (let i = 1; i <= 25; i++) await off.eval(`__fake.say("শব্দ${i}")`);
    assert.ok(await waitFor(async () => (await boxState(page)).dom.endsWith('শব্দ25')));
    await page.keyboard.press('Control+Shift+Space');
    await waitFor(idle);
    let undone = 0;
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Control+Shift+KeyZ');
      const said = await waitFor(() => toast(page).then(t => /ফেরত নেওয়া হলো|ফেরত নেওয়ার কিছু নাই/.test(t) ? t : null));
      if (said === 'ফেরত নেওয়ার কিছু নাই') break;
      undone++;
      await page.waitForTimeout(250);
      await page.evaluate(() => document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.toast').classList.remove('on'));
    }
    assert.equal(undone, 20);
    assert.equal((await boxState(page)).dom, 'শব্দ1 শব্দ2 শব্দ3 শব্দ4 শব্দ5');
  } finally { await page.close(); }
});

test('off for a site also covers the cross-origin iframes inside it', async () => {
  await storage.set(ext.worker, { disabledSites: ['a.test'] });
  const page = await ext.context.newPage();
  try {
    await page.goto(url('frame-host.html?src=' + encodeURIComponent(url('textarea.html', 'b.test')), 'a.test'));
    const frame = await waitFor(() => page.frames().find(f => f !== page.mainFrame() && f.url().includes('b.test')));
    await frame.waitForFunction(() => window.mimic);
    await frame.click('#ed');
    await page.waitForTimeout(600);
    assert.equal(await barShown(frame), false, 'control showed inside a.test through its b.test iframe');
  } finally { await page.close(); }
});

test('the same iframe on a site that is on still gets the control', async () => {
  await storage.set(ext.worker, { disabledSites: ['a.test'] });
  const page = await ext.context.newPage();
  try {
    await page.goto(url('frame-host.html?src=' + encodeURIComponent(url('textarea.html', 'b.test')), 'c.test'));
    const frame = await waitFor(() => page.frames().find(f => f !== page.mainFrame() && f.url().includes('b.test')));
    await frame.waitForFunction(() => window.mimic);
    await frame.click('#ed');
    assert.ok(await waitFor(() => barShown(frame)));
  } finally { await page.close(); }
});

test('a cancelled drag does not leave the control following the pointer', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(url('textarea.html'));
    await page.waitForFunction(() => window.mimic);
    await page.click('#ed');
    assert.ok(await waitFor(() => barShown(page)));
    const moved = await page.evaluate(async () => {
      const root = document.querySelector('[data-ukti="bar"]').shadowRoot;
      const bar = root.querySelector('.bar');
      const mic = root.querySelector('.main');
      const r = mic.getBoundingClientRect();
      const at = (type, x, y, target = document) => target.dispatchEvent(new PointerEvent(type,
        { bubbles: true, composed: true, button: 0, clientX: x, clientY: y, pointerId: 1 }));
      at('pointerdown', r.x + 5, r.y + 5, mic);
      at('pointermove', r.x + 30, r.y + 5);          // a real drag starts
      at('pointercancel', r.x + 30, r.y + 5);        // and the browser cancels it
      const before = bar.style.right;
      at('pointermove', r.x - 200, r.y - 200);       // no button held now
      return { before, after: bar.style.right };
    });
    assert.equal(moved.after, moved.before, `control moved from ${moved.before} to ${moved.after} after the drag was cancelled`);
  } finally { await page.close(); }
});

// Runs last: it reloads the extension, which ends this file's offscreen
// document and service worker.
test('after the extension is reloaded, an open page still converts Banglish and says why the mic is out', async () => {
  const page = await ext.context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(url('textarea.html'));
    await page.waitForFunction(() => window.mimic);
    await page.click('#ed');
    await page.keyboard.type('ami bangla');
    off?.close(); off = null;
    await ext.worker.evaluate(() => chrome.runtime.reload()).catch(() => {});
    await page.waitForTimeout(1200);

    await page.keyboard.press('Control+Shift+KeyB');
    assert.ok(await waitFor(async () => (await boxState(page)).dom === 'আমি বাংলা', { timeout: 3000 }),
      `box: ${(await boxState(page)).dom}`);
    await page.keyboard.press('Control+Shift+Space');
    assert.equal(await waitFor(() => toast(page).then(t => t.includes('F5') ? t : null)),
      'উক্তি আবার লোড হয়েছে, পেজটা রিফ্রেশ করুন (F5)');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
