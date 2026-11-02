// Shared harness: a static server for the mimic pages and a Chromium with
// the unpacked extension loaded. UKTI_EXT points at a different copy of the
// extension, which is how the suite is checked against deliberately broken
// builds (see tests/mutants.js).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.resolve(process.env.UKTI_EXT || ROOT);
const PAGES = path.join(__dirname, 'pages');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
      const file = path.join(PAGES, name || 'textarea.html');
      if (!file.startsWith(PAGES) || !fs.existsSync(file)) {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function launch({ args = [] } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ukti-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: process.env.HEADED ? false : true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, ...args]
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  return {
    context,
    worker,
    extensionId,
    extUrl: p => `chrome-extension://${extensionId}/${p}`,
    async close() {
      await context.close();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  };
}

// Storage lives behind the extension, so it is read and written from the
// service worker. The content scripts hear about writes via onChanged.
const storage = {
  get: (w, keys = null) => w.evaluate(k => chrome.storage.local.get(k), keys),
  set: (w, items) => w.evaluate(i => chrome.storage.local.set(i), items),
  clear: w => w.evaluate(() => chrome.storage.local.clear())
};

async function waitFor(fn, { timeout = 4000, every = 25 } = {}) {
  const until = Date.now() + timeout;
  let last;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() > until) return last;
    await new Promise(r => setTimeout(r, every));
  }
}

// Whether the floating control is showing in this page.
const barShown = page =>
  page.evaluate(() => {
    const host = document.querySelector('[data-ukti="bar"]');
    const bar = host?.shadowRoot?.querySelector('.bar');
    return !!bar && bar.classList.contains('on');
  });

// The text the content script would see, and the text the editor's own
// model holds. Both must agree before a test calls a conversion a success.
const boxState = page =>
  page.evaluate(() => ({
    dom: mimic.kind === 'textarea'
      ? mimic.el.value
      : mimic.el.innerText.replace(/[​-‍﻿]/g, '').replace(/\n+$/, ''),
    model: mimic.model()
  }));

const toast = page =>
  page.evaluate(() => {
    const t = document.querySelector('[data-ukti="bar"]')?.shadowRoot?.querySelector('.toast');
    return t && t.classList.contains('on') ? t.textContent : '';
  });

module.exports = { serve, launch, storage, waitFor, barShown, boxState, toast, ROOT, EXT };
