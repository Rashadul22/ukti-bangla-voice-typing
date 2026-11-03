// A real clipboard paste (the system clipboard, a trusted Ctrl+V) with the
// extension loaded. Ukti listens for keys in the capture phase on every
// page, so it must not swallow or disturb an ordinary paste, and its own
// conversions must never overwrite what the user has on the clipboard.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, boxState, command } = require('./helpers');

const ARCHETYPES = ['textarea', 'plain', 'model-paste', 'late-selection', 'quill', 'caret-restore'];

let server, ext, base;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  ext = await launch();
  await ext.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await storage.set(ext.worker, { coachDone: true });
});
after(async () => { await ext?.close(); server?.close(); });

for (const kind of ARCHETYPES) {
  test(`${kind}: a real Ctrl+V pastes once, at the caret`, async () => {
    const page = await ext.context.newPage();
    try {
      await page.goto(`${base}/${kind}.html`);
      await page.waitForFunction(() => window.mimic);
      await page.evaluate(() => navigator.clipboard.writeText(' তোমাকে'));
      await page.click('#ed');
      await page.keyboard.type('ami');
      await page.keyboard.press('Control+KeyV');
      const want = 'ami তোমাকে';
      const got = await waitFor(async () => {
        const s = await boxState(page);
        return s.dom === want && s.model === want ? s : null;
      }, { timeout: 2000 }) || await boxState(page);
      assert.deepEqual(got, { dom: want, model: want });
    } finally {
      await page.close();
    }
  });
}

test('converting does not touch the system clipboard', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(`${base}/model-paste.html`);
    await page.waitForFunction(() => window.mimic);
    await page.evaluate(() => navigator.clipboard.writeText('the user copied this'));
    await page.evaluate(() => mimic.setText('ami bangla'));
    await command(ext, page, 'to-bangla');
    assert.ok(await waitFor(async () => (await boxState(page)).model === 'আমি বাংলা'));
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'the user copied this');
  } finally {
    await page.close();
  }
});
