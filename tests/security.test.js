// Task 11: Ukti as a hostile page sees it. See SECURITY.md.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, barShown, command } = require('./helpers');
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
beforeEach(async () => {
  off?.close();
  off = await fakeSpeech(ext, cdpPort);
  await off.eval('stopDictation(), true');
});

async function hostile(host = '127.0.0.1') {
  const page = await ext.context.newPage();
  await page.goto(`http://${host}:${port}/hostile.html`);
  await page.waitForFunction(() => window.attack);
  return page;
}
const engineOn = () => off.eval('state.desired === true');

test('a page script cannot start the microphone with a synthetic hotkey', async () => {
  const page = await hostile();
  try {
    await page.click('#ok');
    await waitFor(() => barShown(page));
    await page.evaluate(() => attack.key('Space'));
    await page.waitForTimeout(800);
    assert.equal(await engineOn(), false, 'synthetic Ctrl+Shift+Space started dictation');
  } finally { await page.close(); }
});

test('a page script cannot start the microphone by clicking the button', async () => {
  const page = await hostile();
  try {
    await page.click('#ok');
    await waitFor(() => barShown(page));
    await page.evaluate(() => attack.clickMic());
    await page.waitForTimeout(800);
    assert.equal(await engineOn(), false, 'button.click() from the page started dictation');
  } finally { await page.close(); }
});

test('a page script cannot run a conversion by clicking or by a synthetic key', async () => {
  const page = await hostile();
  try {
    await page.click('#ok');
    await page.keyboard.type('ami');
    await waitFor(() => barShown(page));
    await page.evaluate(() => { attack.root().querySelector('.toggle').click(); });
    await page.evaluate(() => attack.clickBangla());
    await page.evaluate(() => attack.key('KeyB'));
    await page.waitForTimeout(800);
    assert.equal(await page.inputValue('#ok'), 'ami');
  } finally { await page.close(); }
});

test('the real user still can: a trusted hotkey and a trusted click both work', async () => {
  const page = await hostile();
  try {
    await page.click('#ok');
    await command(ext, page, 'toggle-dictation');
    assert.ok(await waitFor(engineOn), 'trusted hotkey');
    await page.click('[data-ukti="bar"] .main');
    assert.ok(await waitFor(async () => !(await engineOn())), 'trusted click stops');
  } finally { await page.close(); }
});

for (const id of ['otpAuto', 'ccAuto', 'cscAuto', 'masked', 'cePin', 'ceCard']) {
  test(`#${id}: the field filter holds`, async () => {
    const page = await hostile();
    try {
      await page.click(`#${id}`);
      await page.waitForTimeout(500);
      assert.equal(await barShown(page), false, 'control showed');
      await command(ext, page, 'toggle-dictation');
      await page.waitForTimeout(600);
      assert.equal(await engineOn(), false, 'dictation started in a sensitive field');
    } finally { await page.close(); }
  });
}

test('a field that turns sensitive after focus is refused at the moment of use', async () => {
  const page = await hostile();
  try {
    await page.click('#lateName');
    await page.waitForTimeout(300);           // the page has now marked it a password
    // Both routes in: a shortcut looks only at the focused box, and the mic
    // button (which keeps focus in the field) falls back to the remembered
    // box, which must be checked again.
    await command(ext, page, 'toggle-dictation');
    await page.waitForTimeout(600);
    assert.equal(await engineOn(), false, 'the shortcut started dictation in a field marked as a password');
    if (await barShown(page)) {
      await page.click('[data-ukti="bar"] .main');
      await page.waitForTimeout(600);
      assert.equal(await engineOn(), false, 'the mic button started dictation in a field marked as a password');
    }
  } finally { await page.close(); }
});

test('a password field inside a cross-origin iframe is refused too', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(`http://a.test:${port}/frame-host.html?src=` + encodeURIComponent(`http://b.test:${port}/fields.html`));
    const frame = await waitFor(() => page.frames().find(f => f !== page.mainFrame() && f.url().includes('fields')));
    await frame.waitForSelector('#password');
    await frame.click('#password');
    await page.waitForTimeout(400);
    assert.equal(await barShown(frame), false);
    await command(ext, page, 'toggle-dictation');
    await page.waitForTimeout(600);
    assert.equal(await engineOn(), false);
  } finally { await page.close(); }
});

// Recorded, not prevented: the page owns the box the words are going into.
test('what a page can see: the host element and, while dictating, the preview', async () => {
  const page = await hostile();
  try {
    await page.click('#ok');
    await command(ext, page, 'toggle-dictation');
    assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')));
    await off.eval('__fake.say("এখনো বলছি", false)');
    await page.waitForTimeout(200);
    const seen = await page.evaluate(() => ({ host: !!attack.host(), preview: attack.readPreview() }));
    assert.equal(seen.host, true);
    // Interim words are separate <w> elements, so textContent has no spaces.
    assert.ok(seen.preview.includes('এখনোবলছি'), 'the open shadow root exposes interim words');
  } finally { await page.close(); }
});
