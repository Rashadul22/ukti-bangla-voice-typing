#!/usr/bin/env node
// Renders the proposals in PROGRESS.md: the real popup and setup page with a
// CSS override injected, screenshotted, and measured. No product file is
// changed. Usage: node tests/ui/mockups.js
const fs = require('node:fs');
const path = require('node:path');
const { launch, storage } = require('../helpers');
const { auditInPage } = require('./audit-lib');

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'ui-audit', 'proposals');

const PROPOSALS = {
  // A: every popup control reaches 40px.
  'A-40px-targets': `
    .seg button { padding: 10px 12px; }
    .group .sw { min-height: 40px; }`,
  // B: the main tab inside Chrome's 600px popup limit, by trimming spacing
  // that repeats: card padding, the gaps between cards, the header.
  'B-fits-600': `
    header { padding: 12px 16px 10px; }
    .site { padding: 9px 14px; margin-bottom: 10px; }
    .tabs { margin-bottom: 10px; }
    .group { padding: 11px 14px; margin-bottom: 8px; }
    .label { margin-bottom: 7px; }
    .keys { gap: 5px; }
    body { padding-bottom: 10px; }`,
  // C: a light palette that follows the system setting.
  'C-light-mode': `
    :root { color-scheme: light; --bg: #f5f6fa; --panel: #ffffff; --raise: #eef0f5; --card: #ffffff;
      --ink: #1d2230; --dim: #4d5566; --faint: #5e6677; --line: #dde1e9; }
    body::before { opacity: .45; }
    .track { background: #d5d9e2; } .track::after { background: #ffffff; box-shadow: 0 1px 2px rgba(0,0,0,.25); }`
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ext = await launch();
  const notes = {};
  for (const [name, css] of Object.entries(PROPOSALS)) {
    for (const [tab, idx] of [['main', 0], ['look', 1]]) {
      for (const variant of ['now', 'proposed']) {
        await storage.set(ext.worker, { uiLang: 'en' });
        const page = await ext.context.newPage();
        await page.setViewportSize({ width: 352, height: 600 });
        await page.goto(ext.extUrl('popup.html'));
        await page.waitForTimeout(300);
        if (idx) { await page.locator('.tabs button').nth(idx).click(); await page.waitForTimeout(400); }
        if (variant === 'proposed') await page.addStyleTag({ content: css });
        await page.waitForTimeout(200);
        const h = await page.evaluate(() => document.scrollingElement.scrollHeight);
        const a = await page.evaluate(auditInPage, {});
        const small = a.small.length, contrastFails = a.contrast.filter(c => !c.pass && !c.what.startsWith('svg')).length;
        await page.screenshot({ path: path.join(OUT, `${name}-${tab}-${variant}.png`), fullPage: true });
        notes[`${name} ${tab} ${variant}`] = { height: h, smallTargets: small, contrastFails };
        await page.close();
      }
    }
  }
  // The setup page in the light palette too.
  for (const variant of ['now', 'proposed']) {
    const page = await ext.context.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(ext.extUrl('setup.html'));
    await page.waitForTimeout(400);
    if (variant === 'proposed') await page.addStyleTag({ content: PROPOSALS['C-light-mode'] });
    await page.waitForTimeout(200);
    const a = await page.evaluate(auditInPage, {});
    notes[`C-light-mode setup ${variant}`] = { contrastFails: a.contrast.filter(c => !c.pass && !c.what.startsWith('svg')).map(c => `${c.ratio} ${c.what}`) };
    await page.screenshot({ path: path.join(OUT, `C-light-mode-setup-${variant}.png`) });
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(notes, null, 1));
  console.log(JSON.stringify(notes, null, 1));
  await ext.close();
})();
