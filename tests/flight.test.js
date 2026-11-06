// The flight from the preview into the box, second version. Each word lifts
// off from exactly where it sits in the preview (a shared-element start),
// flies its own arc, staggered, with a short comet trail, into the box's
// text cursor, where a small spark marks the landing. One flight at a time,
// gone in well under a second and a quarter, nothing left running, and
// nothing at all under reduced motion (tests/preview.test.js).

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
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn', theme: 'glass', voiceCommands: true });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => { await off.eval('stopDictation(), true'); });

const H = '[data-ukti="bar"]';
async function listening(file) {
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto(`${base}/${file}`);
  await page.waitForFunction(() => window.mimic);
  await page.evaluate(() => { mimic.setText(''); mimic.el.focus(); });
  await command(ext, page, 'toggle-dictation');
  assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')), 'not listening');
  await page.waitForTimeout(300);
  return page;
}

// Watches the shadow root from the moment a flight appears: the chips'
// first positions next to the words they came from, how many trails, where
// the spark lands, and when it is all gone.
const watch = page => page.evaluate(h => new Promise(done => {
  const root = document.querySelector(h).shadowRoot;
  const out = { starts: null, trails: 0, spark: null, goneAt: null, t0: performance.now(), text: null };
  const seen = () => {
    const fly = root.querySelector('.fly');
    if (fly && !out.starts) {
      out.text = fly.textContent;
      const seg = root.querySelector('.preview .done .seg:last-child');
      const words = [...seg.textContent.matchAll(/\S+/g)];
      const node = seg.firstChild;
      out.starts = [...fly.querySelectorAll('.fly-w')].map((c, i) => {
        const r = c.getBoundingClientRect();
        const m = words[i]; const range = document.createRange();
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const w = range.getClientRects()[0];
        return { chip: c.textContent, word: m[0], dx: Math.round(r.left - w.left), dy: Math.round(r.top - w.top) };
      });
      out.trails = fly.querySelectorAll('.fly-t').length;
    }
    const spark = root.querySelector('.fly-spark');
    if (spark && !out.spark) { const r = spark.getBoundingClientRect(); out.spark = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    if (out.starts && !fly && out.goneAt == null) out.goneAt = performance.now() - out.t0;
    if (performance.now() - out.t0 < 2500 && out.goneAt == null) requestAnimationFrame(seen); else done(out);
  };
  seen();
}), H);

test('each word lifts off from where it sits in the preview, with a trail', async () => {
  const page = await listening('textarea.html');
  try {
    const w = watch(page);
    await off.eval('__fake.say("আমি আজ খুব খুশি")');
    const r = await w;
    assert.ok(r.starts, 'no flight');
    assert.equal(r.text.replace(/\s+/g, ' ').trim(), 'আমি আজ খুব খুশি');
    assert.deepEqual(r.starts.map(s => s.chip), ['আমি', 'আজ', 'খুব', 'খুশি']);
    for (const s of r.starts) assert.ok(Math.abs(s.dx) <= 8 && Math.abs(s.dy) <= 8, `${s.word} starts ${s.dx},${s.dy} px away`);
    assert.equal(r.trails, 2 * r.starts.length);
  } finally { await page.close(); }
});

test('the words land at the text cursor in the box, where a spark shows', async () => {
  const page = await listening('plain.html');
  try {
    const w = watch(page);
    await off.eval('__fake.say("আমার কথা এখানে")');
    const r = await w;
    assert.ok(r.spark, 'no spark');
    const caret = await page.evaluate(() => {
      const range = getSelection().getRangeAt(0).cloneRange(); range.collapse(false);
      const rect = range.getClientRects()[0] || range.getBoundingClientRect();
      return { x: rect.left, y: rect.top + rect.height / 2 };
    });
    assert.ok(Math.hypot(r.spark.x - caret.x, r.spark.y - caret.y) <= 14,
      `spark at ${Math.round(r.spark.x)},${Math.round(r.spark.y)}, caret at ${Math.round(caret.x)},${Math.round(caret.y)}`);
  } finally { await page.close(); }
});

test('in a textarea, the spark lands on the line the words went to', async () => {
  const page = await listening('textarea.html');
  try {
    await page.evaluate(() => { mimic.el.value = 'আগের লেখা\nদ্বিতীয় লাইন\n'; mimic.el.setSelectionRange(mimic.el.value.length, mimic.el.value.length); });
    const w = watch(page);
    await off.eval('__fake.say("তৃতীয়")');
    const r = await w;
    const box = await page.evaluate(() => { const b = mimic.el.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(mimic.el).lineHeight) || 16;
      return { top: b.top, left: b.left, right: b.right, lh }; });
    assert.ok(r.spark, 'no spark');
    assert.ok(r.spark.x >= box.left && r.spark.x <= box.right, 'spark outside the box');
    // Third line: two line heights down, give or take one.
    const line = (r.spark.y - box.top) / box.lh;
    assert.ok(line >= 1.6 && line <= 3.8, `landed on line ${line.toFixed(1)}`);
  } finally { await page.close(); }
});

test('a long sentence flies as at most 12 chips, and is gone in time with nothing left running', async () => {
  const page = await listening('textarea.html');
  try {
    const w = watch(page);
    const long = Array.from({ length: 30 }, (_, i) => `শব্দ${i}`).join(' ');
    await off.eval(`__fake.say(${JSON.stringify(long)})`);
    const r = await w;
    assert.ok(r.starts.length <= 12 && r.starts.length >= 6, `${r.starts.length} chips`);
    assert.ok(r.goneAt != null && r.goneAt < 1200, `still flying at ${Math.round(r.goneAt)} ms`);
    await page.waitForTimeout(300);
    const running = await page.evaluate(h => document.querySelector(h).shadowRoot.querySelectorAll('.fly, .fly-spark').length, H);
    assert.equal(running, 0);
  } finally { await page.close(); }
});

test('the arc stays inside the window, even when the box is at the very top', async () => {
  const page = await listening('textarea.html');
  try {
    const top = page.evaluate(h => new Promise(done => {
      const root = document.querySelector(h).shadowRoot; let min = Infinity; const t0 = performance.now();
      (function tick() {
        for (const c of root.querySelectorAll('.fly-w')) min = Math.min(min, c.getBoundingClientRect().top);
        if (performance.now() - t0 < 1300) requestAnimationFrame(tick); else done(min);
      })();
    }), H);
    await off.eval('__fake.say("উপরে বক্স আছে")');
    const min = await top;
    assert.ok(Number.isFinite(min), 'no flight');
    assert.ok(min >= 0, `a chip went ${Math.round(-min)} px above the window`);
  } finally { await page.close(); }
});
