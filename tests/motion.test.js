// Feedback motion: event-driven, short, transform and opacity only, gone when
// done, and absent under prefers-reduced-motion. See MOTION.md.

const nodeTest = require('node:test');
const { before, after, beforeEach } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, barShown, command } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

let server, base, ext, off;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  const cdp = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdp}`] });
  off = await fakeSpeech(ext, cdp);
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn', layout: 'compact' });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => { await off.eval('stopDictation(), true'); });

const H = '[data-ukti="bar"]';
async function open(reduced = false, file = 'textarea.html') {
  const page = await ext.context.newPage();
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/${file}`);
  await page.waitForFunction(() => window.mimic);
  await page.click('#ed');
  assert.ok(await waitFor(() => barShown(page)));
  await page.waitForTimeout(300);
  return page;
}
// Samples the shadow root every frame for `ms`, recording what appeared.
const watch = (page, ms) => page.evaluate(([h, ms]) => new Promise(done => {
  const root = document.querySelector(h).shadowRoot;
  const seen = new Set(), anims = new Set();
  const t0 = performance.now();
  (function tick() {
    for (const el of root.querySelectorAll('.ripple, .pulse, .landed, .burst')) seen.add(el.className.split(' ')[0]);
    for (const el of root.querySelectorAll('button')) {
      const a = getComputedStyle(el).animationName;
      if (a && a !== 'none') anims.add(a);
    }
    if (performance.now() - t0 < ms) requestAnimationFrame(tick);
    else done({ seen: [...seen], anims: [...anims],
      leftover: root.querySelectorAll('.ripple, .pulse, .landed, .burst').length,
      nodes: root.querySelectorAll('*').length });
  })();
}), [H, ms]);

test('a press ripples from the button, then the ripple is gone', async () => {
  const page = await open();
  try {
    const w = watch(page, 900);
    await page.click(`${H} .toggle`);
    const r = await w;
    assert.ok(r.seen.includes('ripple'), JSON.stringify(r));
    assert.equal(r.leftover, 0, 'ripple left behind');
  } finally { await page.close(); }
});

test('a conversion glows over the box it wrote to, pulses its button, then cleans up', async () => {
  const page = await open();
  try {
    await page.keyboard.type('ami bangla');
    await page.click(`${H} .toggle`);
    await page.waitForTimeout(400);
    const w = watch(page, 1600);
    await page.click(`${H} button[aria-label="বাংলা করুন"]`);
    const r = await w;
    assert.ok(r.seen.includes('landed'), JSON.stringify(r));
    assert.ok(r.seen.includes('pulse'), JSON.stringify(r));
    assert.equal(r.leftover, 0);
  } finally { await page.close(); }
});

test('the glow sits on the box', async () => {
  const page = await open();
  try {
    await page.keyboard.type('ami');
    await command(ext, page, 'to-bangla');
    const rects = await waitFor(() => page.evaluate(h => {
      const g = document.querySelector(h).shadowRoot.querySelector('.landed');
      if (!g) return null;
      // Its laid-out box, not the transformed one: it eases in from 101.5%.
      const a = ['left', 'top', 'width', 'height'].map(k => parseFloat(g.style[k]));
      const b = document.getElementById('ed').getBoundingClientRect();
      return { a, b: [b.left, b.top, b.width, b.height] };
    }, H), { timeout: 3000, every: 10 });
    assert.ok(rects, 'no glow');
    rects.a.forEach((v, i) => assert.ok(Math.abs(v - rects.b[i]) <= 4, `glow ${rects.a} vs box ${rects.b}`));
  } finally { await page.close(); }
});

test('a refused action shakes its button', async () => {
  const page = await open();
  try {
    await page.evaluate(() => mimic.setText('আমি বাংলা'));
    await page.click(`${H} .toggle`);
    await page.waitForTimeout(400);
    const w = watch(page, 900);
    await page.click(`${H} button[aria-label="বাংলা করুন"]`);      // already Bangla: refused
    const r = await w;
    assert.ok(r.anims.includes('shake'), JSON.stringify(r));
  } finally { await page.close(); }
});

test('starting to listen sends one ring out from the mic', async () => {
  const page = await open();
  try {
    const w = watch(page, 1200);
    await command(ext, page, 'toggle-dictation');
    const r = await w;
    assert.ok(r.seen.includes('burst'), JSON.stringify(r));
    assert.equal(r.leftover, 0);
  } finally { await page.close(); }
});

test('the mic tilts toward the pointer while hovered, and settles when left', async () => {
  const page = await open();
  try {
    const box = await page.evaluate(h => { const r = document.querySelector(h).shadowRoot.querySelector('.main').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, H);
    // Inside the circle: the button is round, and its corners do not take events.
    await page.mouse.move(box[0] + box[2] * 0.78, box[1] + box[3] * 0.28, { steps: 3 });
    await page.waitForTimeout(100);
    const tilt = () => page.evaluate(h => {
      const m = document.querySelector(h).shadowRoot.querySelector('.main');
      return [m.style.getPropertyValue('--rx'), m.style.getPropertyValue('--ry')].map(v => parseFloat(v) || 0);
    }, H);
    const [rx, ry] = await tilt();
    assert.ok(Math.abs(rx) > 1 && Math.abs(ry) > 1, `no tilt: ${rx}, ${ry}`);
    assert.ok(Math.abs(rx) <= 8 && Math.abs(ry) <= 8, `tilt too strong: ${rx}, ${ry}`);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(100);
    assert.deepEqual(await tilt(), [0, 0]);
  } finally { await page.close(); }
});

test('reduced motion: no ripple, no glow, no pulse, no burst, no shake, no tilt', async () => {
  const page = await open(true);
  try {
    await page.keyboard.type('ami');
    const w = watch(page, 2000);
    await page.click(`${H} .toggle`);
    await page.waitForTimeout(200);
    await page.click(`${H} button[aria-label="বাংলা করুন"]`);
    await page.waitForTimeout(600);
    await page.click(`${H} button[aria-label="বাংলা করুন"]`);      // now refused
    await command(ext, page, 'toggle-dictation');
    const r = await w;
    assert.deepEqual(r.seen, []);
    assert.deepEqual(r.anims, []);
    const box = await page.evaluate(h => { const r = document.querySelector(h).shadowRoot.querySelector('.main').getBoundingClientRect(); return [r.left, r.top]; }, H);
    await page.mouse.move(box[0] + 2, box[1] + 2);
    const rx = await page.evaluate(h => document.querySelector(h).shadowRoot.querySelector('.main').style.getPropertyValue('--rx'), H);
    assert.ok(!rx || parseFloat(rx) === 0, `tilted under reduced motion: ${rx}`);
  } finally { await page.close(); }
});

test('after all of it the control is back to its resting size', async () => {
  const page = await open();
  try {
    // The toast element is made once and kept, so rest is measured after one.
    await page.keyboard.type('ami');
    await command(ext, page, 'to-bangla');
    await page.waitForTimeout(1500);
    const rest = await page.evaluate(h => document.querySelector(h).shadowRoot.querySelectorAll('*').length, H);
    await command(ext, page, 'undo');
    await page.click(`${H} .toggle`);
    await page.waitForTimeout(1500);
    const now = await page.evaluate(h => document.querySelector(h).shadowRoot.querySelectorAll('*').length, H);
    assert.equal(now, rest, 'transient elements left in the shadow root');
  } finally { await page.close(); }
});

// The popup and the setup page.
test('popup: tabs, segments and swatches press in; the switch thumb stretches while held', async () => {
  const page = await ext.context.newPage();
  try {
    await page.setViewportSize({ width: 352, height: 600 });
    await page.goto(ext.extUrl('popup.html'));
    await page.waitForTimeout(300);
    const pressed = async sel => {
      const el = page.locator(sel).first();
      const b = await el.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(200);
      const t = await el.evaluate(e => getComputedStyle(e).transform);
      await page.mouse.up();
      return t;
    };
    // Order matters. The segment first, since pressing a tab changes the pane
    // and hides it; the master switch last, since releasing it turns Ukti off
    // and the popup then dims and stops taking presses, by design.
    assert.notEqual(await pressed('#modeSeg button:not(.on)'), 'none', 'segment does not press in');
    await page.waitForTimeout(300);
    assert.notEqual(await pressed('.tabs button:not(.on)'), 'none', 'tab does not press in');
    await page.waitForTimeout(300);
    const thumb = await (async () => {
      const b = await page.locator('header .sw').boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(250);
      const w = await page.evaluate(() => getComputedStyle(document.querySelector('header .track'), '::after').width);
      await page.mouse.up();
      return parseFloat(w);
    })();
    assert.ok(thumb > 18, `thumb ${thumb}px while held`);
  } finally { await page.close(); }
});

test('popup and setup at rest are unchanged under reduced motion: nothing moves', async () => {
  for (const file of ['popup.html', 'setup.html']) {
    const page = await ext.context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(ext.extUrl(file));
    await page.waitForTimeout(300);
    const moving = await page.evaluate(() => [...document.querySelectorAll('*')].some(el =>
      ['', '::before', '::after'].some(p => { const cs = getComputedStyle(el, p || null);
        return (cs.animationName !== 'none' && parseFloat(cs.animationDuration) > .01) ||
          Math.max(...cs.transitionDuration.split(',').map(parseFloat)) > .01; })));
    await page.close();
    assert.equal(moving, false, file);
  }
});

test('setup: a step that becomes done pops its badge once', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('setup.html'));
    await page.waitForTimeout(400);
    const anim = await page.evaluate(() => new Promise(done => {
      const num = document.querySelector('#micStep .num');
      markDone(document.getElementById('micStep'), true);
      requestAnimationFrame(() => done(getComputedStyle(num).animationName));
    }));
    assert.equal(anim, 'pop');
  } finally { await page.close(); }
});
