// Startup, the fields Ukti must never touch, and two rendering rules that
// were each found the hard way (no resident blur, a toast that wraps).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, barShown } = require('./helpers');

let server, ext, base;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  ext = await launch();
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn' });
});
after(async () => { await ext?.close(); server?.close(); });

async function open(name) {
  const page = await ext.context.newPage();
  await page.goto(`${base}/${name}`);
  await page.waitForFunction(() => window.mimic);
  return page;
}

test('a box focused before the script loaded still gets the control', async () => {
  const page = await open('autofocus.html');
  try {
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ed');
    assert.ok(await waitFor(() => barShown(page), { timeout: 3000 }));
    await page.keyboard.type('ami bangla');
    await page.keyboard.press('Control+Shift+KeyB');
    assert.ok(await waitFor(() => page.evaluate(() => mimic.el.value === 'আমি বাংলা')));
  } finally {
    await page.close();
  }
});

for (const id of ['password', 'otp', 'pin', 'cvv', 'card', 'cc', 'number']) {
  test(`#${id}: no control, and the hotkey leaves it alone`, async () => {
    const page = await open('fields.html');
    try {
      await page.click(`#${id}`);
      await page.keyboard.type(id === 'number' ? '1234' : 'ami bangla');
      const typed = await page.inputValue(`#${id}`);
      await page.keyboard.press('Control+Shift+KeyB');
      await page.waitForTimeout(600);
      assert.equal(await barShown(page), false, 'control stays hidden');
      assert.equal(await page.inputValue(`#${id}`), typed, 'value untouched');
    } finally {
      await page.close();
    }
  });
}

test('an ordinary text field next to them does get the control', async () => {
  const page = await open('fields.html');
  try {
    await page.click('#ok');
    assert.ok(await waitFor(() => barShown(page)));
  } finally {
    await page.close();
  }
});

// Collects every element in the shadow root whose computed backdrop-filter
// is not "none".
const blurred = page => page.evaluate(() => {
  const root = document.querySelector('[data-ukti="bar"]').shadowRoot;
  return [...root.querySelectorAll('*')]
    .filter(el => {
      const v = getComputedStyle(el).backdropFilter;
      return v && v !== 'none';
    })
    .map(el => el.className || el.tagName);
});

for (const theme of ['glass', 'dark', 'light']) {
  test(`${theme}: nothing resident carries backdrop-filter`, async () => {
    await storage.set(ext.worker, { theme });
    const page = await open('textarea.html');
    try {
      await page.click('#ed');
      assert.ok(await waitFor(() => barShown(page)));
      await page.click('[data-ukti="bar"] .toggle');        // fan everything out
      await page.keyboard.press('Control+Shift+KeyB');      // and raise a toast
      await page.waitForTimeout(300);
      assert.deepEqual(await blurred(page), []);
    } finally {
      await page.close();
      await storage.set(ext.worker, { theme: 'glass' });
    }
  });
}

test('a long toast wraps onto more lines instead of being cut off', async () => {
  const page = await open('textarea.html');
  try {
    await page.setViewportSize({ width: 480, height: 700 });
    await page.click('#ed');
    await waitFor(() => barShown(page));
    await page.keyboard.press('Control+Shift+KeyB');   // empty box: short toast first, creates it
    await waitFor(() => page.evaluate(() =>
      !!document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.toast.on')));
    const out = await page.evaluate(() => {
      const t = document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.toast');
      const one = t.getBoundingClientRect().height;
      t.textContent = 'অনুবাদ করে একই লেখা ফেরত আসলো। সেটআপে দেখুন ভাষা প্যাক নামানো আছে কিনা।';
      const r = t.getBoundingClientRect();
      const cs = getComputedStyle(t);
      return { one, many: r.height, line: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2, clipped: t.scrollWidth > t.clientWidth + 1,
        ellipsis: cs.textOverflow, left: r.left, right: r.right, vw: innerWidth };
    });
    assert.notEqual(out.ellipsis, 'ellipsis');
    assert.equal(out.clipped, false, 'no hidden overflow');
    assert.ok(out.many - out.one >= out.line * 0.9, `wrapped: ${out.one}px -> ${out.many}px, line ${out.line}px`);
    assert.ok(out.left >= 0 && out.right <= out.vw, 'stays inside the window');
  } finally {
    await page.close();
  }
});
