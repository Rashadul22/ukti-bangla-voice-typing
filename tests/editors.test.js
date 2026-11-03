// Convert and undo in every editor archetype, driven the way a user drives
// them: real keystrokes into the box, then the hotkey; and the floating
// buttons pressed after focus has gone somewhere else on the page.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, boxState, barShown, toast, command } = require('./helpers');

const SOURCE = 'ami bangla bolte pari';
const BANGLA = 'আমি বাংলা বলতে পারি';

const ARCHETYPES = ['textarea', 'plain', 'model-paste', 'late-selection', 'quill', 'caret-restore'];

let server, ext, base;

before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  ext = await launch();
  await storage.set(ext.worker, { coachDone: true });
});

after(async () => {
  await ext?.close();
  server?.close();
});

async function open(kind) {
  const page = await ext.context.newPage();
  await page.goto(`${base}/${kind}.html`);
  await page.waitForFunction(() => window.mimic);
  return page;
}

// Settles on the expected text or gives up, returning what was there last.
async function settle(page, expected) {
  const state = await waitFor(async () => {
    const s = await boxState(page);
    return s.dom === expected && s.model === expected ? s : null;
  }, { timeout: 5000 });
  // Watch a little longer: an editor that reverts does so on a later task.
  await page.waitForTimeout(250);
  return state ? await boxState(page) : await boxState(page);
}

for (const kind of ARCHETYPES) {
  test(`${kind}: typed Banglish, Ctrl+Shift+B converts, Ctrl+Shift+Z undoes`, async () => {
    const page = await open(kind);
    try {
      await page.click('#ed');
      await page.keyboard.type(SOURCE);
      assert.deepEqual(await boxState(page), { dom: SOURCE, model: SOURCE }, 'typing landed');
      assert.ok(await waitFor(() => barShown(page)), 'control shows for the focused box');

      await command(ext, page, 'to-bangla');
      assert.deepEqual(await settle(page, BANGLA), { dom: BANGLA, model: BANGLA }, 'converted');

      await command(ext, page, 'undo');
      assert.deepEqual(await settle(page, SOURCE), { dom: SOURCE, model: SOURCE }, 'undone');
    } finally {
      await page.close();
    }
  });

  test(`${kind}: buttons work after the box lost focus`, async () => {
    const page = await open(kind);
    try {
      await page.evaluate(s => mimic.setText(s), SOURCE);
      assert.ok(await waitFor(() => barShown(page)), 'control shows');
      await page.click('#elsewhere');

      const bar = '[data-ukti="bar"]';
      await page.click(`${bar} .toggle`);           // compact layout: open it
      await page.click(`${bar} button[aria-label="বাংলা করুন"]`);
      assert.deepEqual(await settle(page, BANGLA), { dom: BANGLA, model: BANGLA }, 'converted');
      assert.equal(await toast(page), 'বাংলা হয়েছে');

      await page.click(`${bar} button[aria-label="ফেরত নিন"]`);
      assert.deepEqual(await settle(page, SOURCE), { dom: SOURCE, model: SOURCE }, 'undone');
    } finally {
      await page.close();
    }
  });
}

test('undo with nothing to undo says so and leaves the box alone', async () => {
  const page = await open('plain');
  try {
    await page.evaluate(s => mimic.setText(s), SOURCE);
    await command(ext, page, 'undo');
    assert.equal(await waitFor(() => toast(page)), 'ফেরত নেওয়ার কিছু নাই');
    assert.deepEqual(await boxState(page), { dom: SOURCE, model: SOURCE });
  } finally {
    await page.close();
  }
});

test('Bangla text is refused by the Bangla button, untouched', async () => {
  const page = await open('textarea');
  try {
    await page.evaluate(s => mimic.setText(s), BANGLA);
    await command(ext, page, 'to-bangla');
    assert.equal(await waitFor(() => toast(page)), 'এটা তো অলরেডি বাংলা');
    assert.deepEqual(await boxState(page), { dom: BANGLA, model: BANGLA });
  } finally {
    await page.close();
  }
});

test('a selection converts only the selected words', async () => {
  const page = await open('textarea');
  try {
    await page.evaluate(() => { mimic.setText('hello ami bangla'); mimic.el.setSelectionRange(6, 16); });
    await command(ext, page, 'to-bangla');
    const want = 'hello আমি বাংলা';
    assert.deepEqual(await settle(page, want), { dom: want, model: want });
  } finally {
    await page.close();
  }
});

// The guard against writing into a box that is not fully selected, and the
// check that the box ends up holding what it should. Neither shows up in
// an editor that cooperates, so this one does not.
test('no-select: refuses to write, keeps the text, warns, and never doubles it', async () => {
  const page = await open('no-select');
  try {
    await page.evaluate(s => mimic.setText(s), SOURCE);
    await command(ext, page, 'to-bangla');
    const said = await waitFor(async () => {
      const t = await toast(page);
      return t && t !== 'বাংলা হয়েছে' ? t : null;
    }, { timeout: 6000 });
    await page.waitForTimeout(300);
    assert.equal(said, 'এই বক্সটা লেখা বদলাতে দিল না। লেখাটা সিলেক্ট করে আবার চেষ্টা করুন।');
    assert.deepEqual(await boxState(page), { dom: SOURCE, model: SOURCE }, 'text kept');
    const history = await page.evaluate(() => mimic.history());
    assert.deepEqual(history.filter(h => h !== SOURCE), [], 'the editor never held anything else');
  } finally {
    await page.close();
  }
});
