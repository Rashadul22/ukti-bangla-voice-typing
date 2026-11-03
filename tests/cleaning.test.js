// What our own code does to dictated words before they reach the box: the
// filler cleaner and the replacement list, run as offscreen.js defines them.
// Measured 3 November: the cleaner damaged 23 of 25 legitimate sentences.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EXT } = require('./helpers');

function offscreen() {
  const src = fs.readFileSync(path.join(EXT, 'offscreen.js'), 'utf8');
  const ev = { addListener() {} };
  const sb = { self: {}, chrome: { runtime: { onMessage: ev, sendMessage: () => Promise.resolve() } },
    navigator: {}, setTimeout, clearTimeout, setInterval, clearInterval };
  vm.runInNewContext(src + '\nself.f = { cleanFillers, applyReplacements };', sb);
  return sb.self.f;
}
const { cleanFillers, applyReplacements } = offscreen();

const rows = fs.readFileSync(path.join(__dirname, 'corpus', 'fillers.tsv'), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('\t'));

test('the filler cleaner leaves every legitimate use alone', () => {
  const broken = rows.filter(([k]) => k === 'keep').map(([, s, want]) => [s, cleanFillers(s), want])
    .filter(([, got, want]) => got !== want).map(([s, got]) => `${s} -> ${got}`);
  assert.deepEqual(broken, []);
});

test('the filler cleaner still removes real fillers, without stray spaces', () => {
  const wrong = rows.filter(([k]) => k === 'filler').map(([, s, want]) => [s, cleanFillers(s), want])
    .filter(([, got, want]) => got !== want).map(([s, got, want]) => `${s} -> "${got}", want "${want}"`);
  assert.deepEqual(wrong, []);
});

test('the cleaner never leaves a fragment of a word behind', () => {
  // Every word of the output must be a whole word of the input.
  for (const [, s] of rows) {
    const inWords = new Set(s.split(/[\s,।?!]+/).filter(Boolean));
    for (const w of cleanFillers(s).split(/[\s,।?!]+/).filter(Boolean)) {
      assert.ok(inWords.has(w), `"${w}" in "${cleanFillers(s)}" is not a word of "${s}"`);
    }
  }
});

test('a replacement applies to whole words only', () => {
  const rules = [{ from: 'কি', to: 'কী' }];
  assert.equal(applyReplacements('তুমি কি খাবে', rules), 'তুমি কী খাবে');
  assert.equal(applyReplacements('আর কিছু লাগবে কিন্তু থাকি', rules), 'আর কিছু লাগবে কিন্তু থাকি');
  assert.equal(applyReplacements('কি, কি? কি।', rules), 'কী, কী? কী।');
});

test('a replacement of several words still matches as a phrase', () => {
  assert.equal(applyReplacements('আমি ঢাকা শহর যাব', [{ from: 'ঢাকা শহর', to: 'ঢাকা' }]), 'আমি ঢাকা যাব');
  assert.equal(applyReplacements('রাসাদুল আর রাসাদুলের', [{ from: 'রাসাদুল', to: 'রাশাদুল' }]), 'রাশাদুল আর রাসাদুলের');
});
