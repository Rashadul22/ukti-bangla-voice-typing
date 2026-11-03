// Task 12: the packager refuses a bad release, and an upgrade keeps the
// user's choices while moving changed defaults.

const nodeTest = require('node:test');
const test = (name, fn) => nodeTest.test(name, { timeout: 180000 }, fn);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execSync } = require('node:child_process');
const { chromium } = require('playwright');
const { ROOT } = require('./helpers');
// The version this tree ships as; the tests follow it instead of pinning it.
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;

const RUNTIME = ['manifest.json', 'background.js', 'content.js', 'banglish.js', 'offscreen.js',
  'offscreen.html', 'popup.html', 'popup.js', 'setup.html', 'setup.js', 'i18n.js', 'shortcuts.js', 'words.html', 'words.js', 'fx.css', 'fx.js', 'data', 'icons', 'LICENSE'];

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ukti-release-'));
  for (const f of [...RUNTIME, 'scripts', 'package.json']) fs.cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  return dir;
}
const pack = (dir, env = { UKTI_PACKAGE_SKIP_TESTS: '1' }) =>
  spawnSync(process.execPath, [path.join(dir, 'scripts', 'package.js')], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
const edit = (dir, file, from, to) => {
  const p = path.join(dir, file);
  const s = fs.readFileSync(p, 'utf8');
  assert.ok(s.includes(from), `${file} has no ${from}`);
  fs.writeFileSync(p, s.replace(from, to));
};

test('packager: builds a clean tree', () => {
  const dir = scratch();
  const run = pack(dir);
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.ok(fs.existsSync(path.join(dir, 'dist', `ukti-${VERSION}.zip`)));
  assert.ok(run.stdout.includes(`Loaded the built zip as an unpacked extension: version ${VERSION}`), run.stdout);
});

test('packager: refuses when the two version strings drift', () => {
  const dir = scratch();
  edit(dir, 'manifest.json', `"version": "${VERSION}"`, '"version": "9.9.9"');
  const run = pack(dir);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /manifest says 1\.0\.2, setup footer says 1\.0\.1/);
});

test('packager: refuses when a referenced file is missing', () => {
  const dir = scratch();
  fs.rmSync(path.join(dir, 'offscreen.js'));
  const run = pack(dir);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /missing file: offscreen\.js/);
});

test('packager: refuses an icon of the wrong size', () => {
  const dir = scratch();
  fs.copyFileSync(path.join(dir, 'icons', 'icon16.png'), path.join(dir, 'icons', 'icon48.png'));
  const run = pack(dir);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /icon48\.png is 16x16, the manifest says 48x48/);
});

test('packager: refuses when the tests fail', () => {
  const dir = scratch();
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pkg.scripts.test = 'node -e "process.exit(1)"';
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  const run = pack(dir, {});
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /the test suite failed/);
});

test('packager: development files stay out of the zip', () => {
  const dir = scratch();
  fs.writeFileSync(path.join(dir, 'NOTES.md'), 'scratch');
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.writeFileSync(path.join(dir, 'tests', 'x.test.js'), '');
  const run = pack(dir);
  assert.equal(run.status, 0, run.stderr);
  const listing = execSync(`unzip -Z1 ${path.join(dir, 'dist', `ukti-${VERSION}.zip`)}`, { encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(listing.filter(f => /\.md$|^tests\/|^scripts\/|package\.json/.test(f)), []);
});

// ------------------------------------------------------------- upgrades

// Installs `from` into a profile, saves settings, then puts `to` at the same
// path (same extension id, as with an unpacked reinstall or a store update)
// and starts Chrome again on the same profile.
async function upgrade(from, to, saved) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ukti-upgrade-ext-'));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ukti-upgrade-profile-'));
  const start = async () => {
    const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`] });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    return { context, worker };
  };
  from(dir);
  let { context, worker } = await start();
  await worker.evaluate(s => chrome.storage.local.set(s), saved);
  const before = await worker.evaluate(() => chrome.runtime.getManifest().version);
  await context.close();

  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  to(dir);
  // Restarting with --load-extension on the same path refreshes the manifest
  // but serves the old service worker script from Chrome's cache: measured,
  // the worker still had the old SCHEMA. A store update installs afresh.
  // Clearing only the worker cache (storage is elsewhere in the profile)
  // makes Chrome register the new code, as an update does.
  fs.rmSync(path.join(profile, 'Default', 'Service Worker'), { recursive: true, force: true });
  ({ context, worker } = await start());
  await new Promise(r => setTimeout(r, 1500));
  const after = await worker.evaluate(() => chrome.runtime.getManifest().version);
  const stored = await worker.evaluate(() => chrome.storage.local.get(null));
  const schema = await worker.evaluate(() => SCHEMA);
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  return { before, after, stored, schema };
}

const current = (version, footer = version) => dir => {
  for (const f of RUNTIME) fs.cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  edit(dir, 'manifest.json', `"version": "${VERSION}"`, `"version": "${version}"`);
  edit(dir, 'setup.html', `class="ver">v${VERSION}<`, `class="ver">v${footer}<`);
};
const released = commit => dir => {
  execSync(`git archive ${commit} | tar -x -C ${dir}`, { cwd: ROOT, shell: '/bin/bash' });
};

const CHOICES = {
  theme: 'dark', uiLang: 'en', outputMode: 'english', barCorner: 'bl', uiSize: 'large',
  disabledSites: ['example.com'], replacements: [{ from: 'রাসাদুল', to: 'রাশাদুল' }],
  buttons: { banglish: true, english: false, undo: true, grip: false }, enabled: true
};

test('upgrade: the real 1.0.1 release to this tree keeps every choice', async () => {
  const r = await upgrade(released('1afd7c7'), current('1.0.2'), CHOICES);
  assert.equal(r.before, '1.0.1');
  assert.equal(r.after, '1.0.2');
  for (const [k, v] of Object.entries(CHOICES)) assert.deepEqual(r.stored[k], v, k);
  assert.equal(r.stored.schema, r.schema);
});

// The version before the v3 defaults changed: its users have schema 2 and
// the old layout. Their choices must survive; the changed defaults must move.
test('upgrade: a schema 2 install gets the v3 defaults and keeps its choices', async () => {
  const schema2 = dir => {
    current('1.0.0')(dir);
    edit(dir, 'background.js', 'const SCHEMA = 3;', 'const SCHEMA = 2;');
  };
  const r = await upgrade(schema2, current('1.0.2'),
    { ...CHOICES, layout: 'full', showHints: true });
  assert.equal(r.before, '1.0.0');
  assert.equal(r.after, '1.0.2');
  assert.equal(r.stored.layout, 'compact', 'changed default not migrated');
  assert.equal(r.stored.showHints, false, 'changed default not migrated');
  for (const [k, v] of Object.entries(CHOICES)) assert.deepEqual(r.stored[k], v, k);
  assert.equal(r.stored.schema, 3);
});
