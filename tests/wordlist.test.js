// The word list: a public-domain list of 451,348 Bangla words, shipped as a
// 1% Bloom filter, repairs a Banglish conversion that is not a real word by
// trying the letters people confuse (শ/ষ/স, ন/ণ, ি/ী, ত/ট, থ/ঠ ...).
// FEATURES.md, experiment 1: held-out words 57.7% to 67.2%, tuning set
// unchanged. The filter lives in the offscreen document; the page asks for
// a repair and keeps its own conversion if the answer is slow or missing.

const nodeTest = require('node:test');
const { before, after } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { serve, launch, storage, waitFor, command, ROOT } = require('./helpers');

function engineWithWords() {
  const sandbox = { self: {}, atob: s => Buffer.from(s, 'base64').toString('binary') };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'banglish.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'bn-words.js'), 'utf8'), sandbox);
  const B = sandbox.self.UktiBanglish;
  return { B, has: B.wordSet(sandbox.self.UKTI_WORDS) };
}

const lines = f => fs.readFileSync(path.join(__dirname, 'corpus', f), 'utf8').split('\n').map(l => l.trimEnd()).filter(l => l && !l.startsWith('#'));
const score = (B, has, f) => {
  let pass = 0, n = 0;
  for (const l of lines(f)) {
    const [input, want] = l.split('\t'); n++;
    const got = B.repair(B.convert(input), has).normalize('NFC').split(' ');
    const w = want.split(' ').map(x => x.split('|').map(y => y.normalize('NFC')));
    if (got.length === w.length && got.every((g, i) => w[i].includes(g))) pass++;
  }
  return pass / n;
};

test('the shipped filter is small enough to carry, and knows real words', () => {
  const size = fs.statSync(path.join(ROOT, 'data', 'bn-words.js')).size;
  assert.ok(size < 800 * 1024, `${size} bytes`);
  const { has } = engineWithWords();
  for (const w of ['বাংলা', 'কোথায়', 'বাড়ি', 'ইতিহাস', 'গবেষণা', 'বিশেষ']) assert.ok(has(w), w);
});

test('repair keeps the tuning set and lifts the held-out set (floors)', () => {
  const { B, has } = engineWithWords();
  assert.ok(score(B, has, 'words.tsv') >= .99, 'tuning words dropped');
  assert.ok(score(B, has, 'sentences.tsv') >= .97, 'tuning sentences dropped');
  // Reported, not tuned against: these words are not in any dictionary.
  assert.ok(score(B, has, 'heldout-words.tsv') >= .66, 'held-out words');
});

test('repair leaves English, numbers and punctuation alone', () => {
  const { B, has } = engineWithWords();
  assert.equal(B.repair('Facebook 123 শকাল, ok।', has), 'Facebook 123 সকাল, ok।');
});

let server, base, ext;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  ext = await launch();
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn' });
});
after(async () => { await ext?.close(); server?.close(); });

for (const [typed, want] of [['bishesh shokal', 'বিশেষ সকাল'], ['thakur', 'ঠাকুর']]) {
  test(`in a box: "${typed}" becomes ${want}`, async () => {
    const page = await ext.context.newPage();
    try {
      await page.goto(`${base}/textarea.html`);
      await page.waitForFunction(() => window.mimic);
      await page.evaluate(() => { mimic.setText(''); mimic.el.focus(); });
      await page.keyboard.type(typed);
      await command(ext, page, 'to-bangla');
      assert.ok(await waitFor(async () => (await page.evaluate(() => mimic.el.value)).normalize('NFC') === want.normalize('NFC')),
        `got ${await page.evaluate(() => mimic.el.value)}`);
    } finally { await page.close(); }
  });
}
