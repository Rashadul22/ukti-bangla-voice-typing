// The author, presented on Ukti's own pages and never on the sites people
// write on. Name spelt as the author asked: মোঃ রাশেদুল ইসলাম in Bangla,
// Md Rashadul Islam in English.

const nodeTest = require('node:test');
const { before, after } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serve, launch, storage, waitFor, ROOT } = require('./helpers');

const LINKEDIN = 'https://www.linkedin.com/in/rashadul-islam-73790a241';
let ext, server, base;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  ext = await launch();
});
after(async () => { await ext?.close(); server?.close(); });

async function open(file, lang) {
  await storage.set(ext.worker, { uiLang: lang });
  const page = await ext.context.newPage();
  await page.goto(ext.extUrl(file));
  await page.waitForTimeout(400);
  return page;
}

test('the Bangla name is spelt রাশেদুল everywhere a reader sees it', () => {
  for (const f of ['popup.html', 'setup.html', 'i18n.js', 'README.md', 'store/listing-bn.md', 'store/privacy-policy.html']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.equal(/রাশাদুল ইসলাম/.test(s), false, `${f} still has the old spelling`);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8'), /মোঃ রাশেদুল ইসলাম/);
});

for (const [lang, name, role] of [['bn', 'মোঃ রাশেদুল ইসলাম', /ড্যাফোডিল/], ['en', 'Md Rashadul Islam', /Daffodil International University/]]) {
  test(`setup (${lang}): a maker card with name, role and LinkedIn`, async () => {
    const page = await open('setup.html', lang);
    try {
      const card = await page.evaluate(() => {
        const c = document.querySelector('.maker');
        if (!c) return null;
        const a = c.querySelector('a[href*="linkedin"]');
        return { text: c.textContent.replace(/\s+/g, ' '), href: a?.href, target: a?.target, rel: a?.rel,
          badge: !!c.querySelector('.avatar'), visible: c.getBoundingClientRect().height > 40 };
      });
      assert.ok(card, 'no maker card');
      assert.ok(card.text.includes(name), card.text);
      assert.match(card.text, role);
      assert.equal(card.href, LINKEDIN);
      assert.equal(card.target, '_blank');
      assert.match(card.rel, /noopener/);
      assert.ok(card.badge && card.visible);
    } finally { await page.close(); }
  });

  test(`popup (${lang}): the credit names the maker and links to LinkedIn`, async () => {
    const page = await open('popup.html', lang);
    try {
      const by = await page.evaluate(() => {
        const b = document.querySelector('.by');
        return { text: b.textContent.replace(/\s+/g, ' '), links: [...b.querySelectorAll('a')].map(a => a.href) };
      });
      assert.ok(by.text.includes(name), by.text);
      assert.ok(by.links.includes(LINKEDIN), by.links.join(' '));
    } finally { await page.close(); }
  });
}

test('the maker is never shown on the sites people write on', async () => {
  await storage.set(ext.worker, { uiLang: 'bn', coachDone: true });
  const page = await ext.context.newPage();
  try {
    await page.goto(`${base}/textarea.html`);
    await page.waitForFunction(() => window.mimic);
    await page.evaluate(() => mimic.el.focus());
    await waitFor(() => page.evaluate(() => !!document.querySelector('[data-ukti="bar"]')));
    const text = await page.evaluate(() => document.querySelector('[data-ukti="bar"]').shadowRoot.textContent);
    assert.equal(/রাশেদুল|Rashadul|linkedin/i.test(text), false);
  } finally { await page.close(); }
});

test('no link carries tracking parameters', () => {
  for (const f of ['popup.html', 'setup.html']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.equal(/utm_/.test(s), false, f);
  }
});
