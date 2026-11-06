// Colour, second pass: the findings of the 81/100 review.
//  1. The popup, setup and corrections pages follow the system: light when
//     the computer is light, dark when it is dark. They were always dark.
//  2. The control's edge is visible on a dark site.
//  3. Red means "recording" only. An error toast is a neutral panel with a
//     red accent, so the two no longer share a colour.

const nodeTest = require('node:test');
const { before, after } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const { serve, launch, storage, command } = require('./helpers');
const surfaces = require('./ui/surfaces');

let ext, server, base;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  ext = await launch();
});
after(async () => { await ext?.close(); server?.close(); });

const lum = rgb => { const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };

for (const file of ['popup.html', 'setup.html', 'words.html']) {
  for (const scheme of ['light', 'dark']) {
    test(`${file} follows a ${scheme} system`, async () => {
      const page = await ext.context.newPage();
      try {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        await page.goto(ext.extUrl(file));
        await page.waitForTimeout(300);
        const c = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.body).color }));
        if (scheme === 'light') assert.ok(lum(c.bg) > .8, `${file} is not light: ${c.bg}`);
        else assert.ok(lum(c.bg) < .05, `${file} is not dark: ${c.bg}`);
        assert.ok(ratio(c.bg, c.ink) >= 7, `body text ${c.ink} on ${c.bg}`);
      } finally { await page.close(); }
    });
  }
}

// The button's edge, painted over its own fill, against a dark page.
const over = (fg, bg) => { const f = fg.match(/[\d.]+/g).map(Number), b = bg.match(/[\d.]+/g).map(Number); const a = f[3] ?? 1;
  return `rgb(${[0, 1, 2].map(i => Math.round(f[i] * a + b[i] * (1 - a))).join(', ')})`; };
for (const theme of ['glass', 'dark']) {
  test(`${theme} control: its edge shows on a dark site`, async () => {
    const { page } = await surfaces.control(ext, base, { state: 'collapsed', theme, bg: 'dark', reduced: true });
    try {
      const c = await page.evaluate(() => {
        const b = document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('button.main');
        return { edge: getComputedStyle(b).borderTopColor, fill: getComputedStyle(b).backgroundColor, page: getComputedStyle(document.body).backgroundColor };
      });
      const fill = over(c.fill, c.page);
      const edge = over(c.edge, fill);
      assert.ok(ratio(edge, c.page) >= 2, `edge ${edge} on page ${c.page}: ${ratio(edge, c.page).toFixed(2)}`);
    } finally { await page.close(); }
  });
}

test('an error toast is a neutral panel with a red accent, not a red block', async () => {
  const { page } = await surfaces.control(ext, base, { state: 'toast-error', theme: 'glass', bg: 'light', reduced: true });
  try {
    const t = await page.evaluate(() => {
      const root = document.querySelector('[data-ukti="bar"]').shadowRoot;
      const toast = root.querySelector('.toast.err'), cs = getComputedStyle(toast);
      return { bg: cs.backgroundColor, ink: cs.color, accent: cs.boxShadow + ' ' + cs.borderLeftColor };
    });
    const [r, g, b] = t.bg.match(/[\d.]+/g).map(Number);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 40, `toast background is a colour, not neutral: ${t.bg}`);
    assert.match(t.accent, /rgb\((2[0-5]\d|1[89]\d), (\d|[1-9]\d), (\d|[1-9]\d)\)/, `no red accent: ${t.accent}`);
    assert.ok(ratio(t.ink, over(t.bg, 'rgb(255, 255, 255)')) >= 4.5);
  } finally { await page.close(); }
});
