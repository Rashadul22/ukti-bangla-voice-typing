// Shortcuts through chrome.commands. Ukti must not swallow keys a page
// uses (it took Ctrl+Shift+Z, redo in Docs and Figma, and Chrome's own
// Ctrl+Shift+B), the bindings must be the user's to change, and a command
// must do nothing unless focus is in a box Ukti handles.
//
// Chrome's accelerator layer cannot be driven from a headless test (a
// synthetic Alt+Shift+1 never fires onCommand, measured), so commands are
// delivered by calling the worker's handler with what Chrome would pass.

const nodeTest = require('node:test');
const { before, after, beforeEach } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serve, launch, storage, waitFor, boxState, toast, barShown, command, EXT } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

let server, ext, port, cdpPort, off;
before(async () => {
  server = await serve();
  port = server.address().port;
  cdpPort = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdpPort}`, '--host-resolver-rules=MAP *.test 127.0.0.1'] });
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn' });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => { await storage.set(ext.worker, { enabled: true, disabledSites: [], uiLang: 'bn' }); });

async function open(file = 'plain.html', host = '127.0.0.1') {
  const page = await ext.context.newPage();
  await page.goto(`http://${host}:${port}/${file}`);
  await page.waitForFunction(() => window.mimic || document.readyState === 'complete');
  return page;
}

for (const where of ['in a text box', 'with no box focused']) {
  test(`a page receives Ctrl+Shift+Z, B, E and Alt+Z ${where}`, async () => {
    const page = await open();
    try {
      await page.evaluate(() => {
        window.seen = [];
        document.addEventListener('keydown', e => {
          if ((e.ctrlKey && e.shiftKey) || e.altKey) seen.push(e.code);
        });
      });
      await page.click(where === 'in a text box' ? '#ed' : '#elsewhere');
      for (const k of ['Control+Shift+KeyZ', 'Control+Shift+KeyB', 'Control+Shift+KeyE', 'Alt+KeyZ']) {
        await page.keyboard.press(k);
      }
      const seen = (await page.evaluate(() => window.seen)).filter(c => c.startsWith('Key'));
      assert.deepEqual(seen, ['KeyZ', 'KeyB', 'KeyE', 'KeyZ']);
    } finally { await page.close(); }
  });
}

// Shortcuts that belong to Chrome, the operating system, or editors people
// use every day. A default on one of these takes the key from the user on
// every site, because a command shortcut is consumed before the page sees it.
const TAKEN = [
  // Chrome
  'Ctrl+Shift+B', 'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Ctrl+Shift+W', 'Ctrl+Shift+Q', 'Ctrl+Shift+J',
  'Ctrl+Shift+I', 'Ctrl+Shift+C', 'Ctrl+Shift+O', 'Ctrl+Shift+A', 'Ctrl+Shift+M', 'Ctrl+Shift+R',
  'Ctrl+Shift+Delete', 'Alt+Shift+I', 'Alt+Shift+T', 'Alt+Shift+A',
  // Undo and redo everywhere, and common editor commands
  'Ctrl+Shift+Z', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+V', 'Ctrl+Shift+E', 'Ctrl+Shift+L',
  'Ctrl+Shift+7', 'Ctrl+Shift+8', 'Ctrl+Shift+9', 'Ctrl+Shift+Period', 'Ctrl+Shift+Comma',
  // Google Docs menus on Windows and ChromeOS, and strikethrough
  'Alt+Shift+F', 'Alt+Shift+E', 'Alt+Shift+V', 'Alt+Shift+O', 'Alt+Shift+H', 'Alt+Shift+N',
  'Alt+Shift+K', 'Alt+Shift+5',
  // VS Code for the web: word wrap
  'Alt+Z'
];

test('the manifest declares the four commands, with defaults clear of known shortcuts', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const names = Object.keys(m.commands || {}).sort();
  assert.deepEqual(names, ['to-bangla', 'to-english', 'toggle-dictation', 'undo']);
  for (const [name, c] of Object.entries(m.commands)) {
    assert.ok(c.description, `${name} has no description`);
    for (const key of Object.values(c.suggested_key || {})) {
      assert.equal(TAKEN.includes(key), false, `${name} defaults to ${key}, which is taken`);
      assert.match(key, /^(Ctrl|Alt|Command|MacCtrl)\+/, `${name}: ${key} needs Ctrl or Alt`);
    }
  }
});

test('Chrome registered the bindings', async () => {
  const all = await ext.worker.evaluate(() => chrome.commands.getAll());
  const bound = Object.fromEntries(all.map(c => [c.name, c.shortcut]));
  assert.equal(bound['toggle-dictation'], 'Ctrl+Shift+Space');
  assert.equal(bound['to-bangla'], 'Alt+Shift+1');
  assert.equal(bound['to-english'], 'Alt+Shift+2');
  assert.equal(bound['undo'], 'Alt+Shift+3');
});

test('to-bangla converts the focused box, and undo puts it back', async () => {
  const page = await open();
  try {
    await page.click('#ed');
    await page.keyboard.type('ami bangla');
    await command(ext, page, 'to-bangla');
    assert.ok(await waitFor(async () => (await boxState(page)).dom === 'আমি বাংলা'), (await boxState(page)).dom);
    await command(ext, page, 'undo');
    assert.ok(await waitFor(async () => (await boxState(page)).dom === 'ami bangla'));
  } finally { await page.close(); }
});

test('with focus outside any box, a command does nothing at all', async () => {
  const page = await open();
  try {
    await page.click('#ed');
    await page.keyboard.type('ami bangla');
    await page.click('#elsewhere');
    for (const name of ['to-bangla', 'to-english', 'undo', 'toggle-dictation']) await command(ext, page, name);
    await page.waitForTimeout(800);
    assert.equal((await boxState(page)).dom, 'ami bangla');
    assert.equal(await toast(page), '', 'a toast appeared');
  } finally { await page.close(); }
});

test('a command is ignored in a sensitive field', async () => {
  const page = await open('fields.html');
  try {
    await page.click('#otp');
    await page.keyboard.type('ami bangla');
    await command(ext, page, 'to-bangla');
    await page.waitForTimeout(600);
    assert.equal(await page.inputValue('#otp'), 'ami bangla');
  } finally { await page.close(); }
});

test('a command is ignored where Ukti is off', async () => {
  await storage.set(ext.worker, { disabledSites: ['127.0.0.1'] });
  const page = await open();
  try {
    await page.click('#ed');
    await page.keyboard.type('ami');
    await command(ext, page, 'to-bangla');
    await page.waitForTimeout(600);
    assert.equal((await boxState(page)).dom, 'ami');
  } finally { await page.close(); }
});

test('only the focused frame acts on a command', async () => {
  const page = await open('frame-host.html?src=' + encodeURIComponent(`http://b.test:${port}/textarea.html`), 'a.test');
  try {
    const frame = await waitFor(() => page.frames().find(f => f !== page.mainFrame() && f.url().includes('b.test')));
    await frame.waitForFunction(() => window.mimic);
    await frame.click('#ed');
    await page.keyboard.type('ami');
    await command(ext, page, 'to-bangla');
    assert.ok(await waitFor(() => frame.evaluate(() => mimic.el.value === 'আমি')));
    assert.equal(await toast(page), '', 'the top frame reacted too');
  } finally { await page.close(); }
});

test('toggle-dictation starts in a box, and stops even after focus has moved', async () => {
  off = await fakeSpeech(ext, cdpPort);
  await off.eval('stopDictation(), true');
  const page = await open();
  try {
    await page.click('#ed');
    await command(ext, page, 'toggle-dictation');
    assert.ok(await waitFor(() => off.eval('state.desired === true')), 'did not start');
    await page.click('#elsewhere');
    await command(ext, page, 'toggle-dictation');
    assert.ok(await waitFor(() => off.eval('state.desired === false')), 'did not stop');
  } finally { await page.close(); }
});

test('Escape still stops dictation, and only while listening', async () => {
  off = off || await fakeSpeech(ext, cdpPort);
  const page = await open();
  try {
    await page.evaluate(() => { window.esc = 0; document.addEventListener('keydown', e => { if (e.key === 'Escape') esc++; }); });
    await page.click('#ed');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => esc), 1, 'Escape swallowed while not listening');
    await command(ext, page, 'toggle-dictation');
    assert.ok(await waitFor(() => off.eval('state.desired === true')));
    await page.keyboard.press('Escape');
    assert.ok(await waitFor(() => off.eval('state.desired === false')));
  } finally { await page.close(); }
});

test('the floating control shows the bound shortcuts', async () => {
  const page = await open();
  try {
    await page.click('#ed');
    assert.ok(await waitFor(() => barShown(page)));
    const tips = await waitFor(async () => {
      const t = await page.evaluate(() => [...document.querySelector('[data-ukti="bar"]').shadowRoot
        .querySelectorAll('.tip span')].map(s => s.textContent).filter(Boolean));
      return t.includes('Alt+Shift+1') ? t : null;
    });
    assert.ok(tips, 'tips do not show the bindings');
    assert.ok(tips.includes('Ctrl+Shift+Space'));
    assert.equal(tips.some(t => /Ctrl\+Shift\+[BEZ]$/.test(t)), false, tips.join(' | '));
  } finally { await page.close(); }
});

test('the popup lists the current shortcuts and links to the page that changes them', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('popup.html'));
    await page.waitForTimeout(400);
    const text = await page.evaluate(() => document.body.innerText);
    assert.ok(text.includes('Alt') && text.includes('1'), 'popup does not show Alt+Shift+1');
    assert.equal(/Ctrl\s*Shift\s*B/.test(text), false, 'popup still shows Ctrl+Shift+B');
    const link = await page.$('#changeShortcuts');
    assert.ok(link, 'no link to change the shortcuts');
  } finally { await page.close(); }
});
