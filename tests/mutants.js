#!/usr/bin/env node
// Mutation check for the suite itself. Each mutant puts back one bug that
// CLAUDE.md says was found and fixed, in a scratch copy of the extension,
// and runs the tests that should notice. A mutant the suite does not kill
// is a hole in the suite. Run with: npm run test:mutants

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const FILES = ['manifest.json', 'background.js', 'content.js', 'banglish.js', 'offscreen.js',
  'offscreen.html', 'popup.html', 'popup.js', 'setup.html', 'setup.js', 'i18n.js', 'icons'];

const MUTANTS = [
  { id: '1a', what: 'replaceAll tries only the paste strategy',
    file: 'content.js', from: "for (const how of ['paste', 'command', 'range'])", to: "for (const how of ['paste'])",
    tests: ['editors'] },
  { id: '1b', what: 'replaceAll trusts a check taken straight after the write',
    file: 'content.js',
    from: 'await nextTurn(140);\n      if (!element.isConnected) return false;\n      if (sameText(existingText(element), text)) return true;',
    to: 'return true;', tests: ['editors'] },
  { id: '2', what: 'no everythingSelected() guard before writing',
    file: 'content.js', from: 'if (!everythingSelected(element, doc)) continue;', to: '', tests: ['editors'] },
  { id: '3', what: 'putBack() counts any change as success',
    file: 'content.js', from: 'if (sameText(after, text)) return true;', to: 'if (after !== before) return true;',
    tests: ['editors'] },
  { id: '4', what: 'one selectEverything() and no wait before the write',
    file: 'content.js',
    from: 'selectEverything();\n      await nextTurn(35);\n      if (!element.isConnected) return false;\n      selectEverything();\n      await nextTurn(35);',
    to: 'selectEverything();', tests: ['editors'] },
  { id: '5', what: 'migrate() does nothing',
    file: 'background.js', from: 'if (schema >= SCHEMA) return;', to: 'return;', tests: ['migration'] },
  { id: '6', what: 'host_permissions added back',
    file: 'manifest.json', from: '"permissions": [', to: '"host_permissions": ["<all_urls>"],\n  "permissions": [',
    tests: ['strings', 'switches'] },
  { id: '7', what: 'resident backdrop-filter on the glass theme',
    file: 'content.js', from: '--blur: none;\n      /* Only the speech', to: '--blur: blur(8px);\n      /* Only the speech',
    tests: ['ui'] },
  { id: '8', what: 'adoptFocusedBox() not called at startup',
    file: 'content.js', from: '    paintHints();\n    adoptFocusedBox();', to: '    paintHints();', tests: ['ui'] },
  { id: '9', what: 'sensitive-field filter removed',
    file: 'content.js',
    from: "if (SENSITIVE.test(hint)) return true;", to: '', tests: ['ui', 'security'] },
  { id: '11', what: 'synthetic keys obeyed (no isTrusted check)',
    file: 'content.js', from: 'if (!event.isTrusted) return;\n    if (isOff()) return;', to: 'if (isOff()) return;',
    tests: ['security'] },
  { id: '12', what: 'remembered box not re-checked at the moment of use',
    file: 'content.js', from: '(lastEditable?.isConnected ? editableFrom(lastEditable) : null)',
    to: '(lastEditable?.isConnected ? lastEditable : null)', tests: ['security'] },
  { id: '10', what: 'toast back to one clipped line',
    file: 'content.js', from: 'white-space: normal;\n      overflow-wrap: break-word;',
    to: 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', tests: ['ui'] },
  { id: 'S1', what: 'hotkeys ignore the off switches',
    file: 'content.js', from: 'function handleHotkey(event) {\n    if (isOff()) return;', to: 'function handleHotkey(event) {',
    tests: ['switches'] },
  { id: 'S2', what: 'per-site key keeps the www. prefix',
    file: 'content.js', from: "try { return location.hostname.replace(/^www\\./, ''); }", to: 'try { return location.hostname; }',
    tests: ['switches'] },
  { id: 'B1', what: 'normalise() collapses doubled consonants (bollo becomes bolo)',
    file: 'banglish.js', from: ".replace(/([aeiou])\\1+/g, '$1')", to: ".replace(/([a-z])\\1+/g, '$1')",
    tests: ['banglish'] },
  { id: 'B2', what: '^th and ^sh treated as strong English signals',
    file: 'banglish.js', from: "    /ea|oa|ie/,", to: "    /ea|oa|ie/, /^(?:th|sh)[aeiou]/,",
    tests: ['banglish'] },
  { id: 'B3', what: 'ss and ll counted as English doubled consonants',
    file: 'banglish.js', from: "/([bdfgmprtz])\\1/,", to: "/([bdfglmprstz])\\1/,", tests: ['banglish'] },
  { id: 'B4', what: 'nasal cluster rule for ng removed',
    file: 'banglish.js', from: "if (pair === 'ng') {", to: "if (false) {", tests: ['banglish'] }
];

const only = process.argv.slice(2);
const results = [];

for (const m of MUTANTS.filter(m => !only.length || only.includes(m.id))) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ukti-mutant-${m.id}-`));
  for (const f of FILES) fs.cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  const file = path.join(dir, m.file);
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes(m.from)) {
    results.push({ ...m, verdict: 'STALE (pattern not found, update mutants.js)' });
    continue;
  }
  fs.writeFileSync(file, src.replace(m.from, m.to));
  const run = spawnSync(process.execPath,
    ['--test', '--test-concurrency=1', ...m.tests.map(t => path.join(__dirname, `${t}.test.js`))],
    { env: { ...process.env, UKTI_EXT: dir }, encoding: 'utf8' });
  const out = run.stdout + run.stderr;
  const failed = (out.match(/^not ok \d+ - (?!.*# TODO)(.*)$/gm) || []).map(l => l.replace(/^not ok \d+ - /, ''));
  results.push({ ...m, verdict: run.status === 0 ? 'SURVIVED' : 'killed', failed });
  fs.rmSync(dir, { recursive: true, force: true });
  process.stdout.write(`${m.id.padEnd(3)} ${results.at(-1).verdict.padEnd(8)} ${m.what}  (${failed.length} failing)\n`);
}

const survived = results.filter(r => r.verdict !== 'killed');
console.log(`\n${results.length - survived.length}/${results.length} mutants killed`);
for (const r of results) {
  if (r.failed?.length) console.log(`  ${r.id}: ${r.failed.slice(0, 4).join('; ')}${r.failed.length > 4 ? '; ...' : ''}`);
}
process.exit(survived.length ? 1 : 0);
