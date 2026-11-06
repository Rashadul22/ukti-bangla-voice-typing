#!/usr/bin/env node
// Screenshots and audits every surface. Usage: node tests/ui/shoot.js <phase>
// Writes docs/ui-audit/<phase>/*.png and report.json.

const fs = require('node:fs');
const path = require('node:path');
const { serve, launch, storage } = require('../helpers');
const { fakeSpeech, randomPort } = require('../speech');
const { auditInPage, focusRings, motionInPage } = require('./audit-lib');
const S = require('./surfaces');

const phase = process.argv[2] || 'now';
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'ui-audit', phase);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const cdp = randomPort();
  const ext = await launch({ args: [`--remote-debugging-port=${cdp}`] });
  const off = await fakeSpeech(ext, cdp);
  const report = {};

  async function take(name, opened, { clip = null, fullPage = false, focus = true } = {}) {
    const { page, opts } = opened;
    const file = path.join(OUT, name + '.png');
    const shotClip = clip ? await clip(page) : undefined;
    await page.screenshot({ path: file, clip: shotClip, fullPage });
    const audit = await page.evaluate(auditInPage, opts);
    if (focus) audit.focus = await focusRings(page, { shadowHost: opts.shadowHost || null });
    report[name] = audit;
    await page.close();
    process.stdout.write('.');
  }

  const tabs = ['main', 'look', 'words'];
  for (const lang of ['bn', 'en']) for (const scheme of ['dark', 'light']) for (let t = 0; t < 3; t++) {
    await take(`popup-${tabs[t]}-${lang}-${scheme}`, await S.popup(ext, { tab: t, lang, scheme }), { fullPage: true });
  }
  for (let t = 0; t < 3; t++) {
    await take(`popup-${tabs[t]}-en-zoom200`, await S.popup(ext, { tab: t, lang: 'en', zoom: 2 }), { fullPage: false });
  }
  for (const lang of ['bn', 'en']) for (const scheme of ['dark', 'light']) for (const size of [[1280, 720], [1366, 768], [1920, 1080]]) {
    await take(`setup-${size[0]}x${size[1]}-${lang}-${scheme}`, await S.setup(ext, { size, lang, scheme }));
  }
  for (const lang of ['bn', 'en']) {
    await take(`setup-1280x720-${lang}-zoom200`, await S.setup(ext, { size: [1280, 720], lang, zoom: 2 }));
  }
  const states = ['collapsed', 'open', 'preview', 'toast-info', 'toast-error', 'coach'];
  const looks = [['glass', 'light'], ['glass', 'dark'], ['dark', 'light'], ['light', 'dark'], ['light', 'light'], ['dark', 'dark']];
  for (const state of states) for (const [theme, bg] of looks) {
    if (state === 'preview') await off.eval('stopDictation(), true');
    await take(`control-${state}-${theme}-on-${bg}`, await S.control(ext, base, { state, theme, bg, off }),
      { clip: S.controlClip, focus: state === 'open' });
  }

  // Reduced motion: what still moves.
  report.motion = {};
  for (const [name, open] of [['popup', () => S.popup(ext)], ['setup', () => S.setup(ext)]]) {
    const { page, opts } = await open();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    report.motion[name] = await page.evaluate(motionInPage, opts);
    await page.close();
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  off.close(); await ext.close(); server.close();
  console.log(`\n${Object.keys(report).length - 1} surfaces -> ${path.relative(process.cwd(), OUT)}`);
})().catch(e => { console.error(e); process.exit(1); });
