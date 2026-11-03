// Task 9: the performance budget from PERF.md, held as tests. Numbers that
// depend on the machine get generous ceilings; numbers that should be zero
// are held at zero.

const nodeTest = require('node:test');
const { before, after } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 120000 }, fn);
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { serve, launch, storage, waitFor, barShown } = require('./helpers');
const { idleCost, heapAfterGc, evalCost, loadMessages, shadowNodes } = require('./perf');

let server, base, ext, plain;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  ext = await launch();
  plain = await chromium.launch();
  await storage.set(ext.worker, { coachDone: true });
});
after(async () => { await plain?.close(); await ext?.close(); server?.close(); });

const IDLE_ZERO = { layouts: 0, styleRecalcs: 0, mutations: 0 };

test('idle, control never shown: no script, no layout, no style work, no mutations', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${base}/blank.html`);
  const c = await idleCost(page);
  await page.close();
  assert.deepEqual({ layouts: c.layouts, styleRecalcs: c.styleRecalcs, mutations: c.mutations }, IDLE_ZERO);
  assert.ok(c.scriptMs <= 1, `script ${c.scriptMs} ms over 3 s idle`);
});

test('idle, control shown and left alone: the same', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${base}/textarea.html`);
  await page.click('#ed');
  assert.ok(await waitFor(() => barShown(page)));
  // Left alone with focus still in the box, so the control stays up. (Focus
  // elsewhere now hides it after two seconds, which is one change, not idle.)
  await page.mouse.move(5, 5);
  const c = await idleCost(page);
  await page.close();
  assert.deepEqual({ layouts: c.layouts, styleRecalcs: c.styleRecalcs, mutations: c.mutations }, IDLE_ZERO);
  assert.ok(c.scriptMs <= 1, `script ${c.scriptMs} ms over 3 s idle`);
});

test('page load sends the service worker nothing, however many frames', async () => {
  assert.deepEqual(await loadMessages(ext, `${base}/blank.html`), []);
  assert.equal((await loadMessages(ext, `${base}/frames.html?n=10`)).length, 0);
});

test('shadow DOM stays at 55 elements or fewer', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${base}/textarea.html`);
  await page.click('#ed');
  assert.ok(await waitFor(() => barShown(page)));
  const n = await shadowNodes(page);
  await page.close();
  assert.ok(n <= 55, `${n} elements`);
});

test('parse and execute of both content scripts: median under 8 ms', async () => {
  const c = await evalCost(plain, base, 9);
  assert.ok(c.banglishMedianMs + c.contentMedianMs < 8, JSON.stringify(c));
});

async function perFrameKB(path, frames) {
  const a = await ext.context.newPage(); await a.goto(`${base}/${path}`); await a.waitForTimeout(1500);
  const b = await plain.newPage(); await b.goto(`${base}/${path}`); await b.waitForTimeout(1500);
  const kb = ((await heapAfterGc(a)) - (await heapAfterGc(b))) / (frames + 1) / 1024;
  await a.close(); await b.close();
  return kb;
}

// 178.6 KB of each frame is Chrome's isolated world, which any content
// script costs (measured with empty scripts). The budget is the floor plus
// what Ukti itself may add.
test('heap per ordinary frame: at most 250 KB (floor 179, Ukti about 57)', async () => {
  const kb = await perFrameKB('frames.html?n=20', 20);
  assert.ok(kb <= 250, `${kb.toFixed(1)} KB per frame`);
});

test('a frame too small to hold a text box costs less than an ordinary one', async () => {
  const tiny = await perFrameKB('tiny-frames.html', 21);
  const ordinary = await perFrameKB('frames.html?n=20', 20);
  assert.ok(tiny < ordinary - 20, `tiny ${tiny.toFixed(1)} KB, ordinary ${ordinary.toFixed(1)} KB`);
});

test('a frame that starts tiny and grows still gets the control', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(`${base}/tiny-frames.html`);
    await page.evaluate(() => { const f = document.getElementById('grow'); f.style.width = '500px'; f.style.height = '200px'; });
    const frame = await waitFor(() => page.frames().find(f => f.url().endsWith('/textarea.html')));
    await frame.waitForFunction(() => window.mimic);
    await page.waitForTimeout(300);
    await frame.click('#ed');
    assert.ok(await waitFor(() => barShown(frame)), 'no control in the grown frame');
  } finally { await page.close(); }
});

test('heavy page (16,000 elements): focus to control under 25 ms of script', async () => {
  const page = await ext.context.newPage();
  await page.goto(`${base}/heavy.html`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  const a = await m();
  await page.click('#ed');
  assert.ok(await waitFor(() => barShown(page)));
  const b = await m();
  await page.close();
  const ms = (b.ScriptDuration - a.ScriptDuration) * 1000;
  assert.ok(ms < 25, `${ms.toFixed(2)} ms`);
});

// Measured 3 November, when a refresh felt slower: Chrome injects the content
// script around the page's load, and Ukti builds its control after it. With
// a box focused at load on a 16,000-element page, the load event saw one
// layout pass with Ukti, as without. This keeps setup off the load path.
test('the control is set up after the page has loaded, not before', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(`${base}/heavy-focused.html`);
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'load' });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    await cdp.detach();
    assert.ok(m.LayoutCount <= 2, `${m.LayoutCount} layout passes by the load event`);
    assert.ok(await waitFor(() => barShown(page), { timeout: 4000 }), 'the focused box never got the control');
  } finally { await page.close(); }
});
