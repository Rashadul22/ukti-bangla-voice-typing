// Settings migration in background.js. An unpacked extension keeps its id,
// so chrome.storage survives a remove and reinstall; migrate() is the only
// thing standing between an old saved value and a new default.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, storage, waitFor } = require('./helpers');

let ext;
before(async () => { ext = await launch(); });
after(async () => { await ext?.close(); });

const run = () => ext.worker.evaluate(() => migrate());
const schema = () => ext.worker.evaluate(() => SCHEMA);

test('a fresh install is stamped with the current schema and opens setup', async () => {
  const stamped = await waitFor(async () => (await storage.get(ext.worker, 'schema')).schema);
  assert.equal(stamped, await schema());
  const setup = await waitFor(() => ext.context.pages().find(p => p.url().endsWith('/setup.html')));
  assert.ok(setup, 'setup tab opened on install');
});

for (const old of [undefined, 0, 1, 2]) {
  test(`schema ${old ?? 'missing'}: changed defaults are moved, user choices kept`, async () => {
    await storage.clear(ext.worker);
    const saved = { layout: 'full', showHints: true, theme: 'dark', uiLang: 'en', disabledSites: ['x.com'], useCount: 9 };
    if (old !== undefined) saved.schema = old;
    await storage.set(ext.worker, saved);
    await run();
    const after = await storage.get(ext.worker);
    assert.equal(after.schema, await schema());
    assert.equal(after.layout, 'compact');
    assert.equal(after.showHints, false);
    assert.equal(after.theme, 'dark');
    assert.equal(after.uiLang, 'en');
    assert.deepEqual(after.disabledSites, ['x.com']);
    assert.equal(after.useCount, 9);
  });
}

test('a migrated profile keeps choices made after the migration', async () => {
  await storage.clear(ext.worker);
  await storage.set(ext.worker, { schema: await schema(), layout: 'full', showHints: true });
  await run();
  const after = await storage.get(ext.worker);
  assert.equal(after.layout, 'full');
  assert.equal(after.showHints, true);
});

test('migrating twice changes nothing the second time', async () => {
  await storage.clear(ext.worker);
  await storage.set(ext.worker, { layout: 'full' });
  await run();
  await storage.set(ext.worker, { layout: 'full' });
  await run();
  assert.equal((await storage.get(ext.worker, 'layout')).layout, 'full');
});

test('settings sent to content scripts fill every missing key with its default', async () => {
  await storage.clear(ext.worker);
  const s = await ext.worker.evaluate(() => getSettings());
  assert.equal(s.enabled, true);
  assert.deepEqual(s.disabledSites, []);
  assert.equal(s.layout, 'compact');
  assert.equal(s.showHints, false);
  assert.equal(s.uiLang, 'bn');
});

test('popup defaults agree with the service worker defaults', async () => {
  await storage.clear(ext.worker);
  const worker = await ext.worker.evaluate(() => getSettings());
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('popup.html'));
    const popup = await page.evaluate(() => DEFAULTS);
    for (const [key, value] of Object.entries(popup)) {
      assert.deepEqual(worker[key], value, `default for ${key}`);
    }
  } finally {
    await page.close();
  }
});
