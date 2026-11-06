// Off for one site versus off everywhere. Hostnames are mapped to the local
// server so real host matching is exercised, including the www. prefix that
// the per-site list ignores.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, storage, waitFor, barShown, boxState, command } = require('./helpers');

let server, ext, port;
before(async () => {
  server = await serve();
  port = server.address().port;
  ext = await launch({ args: ['--host-resolver-rules=MAP *.test 127.0.0.1'] });
});
after(async () => { await ext?.close(); server?.close(); });
beforeEach(() => storage.set(ext.worker, { enabled: true, disabledSites: [], coachDone: true }));

async function open(host) {
  const page = await ext.context.newPage();
  await page.goto(`http://${host}:${port}/textarea.html`);
  await page.waitForFunction(() => window.mimic);
  await page.evaluate(() => mimic.setText('ami bangla'));
  return page;
}

// Whether the hotkey converted the box. "No" needs a fair wait.
async function hotkeyWorks(page) {
  await page.evaluate(() => mimic.setText('ami bangla'));
  await command(ext, page, 'to-bangla');
  const ok = await waitFor(async () => (await boxState(page)).dom === 'আমি বাংলা', { timeout: 1200 });
  return !!ok;
}

test('off for one site: hidden and inert there, working elsewhere', async () => {
  await storage.set(ext.worker, { disabledSites: ['a.test'] });
  const off = await open('a.test');
  const offWww = await open('www.a.test');
  const on = await open('b.test');
  try {
    assert.equal(await barShown(off), false, 'hidden on a.test');
    assert.equal(await hotkeyWorks(off), false, 'hotkey inert on a.test');
    assert.equal(await barShown(offWww), false, 'www.a.test counts as a.test');
    assert.equal(await hotkeyWorks(offWww), false);
    assert.ok(await waitFor(() => barShown(on)), 'shown on b.test');
    assert.equal(await hotkeyWorks(on), true, 'hotkey works on b.test');
  } finally {
    await Promise.all([off.close(), offWww.close(), on.close()]);
  }
});

test('off everywhere: hidden and inert on every site', async () => {
  await storage.set(ext.worker, { enabled: false });
  const a = await open('a.test');
  const b = await open('b.test');
  try {
    for (const page of [a, b]) {
      assert.equal(await barShown(page), false);
      assert.equal(await hotkeyWorks(page), false);
    }
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});

test('switching takes effect on open pages without a reload', async () => {
  const a = await open('a.test');
  const b = await open('b.test');
  try {
    await a.bringToFront();
    assert.ok(await waitFor(() => barShown(a)));

    await storage.set(ext.worker, { disabledSites: ['a.test'] });
    assert.ok(await waitFor(async () => !(await barShown(a))), 'site off hides it');
    assert.equal(await hotkeyWorks(a), false);
    assert.ok(await waitFor(() => barShown(b)), 'other site unaffected');

    await storage.set(ext.worker, { disabledSites: [] });
    assert.ok(await waitFor(() => barShown(a)), 'site back on shows it');
    assert.equal(await hotkeyWorks(a), true);

    await storage.set(ext.worker, { enabled: false });
    assert.ok(await waitFor(async () => !(await barShown(a)) && !(await barShown(b))), 'global off hides both');

    await storage.set(ext.worker, { enabled: true });
    assert.ok(await waitFor(() => barShown(a)), 'global on brings it back');
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});

test('the popup learns the hostname from the page, not from tab.url', async () => {
  const page = await open('www.a.test');
  try {
    const reply = await ext.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: undefined, active: true, lastFocusedWindow: true });
      return { url: tab.url ?? null, host: await chrome.tabs.sendMessage(tab.id, { source: 'ukti-popup', type: 'GET_HOST' }) };
    });
    assert.equal(reply.url, null, 'no host permission, so the url is hidden');
    assert.deepEqual(reply.host, { host: 'a.test' });
  } finally {
    await page.close();
  }
});
