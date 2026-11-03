// The Banglish engine against the corpus in tests/corpus, plus the specific
// behaviours CLAUDE.md says were found and fixed. No browser needed.
//
// The floors are the scores measured when they were set. Raise them when
// the engine improves; a change that lowers one has broken something.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { engine, scoreAll } = require('./corpus/score');

const B = engine();
const scores = scoreAll(B);

const FLOORS = {
  words: 478, sentences: 45, english: 168,
  heldoutWords: 79, heldoutSentences: 16, heldoutEnglish: 43
};

for (const [name, floor] of Object.entries(FLOORS)) {
  test(`corpus ${name}: at least ${floor}/${scores[name].total}`, () => {
    const r = scores[name];
    const sample = r.failures.slice(0, 8).map(f => `${f.input} -> ${f.got} (want ${f.want})`).join('\n  ');
    assert.ok(r.pass >= floor, `${r.pass}/${r.total}, floor ${floor}\n  ${sample}`);
  });
}

const same = (cases) => {
  for (const [input, want] of Object.entries(cases)) assert.equal(B.convert(input), want, input);
};

test('nasal clusters: ng is ং before a consonant or at the end, ঙ before a vowel, nk keeps its k', () => {
  same({ bangla: 'বাংলা', ingreji: 'ইংরেজি', rong: 'রং', bangali: 'বাঙালি', bhanga: 'ভাঙা',
    sonkhya: 'সংখ্যা', onko: 'অংক' });
});

test('a doubled consonant survives normalising: bollo is বললো, bolo is বলো', () => {
  same({ bollo: 'বললো', bolo: 'বলো', bollam: 'বললাম' });
});

test('th and sh openings are weak English signals: these stay Bengali', () => {
  same({ thanda: 'ঠান্ডা', shomoy: 'সময়', shundor: 'সুন্দর', shomossa: 'সমস্যা' });
});

test('ll, kk, nn and ss are not English signals, because Banglish doubles them', () => {
  for (const w of ['bollo', 'pakka', 'onno', 'somossa']) {
    assert.notEqual(B.convert(w), w, `${w} was passed through as English`);
  }
});

test('English words with Bangla look-alike endings pass through whole', () => {
  same({ possible: 'possible', little: 'little', data: 'data', quota: 'quota' });
});

test('English stems keep a Bangla classifier', () => {
  same({ computerta: 'computerটা', extensionta: 'extensionটা', filegulo: 'fileগুলো' });
});

test('y after a consonant is the য-ফলা, and য় never joins a conjunct', () => {
  same({ sondhya: 'সন্ধ্যা', hoyto: 'হয়তো', hoyni: 'হয়নি', meye: 'মেয়ে' });
});

test('a bare verb stem is not a word: khata is খাতা, not খা + টা', () => {
  same({ khata: 'খাতা', ashbo: 'আসবো', jacchi: 'যাচ্ছি' });
});

test('classify: English prose, Banglish, Bangla', () => {
  assert.equal(B.classify('I will send you the file tomorrow morning'), 'english');
  assert.equal(B.classify('ami kal office e jabo'), 'banglish');
  assert.equal(B.classify('আমি কাল অফিসে যাব'), 'bangla');
  assert.equal(B.classify('   '), 'empty');
});

test('converting twice is harmless', () => {
  const once = B.convert('ami tomake bhalobashi, eta amar computer');
  assert.equal(B.convert(once), once);
});

// Translator output is plain English, but it often contains a word that is
// also in the Bangla dictionary ("Bangla", "to"), and classify() used to call
// any such sentence Banglish, so অ transliterated it into a jumble.
test('classify: English sentences a translator writes are English', () => {
  for (const t of ['I speak Bangla every day', 'I want to go home', 'He is a good boy',
    'How are you doing today?', 'I will send you the file tomorrow morning', 'Please call me back',
    'Where do you live in Bangladesh?', 'My name is Rahim and I am from Dhaka']) {
    assert.equal(B.classify(t), 'english', t);
  }
});

test('classify: every Banglish sentence in the corpus is still Banglish', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (const f of ['sentences.tsv', 'heldout-sentences.tsv']) {
    for (const line of fs.readFileSync(path.join(__dirname, 'corpus', f), 'utf8').split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const input = line.split('\t')[0];
      assert.equal(B.classify(input), 'banglish', input);
    }
  }
});
