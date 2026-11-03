// Ukti - the corrections page: every word fix, the user's own and the ones
// Ukti offered to remember, to see, change, delete, export and import.
// Everything stays in chrome.storage.local; export writes a file the user
// chooses where to put, and import reads one the user picks.

const MAX_RULES = 2000;
const MAX_LEN = 200;
const MAX_FILE = 1024 * 1024;

const SAY = {
  bn: {
    count: n => `${n}টা শব্দ`,
    imported: (added, updated) => `আনা হলো: নতুন ${added}টা, বদলানো ${updated}টা।`,
    unreadable: 'ফাইলটা পড়া গেল না। উক্তির রাখা ফাইল, অথবা "যা শোনে = যা হবে" লাইনের লেখা ফাইল দিন।',
    tooBig: 'ফাইলটা অনেক বড়, বা কোনো শব্দ অনেক লম্বা। কিছু বদলানো হয়নি।',
    nothing: 'ফাইলে কোনো শব্দ পাওয়া যায়নি।',
    exported: 'ফাইলে রাখা হলো।'
  },
  en: {
    count: n => `${n} ${n === 1 ? 'correction' : 'corrections'}`,
    imported: (added, updated) => `Imported: ${added} new, ${updated} updated.`,
    unreadable: 'That file could not be read. Use a file Ukti exported, or a text file of "heard = becomes" lines.',
    tooBig: 'That file is too large, or a word in it is too long. Nothing was changed.',
    nothing: 'No corrections were found in that file.',
    exported: 'Saved to a file.'
  }
};
const say = (key, ...args) => {
  const v = SAY[uktiLang === 'en' ? 'en' : 'bn'][key];
  return typeof v === 'function' ? v(...args) : v;
};

const list = document.getElementById('list');
const count = document.getElementById('count');
const status = document.getElementById('status');

function rulesToText(rules) {
  return (rules || []).map(r => `${r.from} = ${r.to}`).join('\n');
}
function textToRules(text) {
  return text.split('\n').map(line => {
    const at = line.indexOf('=');
    if (at === -1) return null;
    const from = line.slice(0, at).trim();
    const to = line.slice(at + 1).trim();
    return from ? { from, to } : null;
  }).filter(Boolean);
}

let rules = [];
function paintCount() { count.textContent = say('count', rules.length); }
function tell(text, kind) { status.className = kind || ''; status.textContent = text; }

async function load() {
  const { replacements } = await chrome.storage.local.get({ replacements: [] });
  rules = Array.isArray(replacements) ? replacements : [];
  if (document.activeElement !== list) list.value = rulesToText(rules);
  paintCount();
}

let saveTimer = 0;
list.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    rules = textToRules(list.value);
    await chrome.storage.local.set({ replacements: rules });
    paintCount();
  }, 400);
});

// Another page (the popup, or Ukti remembering a correction) changed the list.
chrome.storage.onChanged.addListener(changes => {
  if (changes.replacements) load();
  if (changes.uiLang) paintCount();
});

document.getElementById('export').addEventListener('click', () => {
  const data = { type: 'ukti-corrections', version: 1, exported: new Date().toISOString(), replacements: rules };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ukti-corrections-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  tell(say('exported'), 'ok');
});

// Reads an export of Ukti's, a bare array of {from, to}, or plain text lines.
// Returns the rules, or null for a file that is not one of those.
function parse(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let data;
    try { data = JSON.parse(trimmed); } catch (_) { return null; }
    const arr = Array.isArray(data) ? data : data && data.replacements;
    if (!Array.isArray(arr)) return null;
    const out = [];
    for (const r of arr) {
      if (!r || typeof r.from !== 'string' || typeof (r.to ?? '') !== 'string') return null;
      if (r.from.trim()) out.push({ from: r.from.trim(), to: String(r.to ?? '').trim() });
    }
    return out;
  }
  return textToRules(text);
}

document.getElementById('importFile').addEventListener('change', async event => {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > MAX_FILE) return tell(say('tooBig'), 'bad');
  const incoming = parse(await file.text());
  if (!incoming) return tell(say('unreadable'), 'bad');
  if (!incoming.length) return tell(say('nothing'), 'bad');
  if (incoming.length > MAX_RULES || incoming.some(r => r.from.length > MAX_LEN || r.to.length > MAX_LEN)) {
    return tell(say('tooBig'), 'bad');
  }
  // Merge by the heard word: the file's answer wins, nothing is duplicated,
  // and the user's existing order is kept.
  const merged = rules.map(r => ({ ...r }));
  let added = 0, updated = 0;
  for (const r of incoming) {
    const at = merged.findIndex(m => m.from === r.from);
    if (at === -1) { merged.push(r); added++; }
    else if (merged[at].to !== r.to) { merged[at].to = r.to; updated++; }
  }
  if (merged.length > MAX_RULES) return tell(say('tooBig'), 'bad');
  rules = merged;
  await chrome.storage.local.set({ replacements: rules });
  list.value = rulesToText(rules);
  paintCount();
  tell(say('imported', added, updated), 'ok');
});

load();
