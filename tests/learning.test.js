// Local learning. After dictation, if the user replaces a word Ukti just
// wrote, Ukti offers, once and in one click, to remember the correction.
// It watches only the box it just wrote into, only for a short while, and
// stores nothing unless the user says yes. Nothing leaves the machine.

const nodeTest = require('node:test');
const { before, after, beforeEach } = nodeTest;
const test = (name, fn) => nodeTest.test(name, { timeout: 60000 }, fn);
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, command, barShown } = require('./helpers');
const { fakeSpeech, randomPort } = require('./speech');

let server, base, ext, off;
before(async () => {
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}`;
  const cdp = randomPort();
  ext = await launch({ args: [`--remote-debugging-port=${cdp}`] });
  off = await fakeSpeech(ext, cdp);
});
after(async () => { off?.close(); await ext?.close().catch(() => {}); server?.close(); });
beforeEach(async () => {
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn', replacements: [], cleanFillers: true, outputMode: 'bangla' });
  await off.eval('stopDictation(), true');
});

const H = '[data-ukti="bar"]';
const teach = page => page.evaluate(h => {
  const t = document.querySelector(h)?.shadowRoot?.querySelector('.teach.on');
  return t ? t.textContent : null;
}, H);

async function dictate(page, text) {
  await command(ext, page, 'toggle-dictation');
  assert.ok(await waitFor(() => off.eval('__fake.live().length === 1')), 'not listening');
  await off.eval(`__fake.say(${JSON.stringify(text)})`);
  await waitFor(() => page.evaluate(t => mimic.el.value.includes(t.split(' ')[0]) || mimic.el.value.length > 0, text));
  await command(ext, page, 'toggle-dictation');
  await waitFor(() => off.eval('state.desired === false'));
}
// The user selects `from` in the box and types `to` over it, as a person would.
async function replaceWord(page, from, to) {
  await page.evaluate(w => {
    const el = mimic.el; el.focus();
    const at = el.value.indexOf(w);
    el.setSelectionRange(at, at + w.length);
  }, from);
  await page.keyboard.type(to, { delay: 30 });
}
async function open(file = 'textarea.html') {
  const page = await ext.context.newPage();
  await page.goto(`${base}/${file}`);
  await page.waitForFunction(() => window.mimic);
  await page.evaluate(() => mimic.el.focus());
  return page;
}

test('correcting a dictated word offers to remember it, and yes stores it', async () => {
  const page = await open();
  try {
    await dictate(page, 'আমার নাম রাসাদুল');
    assert.equal(await page.evaluate(() => mimic.el.value), 'আমার নাম রাসাদুল');
    await replaceWord(page, 'রাসাদুল', 'রাশাদুল');
    const offer = await waitFor(() => teach(page), { timeout: 5000 });
    assert.ok(offer, 'no offer appeared');
    assert.ok(offer.includes('রাসাদুল') && offer.includes('রাশাদুল'), offer);
    assert.deepEqual((await storage.get(ext.worker, 'replacements')).replacements, [], 'stored before the user agreed');
    await page.click(`${H} .teach button.yes`);
    const stored = await waitFor(async () => {
      const r = (await storage.get(ext.worker, 'replacements')).replacements;
      return r.length ? r : null;
    });
    assert.deepEqual(stored, [{ from: 'রাসাদুল', to: 'রাশাদুল' }]);
  } finally { await page.close(); }
});

test('a remembered correction is applied the next time', async () => {
  await storage.set(ext.worker, { replacements: [{ from: 'রাসাদুল', to: 'রাশাদুল' }] });
  const page = await open();
  try {
    await dictate(page, 'রাসাদুল কাল আসবে');
    assert.ok(await waitFor(async () => (await page.evaluate(() => mimic.el.value)) === 'রাশাদুল কাল আসবে'),
      await page.evaluate(() => mimic.el.value));
  } finally { await page.close(); }
});

test('no offer when the edited words are the user\'s own, not dictated', async () => {
  const page = await open();
  try {
    await page.keyboard.type('আমার নাম রাসাদুল');
    await replaceWord(page, 'রাসাদুল', 'রাশাদুল');
    await page.waitForTimeout(2500);
    assert.equal(await teach(page), null);
  } finally { await page.close(); }
});

test('no offer when the user only deletes a word', async () => {
  const page = await open();
  try {
    await dictate(page, 'আমি আজ বাজারে যাব');
    await page.evaluate(() => { const el = mimic.el; const at = el.value.indexOf(' আজ'); el.setSelectionRange(at, at + 3); });
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(2500);
    assert.equal(await teach(page), null);
  } finally { await page.close(); }
});

test('no offer for an edit in a different box', async () => {
  const page = await open('two-boxes.html');
  try {
    await page.click('#a');
    await dictate(page, 'আমার নাম রাসাদুল');
    await page.click('#b');
    await page.keyboard.type('রাসাদুল');
    await page.evaluate(() => document.getElementById('b').select());
    await page.keyboard.type('রাশাদুল');
    await page.waitForTimeout(2500);
    assert.equal(await teach(page), null);
  } finally { await page.close(); }
});

test('no stores nothing, and the same pair is not offered again', async () => {
  const page = await open();
  try {
    await dictate(page, 'আমার নাম রাসাদুল');
    await replaceWord(page, 'রাসাদুল', 'রাশাদুল');
    assert.ok(await waitFor(() => teach(page), { timeout: 5000 }));
    await page.click(`${H} .teach button.no`);
    await page.waitForTimeout(300);
    assert.equal(await teach(page), null);
    await page.evaluate(() => mimic.setText(''));
    await dictate(page, 'আমার নাম রাসাদুল');
    await replaceWord(page, 'রাসাদুল', 'রাশাদুল');
    await page.waitForTimeout(2500);
    assert.equal(await teach(page), null, 'asked again after no');
    assert.deepEqual((await storage.get(ext.worker, 'replacements')).replacements, []);
  } finally { await page.close(); }
});

test('the offer is in English when the setting is English, and keyboard reachable', async () => {
  await storage.set(ext.worker, { uiLang: 'en' });
  const page = await open();
  try {
    await dictate(page, 'আমার নাম রাসাদুল');
    await replaceWord(page, 'রাসাদুল', 'রাশাদুল');
    const offer = await waitFor(() => teach(page), { timeout: 5000 });
    assert.ok(offer && /Remember/i.test(offer), offer);
    const roles = await page.evaluate(h => {
      const t = document.querySelector(h).shadowRoot.querySelector('.teach');
      return { live: t.getAttribute('aria-live'), buttons: [...t.querySelectorAll('button')].map(b => b.tabIndex) };
    }, H);
    assert.equal(roles.live, 'polite');
    assert.ok(roles.buttons.every(i => i >= 0));
  } finally { await page.close(); }
});
