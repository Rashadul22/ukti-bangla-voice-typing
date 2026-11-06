// What happens to a final segment before it reaches the box, as offscreen.js
// defines it: voice commands, snippets, English words in English letters,
// and digits. Each is checked against sentences it must leave alone.

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
  vm.runInNewContext(src + '\nself.f = { voiceCommand, applySnippets, mixEnglish, fixDigits };', sb);
  return sb.self.f;
}
const { voiceCommand, applySnippets, mixEnglish, fixDigits } = offscreen();

const rows = fs.readFileSync(path.join(__dirname, 'corpus', 'commands.tsv'), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('\t'));
const un = s => (s || '').replace(/\\n/g, '\n');

test('voice commands: every command is recognised', () => {
  const wrong = rows.filter(r => r[0] === 'cmd').map(([, said, text, punct, action]) => {
    const got = voiceCommand(said);
    const want = { text: un(text), punct: un(punct), action: action || '' };
    return JSON.stringify({ text: got.text, punct: got.punct || '', action: got.action || '' }) === JSON.stringify(want) ? null : `${said} -> ${JSON.stringify(got)}`;
  }).filter(Boolean);
  assert.deepEqual(wrong, []);
});

test('voice commands: ordinary speech passes through untouched', () => {
  const keep = rows.filter(r => r[0] === 'keep');
  assert.ok(keep.length >= 10);
  const broken = keep.map(([, said]) => [said, voiceCommand(said)])
    .filter(([said, got]) => got.text !== said || got.punct || got.action).map(([s, g]) => `${s} -> ${JSON.stringify(g)}`);
  assert.deepEqual(broken, []);
});

test('snippets fire only when the whole segment is the trigger', () => {
  const list = [{ say: 'আমার ঠিকানা', text: 'বাড়ি ১২, রোড ৩, ঢাকা' }, { say: 'আমার ইমেইল', text: 'me@example.com' }];
  assert.equal(applySnippets('আমার ঠিকানা', list), 'বাড়ি ১২, রোড ৩, ঢাকা');
  assert.equal(applySnippets('  আমার ইমেইল ', list), 'me@example.com');
  assert.equal(applySnippets('আমার ঠিকানা বদলেছে', list), null);
  assert.equal(applySnippets('তোমার ঠিকানা', list), null);
  assert.equal(applySnippets('আমার ঠিকানা', []), null);
  assert.equal(applySnippets('আমার ঠিকানা', null), null);
});

test('English words in English letters, with the Bangla ending kept apart', () => {
  assert.equal(mixEnglish('আমি অফিসে আছি'), 'আমি office এ আছি');
  assert.equal(mixEnglish('মিটিংটা কখন'), 'meeting টা কখন');
  assert.equal(mixEnglish('ফেসবুকে পোস্ট দাও'), 'Facebook এ post দাও');
  assert.equal(mixEnglish('আমার ফোনের চার্জ নাই'), 'আমার phone এর charge নাই');
});

test('English words: Bangla words that look alike are left alone', () => {
  for (const s of ['আমি ঢাকায় বাস করি', 'এখানে বস', 'কলের পানি', 'এই কেসটা জটিল', 'আমি ডাক্তার দেখাব', 'রিকশা নিয়ে আসো', 'আমার নাম রাশেদুল'])
    assert.equal(mixEnglish(s), s, s);
});

test('digits: Bangla, English, or as spoken', () => {
  assert.equal(fixDigits('বাড়ি 12, রোড ৩', 'bn'), 'বাড়ি ১২, রোড ৩');
  assert.equal(fixDigits('বাড়ি 12, রোড ৩', 'en'), 'বাড়ি 12, রোড 3');
  assert.equal(fixDigits('বাড়ি 12, রোড ৩', 'asis'), 'বাড়ি 12, রোড ৩');
  assert.equal(fixDigits('বাড়ি 12', undefined), 'বাড়ি 12');
});
