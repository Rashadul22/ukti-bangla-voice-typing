// Scores banglish.js against the corpus. Used by `npm run corpus` for the
// full report and by banglish.test.js for the floors that keep it honest.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

function engine(file = path.join(process.env.UKTI_EXT || ROOT, 'banglish.js')) {
  const sandbox = { self: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox);
  return sandbox.self.UktiBanglish;
}

const lines = file =>
  fs.readFileSync(path.join(__dirname, file), 'utf8')
    .split('\n').map(l => l.trimEnd()).filter(l => l && !l.startsWith('#'));

const pairs = file => lines(file).map(l => {
  const [input, want] = l.split('\t');
  return { input, want: want.split(' ').map(w => w.split('|')) };
});

function englishLists() {
  const all = lines('english.txt');
  const cut = all.indexOf('HELD-OUT');
  const dev = [...new Set(all.slice(0, cut))];
  const held = [...new Set(all.slice(cut + 1))].filter(w => !dev.includes(w));
  return { dev, held };
}

// A case passes when every output word is one of the accepted forms.
function scorePairs(B, cases) {
  const failures = [];
  let pass = 0;
  for (const { input, want } of cases) {
    const got = B.convert(input);
    const words = got.split(' ');
    const ok = words.length === want.length && words.every((w, i) => want[i].includes(w));
    if (ok) pass++;
    else failures.push({ input, got, want: want.map(w => w.join('|')).join(' ') });
  }
  return { pass, total: cases.length, failures };
}

function scoreEnglish(B, list) {
  const failures = [];
  let pass = 0;
  for (const word of list) {
    // In a sentence, the way it really arrives.
    const got = B.convert(`ami ${word} korbo`).split(' ')[1];
    if (got === word) pass++;
    else failures.push({ input: word, got, want: word });
  }
  return { pass, total: list.length, failures };
}

function scoreAll(B = engine()) {
  const english = englishLists();
  return {
    words: scorePairs(B, pairs('words.tsv')),
    sentences: scorePairs(B, pairs('sentences.tsv')),
    english: scoreEnglish(B, english.dev),
    heldoutWords: scorePairs(B, pairs('heldout-words.tsv')),
    heldoutSentences: scorePairs(B, pairs('heldout-sentences.tsv')),
    heldoutEnglish: scoreEnglish(B, english.held)
  };
}

const pct = r => (100 * r.pass / r.total).toFixed(1) + '%';

if (require.main === module) {
  const all = scoreAll();
  const show = process.argv.includes('--failures');
  for (const [name, r] of Object.entries(all)) {
    console.log(`${name.padEnd(17)} ${String(r.pass).padStart(4)}/${String(r.total).padEnd(4)} ${pct(r)}`);
    if (show && !name.startsWith('heldout')) {
      for (const f of r.failures) console.log(`    ${f.input}  ->  ${f.got}   (want ${f.want})`);
    }
  }
}

module.exports = { engine, scoreAll, pct };
