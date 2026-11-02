// Static checks on user-facing text. No browser needed.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT } = require('./helpers');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const content = read('content.js');

function contentStrings() {
  const start = content.indexOf('const STRINGS = {');
  const end = content.indexOf('\n  };', start);
  return vm.runInNewContext('(' + content.slice(start + 'const STRINGS = '.length, end + 4) + ')');
}

test('content.js STRINGS has the same keys in Bangla and English', () => {
  const { bn, en } = contentStrings();
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bn).sort());
});

test('content.js English strings contain no Bengali', () => {
  const { en } = contentStrings();
  const bad = Object.entries(en)
    .map(([k, v]) => [k, typeof v === 'function' ? v(5) : v])
    .filter(([, v]) => /[ঀ-৿]/.test(v));
  assert.deepEqual(bad, []);
});

test('no em dashes in any user-facing file', () => {
  const files = ['content.js', 'i18n.js', 'popup.html', 'popup.js', 'setup.html', 'setup.js',
    'background.js', 'offscreen.js', 'banglish.js', 'manifest.json', 'README.md'];
  const hits = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => { if (line.includes('—')) hits.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(hits, []);
});

test('version matches in manifest.json and the setup page footer', () => {
  const { version } = JSON.parse(read('manifest.json'));
  const setup = read('setup.html');
  const footer = setup.match(/v(\d+\.\d+\.\d+)/);
  assert.ok(footer, 'setup page shows a version');
  assert.equal(footer[1], version);
});

test('manifest asks for storage and offscreen only, and no host permissions', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.deepEqual([...m.permissions].sort(), ['offscreen', 'storage']);
  assert.equal(m.host_permissions, undefined);
  assert.equal(m.optional_host_permissions, undefined);
});

// Every Bengali literal in content.js outside STRINGS is a message the
// English setting cannot reach. Listed by line so they can be moved in.
// Was a todo until task 10 moved the start failure, "reconnecting" and every
// fatalMessage() case into STRINGS.
test('content.js has no Bengali messages outside STRINGS', () => {
  const start = content.indexOf('const STRINGS = {');
  const end = content.indexOf('\n  };', start);
  const outside = content.slice(0, start) + ' '.repeat(end - start) + content.slice(end);
  const hits = [];
  outside.split('\n').forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return;                // comments
    if (/'অ'/.test(line) && !/[ঀ-৿]/.test(line.replace(/'অ'/g, ''))) return;  // the button glyph
    if (/[ঀ-৿]/.test(line)) hits.push(`content.js:${i + 1}: ${line.trim()}`);
  });
  assert.deepEqual(hits, []);
});
