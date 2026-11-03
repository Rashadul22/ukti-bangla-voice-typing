// The popup and the setup page in both languages, and the on-page control
// in English. In English mode no Bengali may be left in anything the user
// reads: text nodes, title, aria-label and placeholder. The one exception
// is the অ glyph, which is the name of the Bangla button.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, command } = require('./helpers');

let ext, server, base;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  ext = await launch();
});
after(async () => { await ext?.close(); server?.close(); });

// Everything a reader can see or hear, as [where, text] pairs.
const readable = page => page.evaluate(() => {
  const out = [];
  const walk = root => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (!n.nodeValue.trim() || n.parentElement?.closest('script,style')) continue;
      out.push([n.parentElement?.id || n.parentElement?.tagName, n.nodeValue.trim()]);
    }
    for (const el of root.querySelectorAll('[title],[aria-label],[placeholder]')) {
      for (const a of ['title', 'aria-label', 'placeholder']) {
        if (el.hasAttribute(a)) out.push([`${el.id || el.tagName}@${a}`, el.getAttribute(a)]);
      }
    }
  };
  walk(document.body);
  out.push(['title', document.title]);
  return out;
});

const BENGALI = /[ঀ-৿]/;
// The digits choice shows ১২৩ as its own sample, like the অ button.
// The replacements box shows a Bengali spelling fix as its example. That is
// sample data in the language being fixed, not interface text.
const EXEMPT = new Set(['replacements@placeholder']);
// The tab title is checked on its own, below, as a known gap.
const leftovers = items =>
  items.filter(([where, text]) =>
    !EXEMPT.has(where) && BENGALI.test(text.replace(/\(অ\)|^অ$|^[০-৯]+$/g, '')));

const settle = page => page.waitForTimeout(400);

for (const file of ['popup.html', 'setup.html']) {
  test(`${file} in Bangla`, async () => {
    await storage.set(ext.worker, { uiLang: 'bn' });
    const page = await ext.context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(ext.extUrl(file));
      await settle(page);
      assert.equal(await page.evaluate(() => document.documentElement.lang), 'bn');
      const text = (await readable(page)).map(([, t]) => t).join('\n');
      assert.ok(text.includes('উক্তি'));
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  });

  test(`${file} in English leaves no Bengali behind`, async () => {
    await storage.set(ext.worker, { uiLang: 'en' });
    const page = await ext.context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(ext.extUrl(file));
      await settle(page);
      assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
      assert.deepEqual(leftovers(await readable(page)), []);
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
      await storage.set(ext.worker, { uiLang: 'bn' });
    }
  });

  test(`${file} switches language live and back again exactly`, async () => {
    await storage.set(ext.worker, { uiLang: 'bn' });
    const page = await ext.context.newPage();
    try {
      await page.goto(ext.extUrl(file));
      await settle(page);
      const bangla = await readable(page);
      await storage.set(ext.worker, { uiLang: 'en' });
      await settle(page);
      assert.deepEqual(leftovers(await readable(page)), []);
      await storage.set(ext.worker, { uiLang: 'bn' });
      await settle(page);
      assert.deepEqual(await readable(page), bangla);
    } finally {
      await page.close();
    }
  });
}

test('the popup language switch writes the setting and repaints', async () => {
  await storage.set(ext.worker, { uiLang: 'bn' });
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('popup.html'));
    await settle(page);
    await page.click('#langSeg button[data-v="en"]');
    assert.ok(await waitFor(async () => (await storage.get(ext.worker, 'uiLang')).uiLang === 'en'));
    await settle(page);
    assert.deepEqual(leftovers(await readable(page)), []);
  } finally {
    await page.close();
    await storage.set(ext.worker, { uiLang: 'bn' });
  }
});

// Labels of the floating control, read from its shadow root.
const controlLabels = page => page.evaluate(() => {
  const root = document.querySelector('[data-ukti="bar"]').shadowRoot;
  return [...root.querySelectorAll('button')].map(b => b.getAttribute('aria-label'))
    .concat([...root.querySelectorAll('.tip b')].map(b => b.textContent).filter(Boolean));
});

test('the on-page control in English', async () => {
  await storage.set(ext.worker, { uiLang: 'en', coachDone: true });
  const page = await ext.context.newPage();
  try {
    await page.goto(`${base}/textarea.html`);
    await page.waitForFunction(() => window.mimic);
    await page.evaluate(() => mimic.setText(''));
    await waitFor(() => page.evaluate(() => !!document.querySelector('[data-ukti="bar"]')));
    const labels = await controlLabels(page);
    assert.ok(labels.includes('Make it Bangla'), labels.join(' | '));
    assert.deepEqual(labels.filter(l => BENGALI.test(l)), []);

    await command(ext, page, 'to-bangla');
    const said = await waitFor(() => page.evaluate(() =>
      document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.toast.on')?.textContent));
    assert.equal(said, 'The box is empty');
  } finally {
    await page.close();
    await storage.set(ext.worker, { uiLang: 'bn' });
  }
});

// Was a todo until task 6: paintLabels() now updates aria-label too.
test('the on-page control follows a language change without a reload', async () => {
  await storage.set(ext.worker, { uiLang: 'bn', coachDone: true });
  const page = await ext.context.newPage();
  try {
    await page.goto(`${base}/textarea.html`);
    await page.waitForFunction(() => window.mimic);
    await page.evaluate(() => mimic.setText(''));
    await waitFor(() => page.evaluate(() => !!document.querySelector('[data-ukti="bar"]')));
    await storage.set(ext.worker, { uiLang: 'en' });
    await settle(page);
    const labels = await controlLabels(page);
    assert.deepEqual(labels.filter(l => BENGALI.test(l)), []);
  } finally {
    await page.close();
    await storage.set(ext.worker, { uiLang: 'bn' });
  }
});

// Was a todo until task 6: applyLang() now translates document.title.
test('setup.html tab title is English in English mode', async () => {
  await storage.set(ext.worker, { uiLang: 'en' });
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('setup.html'));
    await settle(page);
    assert.equal(BENGALI.test(await page.title()), false, await page.title());
  } finally {
    await page.close();
    await storage.set(ext.worker, { uiLang: 'bn' });
  }
});

// Translating a text node used to drop the spaces around it, so a phrase
// followed by a link ran into it: "Built byMd Rashadul Islam".
for (const [file, sel] of [['popup.html', '.by'], ['setup.html', 'footer']]) {
  test(`${file}: English keeps the space before a link`, async () => {
    await storage.set(ext.worker, { uiLang: 'en' });
    const page = await ext.context.newPage();
    try {
      await page.goto(ext.extUrl(file));
      await settle(page);
      const text = await page.evaluate(s => document.querySelector(s).textContent.replace(/\s+/g, ' ').trim(), sel);
      assert.match(text, /^Built by Md Rashadul Islam/, text);
    } finally {
      await page.close();
      await storage.set(ext.worker, { uiLang: 'bn' });
    }
  });
}
