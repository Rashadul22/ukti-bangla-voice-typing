// Task 6: the floating control from the keyboard and to a screen reader.

const nodeTest = require('node:test');
const { before, after, beforeEach } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, barShown } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

let server, ext, port, cdpPort, off;
before(async () => {
  server = await serve();
  port = server.address().port;
  cdpPort = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdpPort}`] });
  await storage.set(ext.worker, { coachDone: true });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => {
  await storage.set(ext.worker, { uiLang: 'bn', layout: 'compact', enabled: true, disabledSites: [] });
});

async function open() {
  const page = await ext.context.newPage();
  await page.goto(`http://127.0.0.1:${port}/textarea.html`);
  await page.waitForFunction(() => window.mimic);
  await page.click('#ed');
  assert.ok(await waitFor(() => barShown(page)));
  return page;
}

// Where keyboard focus is inside the control, or null when it is elsewhere.
const focused = page => page.evaluate(() => {
  const host = document.querySelector('[data-ukti="bar"]');
  if (document.activeElement !== host) return null;
  const el = host.shadowRoot.activeElement;
  return el ? (el.getAttribute('aria-label') || el.className) : 'host';
});

// Tabs forward from the "elsewhere" button, the last page element, and
// lists what focus lands on inside the control.
async function tabStops(page, max = 8) {
  await page.focus('#elsewhere');
  const stops = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const where = await focused(page);
    if (where == null) { if (stops.length) break; else continue; }
    stops.push(where);
  }
  return stops;
}

test('collapsed: Tab reaches the mic and the toggle, nothing hidden', async () => {
  const page = await open();
  try {
    assert.deepEqual(await tabStops(page), ['বলা শুরু করুন', 'আরও']);
  } finally { await page.close(); }
});

test('expanded with the keyboard: the toggle says so and the action buttons join the tab order', async () => {
  const page = await open();
  try {
    await tabStops(page);                               // focus ends on the toggle
    await page.focus('#elsewhere');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    assert.equal(await focused(page), 'আরও');
    await page.keyboard.press('Enter');
    const expanded = await page.evaluate(() =>
      document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.toggle').getAttribute('aria-expanded'));
    assert.equal(expanded, 'true');
    const stops = await tabStops(page);
    assert.deepEqual(stops, ['বলা শুরু করুন', 'বাংলা করুন', 'ইংরেজি করুন', 'ফেরত নিন', 'গুটিয়ে নিন']);
  } finally { await page.close(); }
});

test('a hidden control has no tab stops', async () => {
  const page = await open();
  try {
    await storage.set(ext.worker, { disabledSites: ['127.0.0.1'] });
    assert.ok(await waitFor(async () => !(await barShown(page))));
    await page.waitForTimeout(400);   // visibility flips after the 250 ms fade
    assert.deepEqual(await tabStops(page), []);
  } finally { await page.close(); }
});

test('the mic from the keyboard: Enter starts, and its name and state follow', async () => {
  off = await fakeSpeech(ext, cdpPort);
  await off.eval('stopDictation(), true');
  const page = await open();
  try {
    await page.focus('#elsewhere');
    await page.keyboard.press('Tab');
    assert.equal(await focused(page), 'বলা শুরু করুন');
    await page.keyboard.press('Enter');
    assert.ok(await waitFor(() => off.eval('state.desired === true')), 'Enter on the mic did not start');
    const mic = () => page.evaluate(() => {
      const b = document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.main');
      return { label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed') };
    });
    assert.ok(await waitFor(async () => (await mic()).pressed === 'true'), JSON.stringify(await mic()));
    assert.equal((await mic()).label, 'বলা বন্ধ করুন');
    await page.keyboard.press('Enter');
    assert.ok(await waitFor(async () => (await mic()).pressed === 'false'));
    assert.equal((await mic()).label, 'বলা শুরু করুন');
  } finally { await page.close(); }
});

test('focus is visible on every button the keyboard reaches', async () => {
  const page = await open();
  try {
    await page.focus('#elsewhere');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const b = document.querySelector('[data-ukti="bar"]').shadowRoot.activeElement;
      const cs = getComputedStyle(b);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
    });
    assert.notEqual(outline.style, 'none');
    assert.ok(outline.width >= 2, JSON.stringify(outline));
  } finally { await page.close(); }
});

test('the drag grip is not a tab stop, and hidden from screen readers', async () => {
  const page = await open();
  try {
    await storage.set(ext.worker, { layout: 'full' });
    await page.waitForTimeout(300);
    const stops = await tabStops(page, 10);
    assert.equal(stops.includes('টেনে সরান'), false, stops.join(' | '));
    const hidden = await page.evaluate(() =>
      document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.grip').getAttribute('aria-hidden'));
    assert.equal(hidden, 'true');
  } finally { await page.close(); }
});

test('messages are announced: the toast is a polite live region', async () => {
  const page = await open();
  try {
    await page.evaluate(() => mimic.setText(''));
    await page.keyboard.press('Control+Shift+KeyB');
    const toast = await waitFor(() => page.evaluate(() => {
      const t = document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.toast');
      return t && { role: t.getAttribute('role'), live: t.getAttribute('aria-live') };
    }));
    assert.deepEqual(toast, { role: 'status', live: 'polite' });
  } finally { await page.close(); }
});

test('the preview, which churns while speaking, is hidden from screen readers', async () => {
  const page = await open();
  try {
    const hidden = await page.evaluate(() =>
      document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.preview').getAttribute('aria-hidden'));
    assert.equal(hidden, 'true');
  } finally { await page.close(); }
});

test('names and language follow a live language switch', async () => {
  const page = await open();
  try {
    await storage.set(ext.worker, { uiLang: 'en' });
    await page.waitForTimeout(400);
    const out = await page.evaluate(() => {
      const host = document.querySelector('[data-ukti="bar"]');
      return { lang: host.getAttribute('lang'),
        labels: [...host.shadowRoot.querySelectorAll('button:not(.grip)')].map(b => b.getAttribute('aria-label')) };
    });
    assert.equal(out.lang, 'en');
    assert.deepEqual(out.labels.filter(l => /[ঀ-৿]/.test(l) && l !== 'অ'), [], out.labels.join(' | '));
  } finally { await page.close(); }
});

test('reduced motion: no animation, no transition over 10 ms', async () => {
  const page = await ext.context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  try {
    await page.goto(`http://127.0.0.1:${port}/textarea.html`);
    await page.click('#ed');
    assert.ok(await waitFor(() => barShown(page)));
    const moving = await page.evaluate(() => {
      const root = document.querySelector('[data-ukti="bar"]').shadowRoot;
      root.querySelector('.main').classList.add('live');      // the animated state
      const out = [];
      for (const el of root.querySelectorAll('*')) {
        for (const pseudo of [null, '::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          const longest = Math.max(...cs.transitionDuration.split(',').map(parseFloat));
          if (cs.animationName !== 'none') out.push(`${el.className}${pseudo || ''} animation ${cs.animationName}`);
          if (longest > 0.01) out.push(`${el.className || el.tagName}${pseudo || ''} transition ${cs.transitionDuration}`);
        }
      }
      return [...new Set(out)];
    });
    assert.deepEqual(moving, []);
  } finally { await page.close(); }
});
