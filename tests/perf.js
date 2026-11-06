// Performance measurements for PERF.md and perf.test.js. Run directly
// (node tests/perf.js) for the full report.

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { serve, launch, storage, waitFor, EXT } = require('./helpers');

const metric = async (cdp) => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map(m => [m.name, m.value]));
};

// Idle cost over `ms`, as deltas of Chrome's own counters.
async function idleCost(page, ms = 3000) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.waitForTimeout(500);
  const a = await metric(cdp);
  // Mutations anywhere, including inside the control's shadow root.
  await page.evaluate(() => {
    window.__mutations = 0;
    const count = list => { window.__mutations += list.length; };
    const watch = root => new MutationObserver(count).observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    watch(document);
    const host = document.querySelector('[data-ukti="bar"]');
    if (host?.shadowRoot) watch(host.shadowRoot);
  });
  await page.waitForTimeout(ms);
  const b = await metric(cdp);
  const mutations = await page.evaluate(() => window.__mutations);
  await cdp.detach();
  return {
    scriptMs: +((b.ScriptDuration - a.ScriptDuration) * 1000).toFixed(2),
    taskMs: +((b.TaskDuration - a.TaskDuration) * 1000).toFixed(2),
    layouts: b.LayoutCount - a.LayoutCount,
    styleRecalcs: b.RecalcStyleCount - a.RecalcStyleCount,
    mutations
  };
}

async function heapAfterGc(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  await cdp.detach();
  return usedSize;
}

// Parse and execute time of the two content scripts, measured in a page
// with chrome.* stubbed, each run in a fresh page so no code cache helps.
async function evalCost(context, base, runs = 15) {
  const src = ['banglish.js', 'content.js'].map(f => fs.readFileSync(path.join(EXT, f), 'utf8'));
  const times = { banglish: [], content: [] };
  for (let i = 0; i < runs; i++) {
    const page = await context.newPage();
    await page.goto(`${base}/blank.html?run=${i}`);
    const t = await page.evaluate(([b, c, salt]) => {
      const noop = () => {};
      const event = { addListener: noop };
      window.chrome = { runtime: { sendMessage: () => Promise.resolve(null), onMessage: event, id: 'x' },
        storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() }, onChanged: event } };
      const run = code => {
        const s = document.createElement('script');
        s.textContent = code + '\n//' + salt;   // unique source, no cache hit
        const t0 = performance.now();
        document.head.append(s);
        return performance.now() - t0;
      };
      return { banglish: run(b), content: run(c) };
    }, [src[0], src[1], `${Date.now()}-${i}`]);
    times.banglish.push(t.banglish);
    times.content.push(t.content);
    await page.close();
  }
  const median = xs => { const s = [...xs].sort((a, b) => a - b); return +s[Math.floor(s.length / 2)].toFixed(2); };
  const max = xs => +Math.max(...xs).toFixed(2);
  return { banglishMedianMs: median(times.banglish), contentMedianMs: median(times.content),
    banglishMaxMs: max(times.banglish), contentMaxMs: max(times.content),
    bytes: { banglish: src[0].length, content: src[1].length } };
}

// Messages the content scripts send the service worker during page load.
async function loadMessages(ext, url) {
  await ext.worker.evaluate(() => {
    self.__msgs = [];
    if (!self.__counting) {
      self.__counting = true;
      chrome.runtime.onMessage.addListener((m, s) => { self.__msgs.push(m.type + (s.frameId ? ' (frame)' : '')); });
    }
  });
  const page = await ext.context.newPage();
  await page.goto(url);
  await page.waitForTimeout(1500);
  const msgs = await ext.worker.evaluate(() => self.__msgs);
  await page.close();
  return msgs;
}

const shadowNodes = page => page.evaluate(() => {
  const root = document.querySelector('[data-ukti="bar"]')?.shadowRoot;
  return root ? root.querySelectorAll('*').length : 0;
});

async function report() {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const ext = await launch();
  await storage.set(ext.worker, { coachDone: true });
  const plain = await chromium.launch();
  const out = {};

  out.evalCost = await evalCost(plain, base);

  // Idle, never shown; idle, shown; and the same pages without the extension.
  const p1 = await ext.context.newPage(); await p1.goto(`${base}/blank.html`);
  out.idleNeverShown = await idleCost(p1);
  const p2 = await ext.context.newPage(); await p2.goto(`${base}/textarea.html`);
  await p2.click('#ed'); await waitFor(() => p2.evaluate(() => !!document.querySelector('[data-ukti="bar"]')));
  await p2.click('#elsewhere');
  out.idleShown = await idleCost(p2);
  out.shadowNodes = await shadowNodes(p2);
  const q1 = await plain.newPage(); await q1.goto(`${base}/blank.html`);
  out.idleBaseline = await idleCost(q1);

  // Heap per frame: a page of 20 iframes, with and without the extension.
  const h1 = await ext.context.newPage(); await h1.goto(`${base}/frames.html?n=20`); await h1.waitForTimeout(1500);
  const h2 = await plain.newPage(); await h2.goto(`${base}/frames.html?n=20`); await h2.waitForTimeout(1500);
  const heapExt = await heapAfterGc(h1), heapPlain = await heapAfterGc(h2);
  out.heap = { withExtension: heapExt, without: heapPlain, perFrameKB: +((heapExt - heapPlain) / 21 / 1024).toFixed(1) };

  out.loadMessages = {
    blank: await loadMessages(ext, `${base}/blank.html`),
    frames10: (await loadMessages(ext, `${base}/frames.html?n=10`)).length
  };

  // Heavy page: time from focusing the box to the control on screen.
  const hv = await ext.context.newPage(); await hv.goto(`${base}/heavy.html`);
  out.heavyNodes = await hv.evaluate(() => document.querySelectorAll('*').length);
  const cdp = await hv.context().newCDPSession(hv); await cdp.send('Performance.enable');
  const m0 = await metric(cdp);
  const t0 = Date.now();
  await hv.click('#ed');
  await waitFor(() => hv.evaluate(() => document.querySelector('[data-ukti="bar"]')?.shadowRoot?.querySelector('.bar.on') != null));
  out.heavyFocusToShownMs = Date.now() - t0;
  const m1 = await metric(cdp);
  out.heavyFocusScriptMs = +((m1.ScriptDuration - m0.ScriptDuration) * 1000).toFixed(2);
  out.heavyIdle = await idleCost(hv);

  await plain.close(); await ext.close(); server.close();
  return out;
}

if (require.main === module) report().then(r => console.log(JSON.stringify(r, null, 2)));
module.exports = { report, idleCost, heapAfterGc, evalCost, loadMessages, shadowNodes };
