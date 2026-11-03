// When the control shows. It used to appear on the first focus in any box
// and then stay for the life of the page, so one click in YouTube's search
// box left it on screen while watching. Now it follows focus, search boxes
// do not summon it, and the user can choose where it appears at all.

const nodeTest = require('node:test');
const { before, after, beforeEach } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, barShown, command } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

let server, port, ext, off;
before(async () => {
  server = await serve();
  port = server.address().port;
  const cdp = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdp}`, '--host-resolver-rules=MAP *.test 127.0.0.1'] });
  off = await fakeSpeech(ext, cdp);
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn' });
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => {
  await storage.set(ext.worker, { showMode: 'smart', allowSites: [], disabledSites: [], enabled: true });
  await off.eval('stopDictation(), true');
});

async function open(host = '127.0.0.1', file = 'search.html') {
  const page = await ext.context.newPage();
  await page.goto(`http://${host}:${port}/${file}`);
  await page.waitForFunction(() => window.mimic);
  return page;
}
const hiddenWithin = (page, ms) => waitFor(async () => !(await barShown(page)), { timeout: ms });
const H = '[data-ukti="bar"]';

test('the control hides after focus leaves the box', async () => {
  const page = await open();
  try {
    await page.click('#msg');
    assert.ok(await waitFor(() => barShown(page)));
    await page.click('#elsewhere');
    assert.ok(await hiddenWithin(page, 4000), 'still showing after focus left');
  } finally { await page.close(); }
});

test('it stays a moment, so a press on it still lands', async () => {
  const page = await open();
  try {
    await page.click('#msg');
    assert.ok(await waitFor(() => barShown(page)));
    await page.click('#elsewhere');
    await page.waitForTimeout(800);
    assert.equal(await barShown(page), true, 'gone too fast to reach');
  } finally { await page.close(); }
});

test('it stays while dictating, even when focus moves away', async () => {
  const page = await open();
  try {
    await page.click('#msg');
    await command(ext, page, 'toggle-dictation');
    assert.ok(await waitFor(() => off.eval('state.desired === true')));
    await page.click('#elsewhere');
    await page.waitForTimeout(3000);
    assert.equal(await barShown(page), true, 'hid while listening');
    await command(ext, page, 'toggle-dictation');
    assert.ok(await hiddenWithin(page, 4000), 'did not hide after dictation stopped');
  } finally { await page.close(); }
});

test('it stays while the pointer is over it', async () => {
  const page = await open();
  try {
    await page.click('#msg');
    assert.ok(await waitFor(() => barShown(page)));
    const b = await page.evaluate(h => { const r = document.querySelector(h).shadowRoot.querySelector('.main').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, H);
    await page.evaluate(() => document.getElementById('elsewhere').focus());
    await page.mouse.move(b[0], b[1]);
    await page.waitForTimeout(3000);
    assert.equal(await barShown(page), true, 'hid under the pointer');
    await page.mouse.move(5, 5);
    assert.ok(await hiddenWithin(page, 4000));
  } finally { await page.close(); }
});

test('it stays while keyboard focus is inside it', async () => {
  const page = await open();
  try {
    await page.click('#msg');
    assert.ok(await waitFor(() => barShown(page)));
    await page.keyboard.press('Tab');   // msg -> elsewhere
    await page.keyboard.press('Tab');   // elsewhere -> the control
    const inside = await page.evaluate(h => document.activeElement === document.querySelector(h), H);
    assert.ok(inside, 'Tab did not reach the control');
    await page.waitForTimeout(3000);
    assert.equal(await barShown(page), true, 'hid while focused');
  } finally { await page.close(); }
});

for (const id of ['yt', 'g', 'formSearch', 'typeSearch', 'wa']) {
  test(`smart: #${id} is a search box and does not summon the control`, async () => {
    const page = await open();
    try {
      await page.click(`#${id}`);
      await page.waitForTimeout(800);
      assert.equal(await barShown(page), false);
    } finally { await page.close(); }
  });
}

test('smart: typing Banglish in a search box brings the control', async () => {
  const page = await open();
  try {
    await page.click('#yt');
    await page.keyboard.type('bangla gaan');
    assert.ok(await waitFor(() => barShown(page), { timeout: 3000 }), 'Banglish did not bring it');
  } finally { await page.close(); }
});

test('smart: typing English in a search box does not', async () => {
  const page = await open();
  try {
    await page.click('#yt');
    await page.keyboard.type('weather tomorrow london');
    await page.waitForTimeout(1200);
    assert.equal(await barShown(page), false);
  } finally { await page.close(); }
});

test('smart: shortcuts still work in a search box', async () => {
  const page = await open();
  try {
    await page.click('#yt');
    await page.keyboard.type('ami');
    await command(ext, page, 'to-bangla');
    assert.ok(await waitFor(() => page.evaluate(() => document.getElementById('yt').value === 'আমি')));
  } finally { await page.close(); }
});

for (const id of ['comment', 'msg']) {
  test(`smart: #${id} is a writing box and shows the control`, async () => {
    const page = await open();
    try {
      await page.click(`#${id}`);
      assert.ok(await waitFor(() => barShown(page)));
    } finally { await page.close(); }
  });
}

test('every box: search boxes show it too', async () => {
  await storage.set(ext.worker, { showMode: 'always' });
  const page = await open();
  try {
    await page.click('#yt');
    assert.ok(await waitFor(() => barShown(page)));
  } finally { await page.close(); }
});

test('chosen sites: nothing on a site not chosen, not even the shortcuts', async () => {
  await storage.set(ext.worker, { showMode: 'sites', allowSites: ['a.test'] });
  const page = await open('b.test');
  try {
    await page.click('#msg');
    await page.keyboard.type('ami');
    await command(ext, page, 'to-bangla');
    await page.waitForTimeout(800);
    assert.equal(await barShown(page), false);
    assert.equal(await page.inputValue('#msg'), 'ami');
  } finally { await page.close(); }
});

test('chosen sites: works on a chosen site', async () => {
  await storage.set(ext.worker, { showMode: 'sites', allowSites: ['a.test'] });
  const page = await open('www.a.test');
  try {
    await page.click('#msg');
    assert.ok(await waitFor(() => barShown(page)));
  } finally { await page.close(); }
});

test('popup: the three choices, and the site switch follows the chosen mode', async () => {
  const page = await ext.context.newPage();
  try {
    await page.goto(ext.extUrl('popup.html'));
    await page.waitForTimeout(300);
    const values = await page.evaluate(() => [...document.querySelectorAll('#showSeg button')].map(b => b.dataset.v));
    assert.deepEqual(values, ['smart', 'always', 'sites']);
    await page.locator('.tabs button').nth(1).click();
    await page.click('#showSeg button[data-v="sites"]');
    const s = await waitFor(async () => {
      const v = await storage.get(ext.worker, ['showMode', 'allowSites']);
      return v.showMode === 'sites' ? v : null;
    });
    assert.ok(s.allowSites.length >= 5, 'no starter list: ' + JSON.stringify(s.allowSites));
    assert.ok(s.allowSites.includes('web.whatsapp.com') && s.allowSites.includes('gemini.google.com'));
  } finally { await page.close(); }
});
