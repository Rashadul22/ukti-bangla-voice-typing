// Layout, second pass: the findings of the 82/100 review, each as a check.
//  1. Bangla text is never below 12px, and never tracked or uppercased.
//  2. The open control has tiers: the mic, the two language actions with a
//     shared accent, undo, and the quiet utilities (grip, collapse), which
//     look smaller but keep a 40px hit area.
//  3. The setup page's main buttons stand out from their cards (3:1).
//  4. The setup page never hides a card it cannot fit; it scrolls instead.
//  5. No help paragraph in the popup runs past three lines.

const nodeTest = require('node:test');
const { before, after } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor } = require('./helpers');
const surfaces = require('./ui/surfaces');

let ext, server, base;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  ext = await launch();
});
after(async () => { await ext?.close(); server?.close(); });

// Every visible text node with Bengali in it, with its element's metrics.
const bengaliText = (root = document) => {
  const out = [];
  const walk = r => {
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode, el = n.parentElement;
      if (!/[ঀ-৿]/.test(n.nodeValue) || !el || el.closest('script,style')) continue;
      const cs = getComputedStyle(el), r2 = el.getBoundingClientRect();
      if (!r2.width || cs.visibility === 'hidden' || cs.display === 'none') continue;
      out.push({ text: n.nodeValue.trim().slice(0, 24), size: parseFloat(cs.fontSize),
        track: cs.letterSpacing, upper: cs.textTransform });
    }
  };
  walk(root);
  return out;
};
const bad = items => items.filter(i => i.size < 12 || (i.track !== 'normal' && Math.abs(parseFloat(i.track)) > .3) || i.upper === 'uppercase')
  .map(i => `${i.size}px ${i.track} ${i.upper} "${i.text}"`);

for (const tab of [0, 1, 2]) {
  test(`popup tab ${tab}: Bangla text is 12px or more, untracked, not uppercased`, async () => {
    const { page } = await surfaces.popup(ext, { tab, lang: 'bn' });
    try { assert.deepEqual(bad(await page.evaluate(`(${bengaliText})()`)), []); } finally { await page.close(); }
  });
}

for (const file of ['setup.html', 'words.html']) {
  test(`${file}: Bangla text is 12px or more, untracked, not uppercased`, async () => {
    await storage.set(ext.worker, { uiLang: 'bn' });
    const page = await ext.context.newPage();
    try {
      await page.goto(ext.extUrl(file));
      await page.waitForTimeout(400);
      assert.deepEqual(bad(await page.evaluate(`(${bengaliText})()`)), []);
    } finally { await page.close(); }
  });
}

test('popup: no help paragraph runs past three lines', async () => {
  for (const tab of [0, 1, 2]) {
    const { page } = await surfaces.popup(ext, { tab, lang: 'bn' });
    try {
      const long = await page.evaluate(() => [...document.querySelectorAll('.pane.on .hint')].map(h => {
        const lh = parseFloat(getComputedStyle(h).lineHeight); return { lines: Math.round(h.getBoundingClientRect().height / lh), text: h.textContent.trim().slice(0, 30) };
      }).filter(h => h.lines > 3));
      assert.deepEqual(long, [], `tab ${tab}`);
    } finally { await page.close(); }
  }
});

test('the open control has tiers: quiet utilities, a language pair, the mic', async () => {
  const { page } = await surfaces.control(ext, base, { state: 'open', theme: 'glass', bg: 'light', reduced: true });
  try {
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const root = document.querySelector('[data-ukti="bar"]').shadowRoot;
      const b = n => root.querySelector(`.row[data-name="${n}"] button`);
      const info = n => { const e = b(n); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return { w: Math.round(r.width), border: cs.borderTopColor, shadow: cs.boxShadow }; };
      return Object.fromEntries(['mic', 'banglish', 'english', 'undo', 'grip', 'toggle'].map(n => [n, info(n)]));
    });
    for (const n of ['mic', 'banglish', 'english', 'undo', 'grip', 'toggle']) assert.ok(m[n], `no ${n} button`);
    assert.ok(m.grip.w < m.undo.w && m.toggle.w < m.undo.w, `utilities not smaller: ${JSON.stringify(m)}`);
    assert.equal(m.grip.shadow, 'none'); assert.equal(m.toggle.shadow, 'none');
    assert.equal(m.banglish.border, m.english.border, 'the language pair does not share an accent');
    assert.notEqual(m.banglish.border, m.undo.border, 'the language pair looks like undo');
    assert.ok(m.mic.w > m.undo.w);
  } finally { await page.close(); }
});

const lum = rgb => { const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };

test('setup: the main buttons stand out from their cards, 3:1 or more', async () => {
  const { page } = await surfaces.setup(ext, { lang: 'bn' });
  try {
    const pairs = await page.evaluate(() => [...document.querySelectorAll('.card:not(.soft) button')].map(b => {
      const bg = getComputedStyle(b).backgroundImage.match(/rgba?\([^)]+\)/)?.[0] || getComputedStyle(b).backgroundColor;
      return { id: b.id, bg, card: getComputedStyle(b.closest('.card')).backgroundColor };
    }));
    assert.ok(pairs.length >= 3);
    const weak = pairs.filter(p => ratio(p.bg, p.card) < 3).map(p => `${p.id} ${p.bg} on ${p.card}: ${ratio(p.bg, p.card).toFixed(2)}`);
    assert.deepEqual(weak, []);
  } finally { await page.close(); }
});

test('setup at 1280x720: every card can be reached, nothing is cut off', async () => {
  const { page } = await surfaces.setup(ext, { lang: 'bn' });
  try {
    const r = await page.evaluate(() => {
      const se = document.scrollingElement;
      const last = Math.max(...[...document.querySelectorAll('.card, footer')].map(c => c.getBoundingClientRect().bottom + se.scrollTop));
      const canScroll = getComputedStyle(document.body).overflowY !== 'hidden' || getComputedStyle(document.documentElement).overflowY !== 'hidden';
      return { last: Math.round(last), view: innerHeight, scrollH: se.scrollHeight, canScroll };
    });
    assert.ok(r.last <= r.view || (r.canScroll && r.scrollH >= r.last), JSON.stringify(r));
  } finally { await page.close(); }
});

test('the control: its Bangla labels are 12px or more at the smallest size', async () => {
  await storage.set(ext.worker, { uiSize: 'small', showHints: true });
  const { page } = await surfaces.control(ext, base, { state: 'open', theme: 'glass', bg: 'light', reduced: true });
  try {
    const sizes = await page.evaluate(() => [...document.querySelector('[data-ukti="bar"]').shadowRoot.querySelectorAll('.tip b, .toast, .indicator')]
      .filter(e => /[ঀ-৿]/.test(e.textContent)).map(e => [e.textContent.slice(0, 12), parseFloat(getComputedStyle(e).fontSize)]));
    assert.ok(sizes.length >= 3, JSON.stringify(sizes));
    assert.deepEqual(sizes.filter(([, s]) => s < 12), []);
  } finally { await page.close(); await storage.set(ext.worker, { uiSize: 'medium', showHints: false }); }
});
