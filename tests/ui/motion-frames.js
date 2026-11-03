#!/usr/bin/env node
// Captures the feedback effects mid-flight for MOTION.md. Usage:
// node tests/ui/motion-frames.js   -> docs/motion/*.png
const path = require('node:path');
const { serve, launch, storage, waitFor, barShown, command } = require('../helpers');
const { fakeSpeech, randomPort } = require('../speech');
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'motion');
const H = '[data-ukti="bar"]';
(async () => {
  const server = await serve(); const base = `http://127.0.0.1:${server.address().port}`;
  const cdp = randomPort();
  const ext = await launch({ args: [`--remote-debugging-port=${cdp}`] });
  const off = await fakeSpeech(ext, cdp);
  await storage.set(ext.worker, { coachDone: true, uiLang: 'bn', layout: 'compact', theme: 'glass' });
  const open = async () => {
    const page = await ext.context.newPage();
    await page.setViewportSize({ width: 900, height: 420 });
    await page.goto(`${base}/textarea.html`); await page.waitForFunction(() => window.mimic);
    await page.click('#ed'); await waitFor(() => barShown(page)); await page.waitForTimeout(400);
    return page;
  };
  const shot = (page, name, clip) => page.screenshot({ path: path.join(OUT, name + '.png'), clip });
  const barClip = async page => { const r = await page.evaluate(h => { const b = document.querySelector(h).shadowRoot.querySelector('.bar').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; }, H); return { x: r[0] - 60, y: r[1] - 60, width: r[2] + 120, height: r[3] + 120 }; };

  let page = await open();
  await page.click(`${H} .toggle`); await page.waitForTimeout(450);
  const t = await page.evaluate(h => { const r = document.querySelector(h).shadowRoot.querySelector('button[aria-label="বাংলা করুন"]').getBoundingClientRect(); return [r.left + r.width * .3, r.top + r.height * .35]; }, H);
  await page.mouse.click(t[0], t[1]); await page.waitForTimeout(120);
  await shot(page, '1-ripple', await barClip(page)); await page.close();

  page = await open();
  await page.keyboard.type('ami banglay kotha boli');
  await command(ext, page, 'to-bangla'); await waitFor(() => page.evaluate(h => !!document.querySelector(h).shadowRoot.querySelector('.landed'), H), { every: 10 });
  await page.waitForTimeout(160);
  await shot(page, '2-landed-and-pulse'); await page.close();

  page = await open();
  await page.evaluate(() => mimic.setText('আমি বাংলা'));
  await page.click(`${H} .toggle`); await page.waitForTimeout(450);
  await page.click(`${H} button[aria-label="বাংলা করুন"]`); await page.waitForTimeout(70);
  await shot(page, '3-shake-on-refusal'); await page.close();

  page = await open();
  await command(ext, page, 'toggle-dictation'); await waitFor(() => off.eval('__fake.live().length === 1'));
  await page.waitForTimeout(150);
  await shot(page, '4-listening-burst', await barClip(page));
  await off.eval('stopDictation(), true'); await page.close();

  page = await open();
  const m = await page.evaluate(h => { const r = document.querySelector(h).shadowRoot.querySelector('.main').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, H);
  await page.mouse.move(m[0] + m[2] * .78, m[1] + m[3] * .28, { steps: 4 }); await page.waitForTimeout(300);
  await shot(page, '5-mic-tilt-and-highlight', { x: m[0] - 40, y: m[1] - 40, width: m[2] + 80, height: m[3] + 80 }); await page.close();

  off.close(); await ext.close(); server.close();
  console.log('frames in docs/motion');
})();
