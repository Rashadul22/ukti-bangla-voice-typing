// Motion on the popup, the setup page and the corrections page (fx.css,
// fx.js), and the entrance of the control's small panels. The layout must
// not move, nothing may run once the page has settled, and reduced motion
// turns it all off.

const nodeTest = require('node:test');
const { before, after } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, command } = require('./helpers');

let ext, server, base;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  ext = await launch();
  await storage.set(ext.worker, { uiLang: 'bn', coachDone: true });
});
after(async () => { await ext?.close(); server?.close(); });

async function open(file, reduced = false) {
  const page = await ext.context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(ext.extUrl(file));
  return { page, errors };
}

// Boxes of everything visible, to prove the effects leave the layout alone.
const layout = page => page.evaluate(() =>
  [...document.querySelectorAll('header, .site, .tabs, .group, .card, .cta, footer, textarea')]
    .map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(','); }));

// The corrections page is a header and one card, so two blocks.
const BLOCKS = { 'popup.html': 4, 'setup.html': 4, 'words.html': 2 };
for (const file of Object.keys(BLOCKS)) {
  test(`${file}: blocks enter one after another, then nothing is left animating`, async () => {
    const { page, errors } = await open(file);
    try {
      const first = await page.evaluate(() => [...document.querySelectorAll('.fx-in')].map(e => ({
        i: +e.style.getPropertyValue('--i'), anim: getComputedStyle(e).animationName })));
      assert.ok(first.length >= BLOCKS[file], `only ${first.length} blocks enter`);
      assert.ok(first.every(f => f.anim === 'fx-in'), JSON.stringify(first));
      assert.deepEqual(first.map(f => f.i), first.map((_, n) => n), 'not staggered in order');
      await page.waitForTimeout(1800);
      const left = await page.evaluate(() => ({
        fx: document.querySelectorAll('.fx-in').length,
        running: document.getAnimations().filter(a => a.playState === 'running').length,
      }));
      assert.deepEqual(left, { fx: 0, running: 0 }, 'something still runs at rest');
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });

  test(`${file}: with reduced motion nothing enters or moves, and the layout is the same`, async () => {
    const still = await open(file, true);
    const moving = await open(file);
    try {
      const anims = await still.page.evaluate(() => document.getAnimations().length);
      assert.equal(anims, 0, 'animations run under reduced motion');
      await moving.page.waitForTimeout(1800);
      assert.deepEqual(await layout(moving.page), await layout(still.page), 'the effects moved the layout');
    } finally { await still.page.close(); await moving.page.close(); }
  });
}

test('popup: a card lights under the pointer', async () => {
  const { page } = await open('popup.html');
  try {
    await page.waitForTimeout(1500);
    const box = await page.locator('.pane.on .group').first().boundingBox();
    await page.mouse.move(box.x + 40, box.y + 20);
    await page.mouse.move(box.x + 60, box.y + 22);
    const r = await page.evaluate(() => {
      const g = document.querySelector('.pane.on .group');
      return { lit: g.classList.contains('lit'), mx: g.style.getPropertyValue('--mx'),
        glow: getComputedStyle(g, '::after').backgroundImage.slice(0, 15) };
    });
    assert.equal(r.lit, true);
    assert.equal(r.mx, '60px');
    assert.match(r.glow, /radial-gradient/);
  } finally { await page.close(); }
});

// A view transition was tried here first; its overlay swallowed presses
// made while it ran, which tests/motion.test.js caught. The pane animates
// itself instead, and a press straight after a tab change must still land.
test('popup: a new tab rises in, and a press right after still lands', async () => {
  const { page } = await open('popup.html');
  try {
    await page.waitForTimeout(800);
    await page.locator('.tabs button').nth(1).click();
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.pane.on')).animationName);
    assert.equal(anim, 'fx-pane-in');
    await page.waitForTimeout(100);
    await page.locator('.tabs button').nth(0).click();
    assert.equal(await page.evaluate(() => document.querySelectorAll('.tabs button')[0].classList.contains('on')), true);
  } finally { await page.close(); }
});

test('popup: under reduced motion a tab switch is instant', async () => {
  const { page } = await open('popup.html', true);
  try {
    await page.locator('.tabs button').nth(1).click();
    assert.equal(await page.evaluate(() => document.querySelectorAll('.tabs button')[1].classList.contains('on')), true);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.pane.on')).animationName), 'none');
  } finally { await page.close(); }
});

test('the control: a toast comes out of a blur on its way in, and keeps no filter after', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(`${base}/textarea.html`);
    await page.waitForFunction(() => window.mimic);
    await page.evaluate(() => { mimic.setText(''); mimic.el.focus(); });
    await waitFor(() => page.evaluate(() => !!document.querySelector('[data-ukti="bar"]')));
    await command(ext, page, 'to-bangla');
    const anim = await waitFor(() => page.evaluate(() =>
      document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.toast.on') &&
      getComputedStyle(document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.toast.on')).animationName));
    assert.equal(anim, 'unblur');
    await page.waitForTimeout(600);
    const filter = await page.evaluate(() =>
      getComputedStyle(document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.toast')).filter);
    assert.equal(filter, 'none');
  } finally { await page.close(); }
});
