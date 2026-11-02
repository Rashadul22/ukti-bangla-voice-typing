// Task 13: the privacy claims Ukti makes, each checked against what the
// code does. If one of these fails, a sentence in the privacy policy has
// become false.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serve, launch, storage, waitFor, boxState, ROOT, EXT } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

let server, ext, port, cdpPort, off;
before(async () => {
  server = await serve();
  port = server.address().port;
  cdpPort = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdpPort}`] });
  await storage.set(ext.worker, { coachDone: true });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });

// What Chrome actually shows in the install dialog, asked of Chrome itself.
test('the install dialog warning is exactly the one the policy discloses', async () => {
  const manifest = fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8');
  const warnings = await ext.worker.evaluate(m => new Promise(r =>
    chrome.management.getPermissionWarningsByManifest(m, r)), manifest);
  assert.deepEqual(warnings, ['Read and change all your data on all websites']);
});

const CODE = ['background.js', 'content.js', 'banglish.js', 'offscreen.js', 'popup.js', 'setup.js', 'i18n.js'];

test('the extension code makes no network requests of its own', () => {
  const hits = [];
  for (const f of CODE) {
    fs.readFileSync(path.join(EXT, f), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|new\s+Image\s*\(|\.src\s*=/.test(line)) {
        hits.push(`${f}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(hits, []);
});

test('the extension code never writes to the console', () => {
  const hits = [];
  for (const f of CODE) {
    fs.readFileSync(path.join(EXT, f), 'utf8').split('\n').forEach((line, i) => {
      if (/\bconsole\.\w+\s*\(/.test(line)) hits.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('the pages load nothing from outside the extension', () => {
  const hits = [];
  for (const f of ['popup.html', 'setup.html', 'offscreen.html']) {
    const html = fs.readFileSync(path.join(EXT, f), 'utf8');
    // Things that load by themselves. A plain <a href> to the author's site
    // loads nothing until the user clicks it, so it is not counted.
    for (const m of html.matchAll(/\bsrc\s*=\s*["'](https?:)?\/\/[^"']+/gi)) hits.push(`${f}: ${m[0]}`);
    for (const m of html.matchAll(/<link\b[^>]*href\s*=\s*["'](https?:)?\/\/[^"']+/gi)) hits.push(`${f}: ${m[0]}`);
    for (const m of html.matchAll(/@import|url\(\s*["']?https?:/gi)) hits.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(hits, []);
});

test('dictated words are never written to storage, the page console, or left in the preview', async () => {
  off = await fakeSpeech(ext, cdpPort);
  const page = await ext.context.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  try {
    await page.goto(`http://127.0.0.1:${port}/textarea.html`);
    await page.waitForFunction(() => window.mimic);
    await page.click('#ed');
    await page.keyboard.press('Control+Shift+Space');
    assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')));
    const secret = 'আমার গোপন কথা';
    await off.eval(`__fake.say(${JSON.stringify(secret)}, false)`);
    await off.eval(`__fake.say(${JSON.stringify(secret)})`);
    assert.ok(await waitFor(async () => (await boxState(page)).dom === secret));
    await page.keyboard.press('Control+Shift+Space');
    await page.waitForTimeout(500);

    const stored = JSON.stringify(await storage.get(ext.worker));
    assert.equal(stored.includes(secret), false, 'dictated text found in chrome.storage');
    assert.equal(logs.some(l => l.includes(secret)), false, 'dictated text logged to the console');
    const preview = await page.evaluate(() =>
      document.querySelector('[data-ukti="bar"]').shadowRoot.querySelector('.preview').textContent);
    assert.equal(preview.includes(secret), false, 'dictated text left in the preview after stop');
  } finally { await page.close(); }
});

test('every key in storage is one the policy lists', async () => {
  // Touch every settings surface first: popup, setup, a conversion.
  for (const f of ['popup.html', 'setup.html']) {
    const p = await ext.context.newPage();
    await p.goto(ext.extUrl(f));
    await p.waitForTimeout(300);
    await p.close();
  }
  const listed = ['outputMode', 'cleanFillers', 'autoSubmit', 'uiSize', 'theme', 'enabled',
    'disabledSites', 'uiLang', 'layout', 'buttons', 'showHints', 'useCount', 'barPos',
    'barCorner', 'coachDone', 'replacements', 'setupDone', 'micGranted', 'schema'];
  const keys = Object.keys(await storage.get(ext.worker));
  assert.deepEqual(keys.filter(k => !listed.includes(k)), []);
  // And the source writes no key outside the list either.
  const written = new Set();
  for (const f of CODE) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/(?:storage\.local\.set|save)\(\{\s*([A-Za-z]+)\s*:/g)) written.add(m[1]);
  }
  assert.deepEqual([...written].filter(k => !listed.includes(k)), []);
});
