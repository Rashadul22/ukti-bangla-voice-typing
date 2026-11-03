// Motion, second pass, from the review: whatever repeats must be short and
// calm, and the one new effect must carry information.
//  1. The popup, opened many times a day, settles in about 0.3 s (was 0.87).
//  2. The logo glint is for the setup page only, not every popup open.
//  3. The "speak, I am listening" prompt is still, not breathing.
//  4. The listening ring turns slowly: 6 s a turn (was 3.2).
//  5. One sentence flies at a time, and none flies to a box off screen.
//  6. The ring's colour says the state: listening, waiting (amber), error.

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
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn', theme: 'glass' });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => { await off.eval('stopDictation(), true'); });

const settleMs = page => page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('.fx-in')].map(e => {
  const cs = getComputedStyle(e); return (parseFloat(cs.animationDelay) + parseFloat(cs.animationDuration)) * 1000;
})));

test('the popup settles in 0.35 s or less; setup may take longer', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('popup.html'));
    const ms = await settleMs(page);
    assert.ok(ms > 0 && ms <= 350, `popup entrance ${ms} ms`);
  } finally { await page.close(); }
});

test('the logo glints on the setup page only', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('popup.html'));
    assert.equal(await page.evaluate(() => document.querySelector('.mark').classList.contains('fx-glint')), false);
    await page.goto(ext.extUrl('setup.html'));
    assert.equal(await page.evaluate(() => document.querySelector('.mark').classList.contains('fx-glint')), true);
  } finally { await page.close(); }
});

const H = '[data-ukti="bar"]';
async function listening() {
  const page = await ext.context.newPage();
  await page.goto(`${base}/textarea.html`);
  await page.waitForFunction(() => window.mimic);
  await page.evaluate(() => mimic.el.focus());
  await command(ext, page, 'toggle-dictation');
  assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')), 'not listening');
  await page.waitForTimeout(300);
  return page;
}
const inShadow = (page, fn, arg) => page.evaluate(([h, src, a]) => new Function('root', 'a', src)(document.querySelector(h).shadowRoot, a),
  [H, `return (${fn.toString()})(root, a)`, arg]);

test('the prompt is still, and the ring turns once in 6 s', async () => {
  const page = await listening();
  try {
    const r = await inShadow(page, root => ({
      hint: getComputedStyle(root.querySelector('.preview .hint')).animationName,
      ring: getComputedStyle(root.querySelector('.preview'), '::before').animationDuration }));
    assert.equal(r.hint, 'none');
    assert.equal(r.ring, '6s');
  } finally { await page.close(); }
});

test('one sentence flies at a time', async () => {
  const page = await listening();
  try {
    const most = inShadow(page, root => new Promise(done => { let m = 0; const t0 = performance.now();
      (function tick() { m = Math.max(m, root.querySelectorAll('.fly').length); if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else done(m); })(); }));
    await off.eval('__fake.say("এক")'); await off.eval('__fake.say("দুই")'); await off.eval('__fake.say("তিন")');
    assert.equal(await most, 1);
  } finally { await page.close(); }
});

test('nothing flies to a box that is off screen', async () => {
  const page = await listening();
  try {
    await page.evaluate(() => { document.body.style.height = '4000px'; scrollTo(0, 3000); });
    await page.waitForTimeout(200);
    const flew = inShadow(page, root => new Promise(done => { let n = 0; const t0 = performance.now();
      (function tick() { n += root.querySelectorAll('.fly').length; if (performance.now() - t0 < 800) requestAnimationFrame(tick); else done(n); })(); }));
    await off.eval('__fake.say("দূরের বক্স")');
    assert.equal(await flew, 0);
  } finally { await page.close(); }
});

for (const [event, state, colour] of [
  ["emit('THROTTLED', { seconds: 5 })", 'wait', /245, 158, 11/],
  ["emit('RECOGNITION_ERROR', { error: 'network' })", 'wait', /245, 158, 11/],
]) {
  test(`the ring says "${state}" after ${event.split("'")[1]}`, async () => {
    const page = await listening();
    try {
      await off.eval(`${event}, true`);
      const r = await waitFor(() => inShadow(page, root => {
        const p = root.querySelector('.preview');
        return p.dataset.state === 'wait' && { state: p.dataset.state, bg: getComputedStyle(p, '::before').backgroundImage };
      }));
      assert.ok(r, 'the ring did not change state');
      assert.match(r.bg, colour);
      // Speech again: back to listening colours.
      await off.eval('__fake.say("আবার", false)');
      assert.ok(await waitFor(() => inShadow(page, root => root.querySelector('.preview').dataset.state === 'listen')));
    } finally { await page.close(); }
  });
}
