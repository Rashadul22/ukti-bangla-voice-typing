// Opens each UI surface in a known state, for screenshots and audits.

const { storage, waitFor, barShown, command } = require('../helpers');

const HOST = '[data-ukti="bar"]';
const PAGE_BG = { light: [255, 255, 255, 1], dark: [18, 20, 24, 1] };

async function popup(ext, { tab = 0, lang = 'bn', scheme = 'dark', zoom = 1 } = {}) {
  await storage.set(ext.worker, { uiLang: lang });
  const page = await ext.context.newPage();
  // A popup sizes itself to its content (352 CSS px wide here), up to 800x600
  // device px. At 200% zoom that cap holds 400x300 CSS px, which is what the
  // zoomed case models; the screenshot is then taken at that window size.
  await page.setViewportSize(zoom === 1 ? { width: 352, height: 600 } : { width: Math.round(800 / zoom), height: Math.round(600 / zoom) });
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(ext.extUrl('popup.html'));
  await page.waitForTimeout(350);
  if (tab) {
    await page.locator('.tabs button').nth(tab).click();
    await page.waitForTimeout(450);
  }
  return { page, opts: {} };
}

async function setup(ext, { size = [1280, 720], lang = 'bn', scheme = 'dark', zoom = 1 } = {}) {
  await storage.set(ext.worker, { uiLang: lang });
  const page = await ext.context.newPage();
  // Browser zoom halves the CSS viewport; the screenshot stays the window size.
  await page.setViewportSize({ width: Math.round(size[0] / zoom), height: Math.round(size[1] / zoom) });
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(ext.extUrl('setup.html'));
  await page.waitForTimeout(600);
  return { page, opts: {} };
}

// The floating control. `state`: collapsed, open, preview, toast-info,
// toast-error, coach. `theme`: glass, dark, light. `bg`: the host page.
async function control(ext, base, { state = 'collapsed', theme = 'glass', bg = 'light', lang = 'bn', off = null, reduced = false } = {}) {
  await storage.set(ext.worker, { uiLang: lang, theme, layout: 'compact', coachDone: state !== 'coach', barPos: null, barCorner: 'auto' });
  const page = await ext.context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  // Reduced motion from the start keeps the feedback effects (MOTION.md) out
  // of the picture, so a baseline is the design at rest and nothing else.
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/${bg === 'dark' ? 'dark' : 'textarea'}.html`);
  await page.waitForFunction(() => window.mimic);
  await page.click('#ed');
  await waitFor(() => barShown(page));
  await page.waitForTimeout(400);
  if (state === 'open') {
    await page.click(`${HOST} .toggle`);
    await page.waitForTimeout(500);
  }
  if (state === 'toast-error') {
    await command(ext, page, 'to-bangla');               // empty box: an error toast
    await page.waitForTimeout(350);
  }
  if (state === 'toast-info') {
    await page.keyboard.type('ami bangla');
    await command(ext, page, 'to-bangla');               // "converted to Bangla"
    await waitFor(() => page.evaluate(h => !!document.querySelector(h).shadowRoot.querySelector('.toast.on'), HOST));
    await page.waitForTimeout(350);
  }
  if (state === 'preview') {
    await command(ext, page, 'toggle-dictation');
    await waitFor(() => off.eval('__fake.live().length === 1'));
    await off.eval('__fake.say("আমি বাংলায় কথা বলছি আর লেখা", false)');
    await page.waitForTimeout(500);
  }
  if (state === 'coach') await page.waitForTimeout(600);
  return { page, opts: { shadowHost: HOST, pageBg: PAGE_BG[bg] } };
}

// The region worth a screenshot: the control and anything it has open.
async function controlClip(page) {
  const r = await page.evaluate(h => {
    const root = document.querySelector(h).shadowRoot;
    const rects = [...root.querySelectorAll('.bar, .preview.on, .toast.on, .coach.on')]
      .map(e => e.getBoundingClientRect()).filter(r => r.width && r.height);
    return {
      x: Math.min(...rects.map(r => r.left)), y: Math.min(...rects.map(r => r.top)),
      r: Math.max(...rects.map(r => r.right)), b: Math.max(...rects.map(r => r.bottom))
    };
  }, HOST);
  const pad = 24;
  const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad);
  return { x, y, width: Math.min(1280, r.r + pad) - x, height: Math.min(720, r.b + pad) - y };
}

module.exports = { popup, setup, control, controlClip, HOST, PAGE_BG };
