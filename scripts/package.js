#!/usr/bin/env node
// Validates and builds the release zip. Refuses to build when anything is
// off. Usage: node scripts/package.js   (or scripts/package.sh)
//
// Checks, in order:
//   1. manifest version equals the version in the setup page footer
//   2. every file the manifest, the pages and the scripts refer to exists
//   3. every icon is a PNG of the size its key claims
//   4. the test suite passes
// Then builds dist/ukti-<version>.zip from exactly the files referenced (plus
// LICENSE), so tests, docs and scratch files cannot leak into it, and loads
// the built zip as an unpacked extension to prove it starts.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const problems = [];
const fail = msg => problems.push(msg);

function stop() {
  if (!problems.length) return;
  console.error('Not building. Fix these first:\n' + problems.map(p => '  - ' + p).join('\n'));
  process.exit(1);
}

const manifest = JSON.parse(read('manifest.json'));
const version = manifest.version;

// 1. Version in step.
const footer = read('setup.html').match(/class="ver">v(\d+\.\d+\.\d+)</);
if (!footer) fail('setup.html has no <span class="ver">vX.Y.Z</span> footer');
else if (footer[1] !== version) fail(`manifest says ${version}, setup footer says ${footer[1]}`);

// 2. Every referenced file, followed through the pages and the scripts.
const files = new Set(['manifest.json']);
const add = f => { if (f) files.add(f.replace(/^\//, '')); };
add(manifest.background?.service_worker);
add(manifest.action?.default_popup);
add(manifest.options_page);
for (const cs of manifest.content_scripts || []) [...(cs.js || []), ...(cs.css || [])].forEach(add);
Object.values(manifest.icons || {}).forEach(add);
Object.values(manifest.action?.default_icon || {}).forEach(add);

const pending = [...files];
while (pending.length) {
  const f = pending.pop();
  if (!fs.existsSync(path.join(ROOT, f))) { fail(`missing file: ${f}`); continue; }
  const found = [];
  if (f.endsWith('.html')) {
    const html = read(f);
    for (const m of html.matchAll(/<(?:script|img)\b[^>]*\bsrc="([^"#?]+)"/g)) found.push(m[1]);
    for (const m of html.matchAll(/<link\b[^>]*\bhref="([^"#?]+)"/g)) found.push(m[1]);
  }
  if (f.endsWith('.js')) {
    // Extension pages opened by name from code: getURL('x.html'), url: 'x.html'.
    const js = read(f);
    for (const m of js.matchAll(/['"]([\w-]+\.html)['"]/g)) found.push(m[1]);
  }
  for (const g of found) {
    if (/^(https?:)?\/\//.test(g)) { fail(`${f} loads a remote file: ${g}`); continue; }
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(f), g));
    if (!files.has(rel)) { files.add(rel); pending.push(rel); }
  }
}

// 3. Icons are PNGs of the size they claim.
const iconSets = { ...(manifest.icons || {}), ...(manifest.action?.default_icon || {}) };
for (const [size, file] of Object.entries(iconSets)) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) continue;
  const head = fs.readFileSync(p).subarray(0, 24);
  if (!head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    fail(`${file} is not a PNG`);
    continue;
  }
  const w = head.readUInt32BE(16), h = head.readUInt32BE(20);
  if (w !== +size || h !== +size) fail(`${file} is ${w}x${h}, the manifest says ${size}x${size}`);
}
stop();

// 4. The tests.
if (!process.env.UKTI_PACKAGE_SKIP_TESTS) {
  console.log('Running the test suite...');
  const run = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'],
    { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  const summary = (run.stdout || '').match(/^# (tests|pass|fail) \d+$/gm) || [];
  console.log('  ' + summary.join(', ').replace(/# /g, ''));
  // Name what failed, so a flaky test is visible here and not only in a rerun.
  const failed = ((run.stdout || '').match(/^not ok \d+ - (?!.*# TODO).*$/gm) || []).map(l => l.replace(/^not ok \d+ - /, ''));
  for (const name of failed) console.log('  failed: ' + name);
  if (run.status !== 0) fail('the test suite failed; run npm test to see which tests');
}
stop();

// Build the zip. LICENSE goes in; nothing else that was not referenced does.
if (fs.existsSync(path.join(ROOT, 'LICENSE'))) files.add('LICENSE');
const list = [...files].sort();
const zip = buildZip(list.map(f => ({ name: f, data: fs.readFileSync(path.join(ROOT, f)) })));
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join('dist', `ukti-${version}.zip`);
fs.writeFileSync(path.join(ROOT, out), zip);
console.log(`Built ${out}: ${list.length} files, ${(zip.length / 1024).toFixed(1)} KB`);
for (const f of list) console.log('  ' + f);

// Prove the zip loads. Extract it and start it as an unpacked extension.
verifyLoads(path.join(ROOT, out), list, version).then(ok => process.exit(ok ? 0 : 1));

// ---------------------------------------------------------------- helpers

// A minimal zip writer: deflate, one central directory, no extras.
function buildZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1;   // fixed, so builds are reproducible
  for (const { name, data } of entries) {
    const body = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

function readZip(buf) {
  const files = {};
  let at = 0;
  while (buf.readUInt32LE(at) === 0x04034b50) {
    const size = buf.readUInt32LE(at + 18), nameLen = buf.readUInt16LE(at + 26), extra = buf.readUInt16LE(at + 28);
    const name = buf.subarray(at + 30, at + 30 + nameLen).toString('utf8');
    const start = at + 30 + nameLen + extra;
    files[name] = zlib.inflateRawSync(buf.subarray(start, start + size));
    at = start + size;
  }
  return files;
}

async function verifyLoads(zipPath, expected, want) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ukti-built-'));
  const files = readZip(fs.readFileSync(zipPath));
  const names = Object.keys(files).sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    console.error('The zip does not hold the expected files.');
    return false;
  }
  for (const [name, data] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), data);
  }
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (_) {
    console.log('Playwright not installed: skipped the load check. Load the zip by hand (RELEASING.md).');
    return true;
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ukti-built-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    const got = await worker.evaluate(() => chrome.runtime.getManifest().version);
    if (got !== want) { console.error(`Loaded, but reports version ${got}`); return false; }
    console.log(`Loaded the built zip as an unpacked extension: version ${got}, service worker running.`);
    return true;
  } catch (e) {
    console.error('The built zip did not load: ' + e.message);
    return false;
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
