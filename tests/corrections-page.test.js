// The corrections page: every remembered correction visible, editable and
// deletable, with export to a file and import from one.

const nodeTest = require('node:test');
const { before, after, beforeEach } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launch, storage, waitFor } = require('./helpers');

let ext;
before(async () => { ext = await launch(); });
after(async () => { await ext?.close(); });
const RULES = [{ from: 'রাসাদুল', to: 'রাশাদুল' }, { from: 'কি', to: 'কী' }];
beforeEach(async () => { await storage.set(ext.worker, { uiLang: 'bn', replacements: RULES }); });

async function open() {
  const page = await ext.context.newPage();
  await page.goto(ext.extUrl('words.html'));
  await page.waitForTimeout(300);
  return page;
}
const stored = async () => (await storage.get(ext.worker, 'replacements')).replacements;
const tmp = (name, text) => { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ukti-imp-')), name); fs.writeFileSync(p, text); return p; };

test('every correction is listed', async () => {
  const page = await open();
  try {
    const text = await page.inputValue('#list');
    assert.equal(text.trim(), 'রাসাদুল = রাশাদুল\nকি = কী');
    assert.match(await page.textContent('#count'), /2|২/);
  } finally { await page.close(); }
});

test('editing and deleting in the list is saved', async () => {
  const page = await open();
  try {
    await page.fill('#list', 'রাসাদুল = রাশাদুল\nআমি = আমিই');
    assert.ok(await waitFor(async () => JSON.stringify(await stored()) === JSON.stringify([{ from: 'রাসাদুল', to: 'রাশাদুল' }, { from: 'আমি', to: 'আমিই' }])),
      JSON.stringify(await stored()));
  } finally { await page.close(); }
});

test('export writes every correction to a file', async () => {
  const page = await open();
  try {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
    assert.match(download.suggestedFilename(), /^ukti-corrections.*\.json$/);
    const file = await download.path();
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.type, 'ukti-corrections');
    assert.equal(data.version, 1);
    assert.deepEqual(data.replacements, RULES);
  } finally { await page.close(); }
});

test('import merges a file: new ones added, same word updated, nothing duplicated', async () => {
  const page = await open();
  try {
    const file = tmp('in.json', JSON.stringify({ type: 'ukti-corrections', version: 1,
      replacements: [{ from: 'কি', to: 'কি?' }, { from: 'ঢাকা শহর', to: 'ঢাকা' }] }));
    await page.setInputFiles('#importFile', file);
    assert.ok(await waitFor(async () => (await stored()).length === 3));
    assert.deepEqual(await stored(), [{ from: 'রাসাদুল', to: 'রাশাদুল' }, { from: 'কি', to: 'কি?' }, { from: 'ঢাকা শহর', to: 'ঢাকা' }]);
    assert.match(await page.textContent('#status'), /1.*1|১.*১/);
  } finally { await page.close(); }
});

test('import also reads the plain "heard = becomes" text form', async () => {
  const page = await open();
  try {
    await page.setInputFiles('#importFile', tmp('in.txt', 'নতুন = নূতন\n\nভুল লাইন\n'));
    assert.ok(await waitFor(async () => (await stored()).length === 3));
    assert.deepEqual((await stored())[2], { from: 'নতুন', to: 'নূতন' });
  } finally { await page.close(); }
});

test('a broken or oversized file is refused, and nothing changes', async () => {
  const page = await open();
  try {
    await page.setInputFiles('#importFile', tmp('bad.json', '{"type": "ukti-corrections", "replacements": [1, 2'));
    await page.waitForTimeout(500);
    assert.deepEqual(await stored(), RULES);
    assert.ok((await page.textContent('#status')).length > 0, 'no message');
    const huge = { type: 'ukti-corrections', version: 1, replacements: [{ from: 'x'.repeat(5000), to: 'y' }] };
    await page.setInputFiles('#importFile', tmp('huge.json', JSON.stringify(huge)));
    await page.waitForTimeout(500);
    assert.deepEqual(await stored(), RULES);
  } finally { await page.close(); }
});

test('the popup links to the page', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('popup.html'));
    await page.locator('.tabs button').nth(2).click();
    await page.waitForTimeout(300);
    const [opened] = await Promise.all([ext.context.waitForEvent('page'), page.click('#openWords')]);
    await opened.waitForLoadState();
    assert.match(opened.url(), /words\.html$/);
    await opened.close();
  } finally { await page.close(); }
});

test('in English, no Bengali is left on the page except the corrections themselves', async () => {
  await storage.set(ext.worker, { uiLang: 'en' });
  const page = await open();
  try {
    const leftovers = await page.evaluate(() => {
      const out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const n = w.currentNode;
        if (n.parentElement.closest('script,style,textarea')) continue;
        if (/[ঀ-৿]/.test(n.nodeValue)) out.push(n.nodeValue.trim());
      }
      if (/[ঀ-৿]/.test(document.title)) out.push(document.title);
      return out;
    });
    assert.deepEqual(leftovers, []);
  } finally { await page.close(); }
});
