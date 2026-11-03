// Ukti - popup settings.

const DEFAULTS = {
  enabled: true,
  disabledSites: [],
  outputMode: 'bangla',
  uiLang: 'bn',
  layout: 'compact',
  buttons: { banglish: true, english: true, undo: true, grip: true },
  theme: 'glass',
  uiSize: 'medium',
  barCorner: 'auto',
  showHints: false,
  cleanFillers: true,
  autoSubmit: false,
  replacements: [],
  showMode: 'smart',
  allowSites: [],
  voiceCommands: true,
  mixedEnglish: false,
  sounds: false,
  digits: 'asis',
  recogLang: 'bn-BD'
};

// A starting point for "chosen sites only": where people write the most.
// The user adds or removes sites with the "this site" switch.
const STARTER_SITES = [
  'gemini.google.com', 'chatgpt.com', 'claude.ai', 'web.whatsapp.com', 'messenger.com',
  'facebook.com', 'mail.google.com', 'outlook.live.com', 'docs.google.com', 'x.com',
  'linkedin.com', 'web.telegram.org'
];

// A segmented control whose pill slides to sit behind the chosen button.
// A hidden tab has no layout, so the pill cannot be measured there; each
// control remembers its value and repaints when its tab is shown.
const segments = [];

function segment(id, key, onPick) {
  const root = document.getElementById(id);
  const pill = root.querySelector('.pill');
  const buttons = [...root.querySelectorAll('button')];
  let current = null;

  function paint(value, animate = true) {
    if (value != null) current = value;
    const chosen = buttons.find(b => b.dataset.v === current) || buttons[0];
    buttons.forEach(b => b.classList.toggle('on', b === chosen));

    // offsetWidth is 0 while the pane is display:none; leave the pill alone
    // until the tab is actually on screen.
    if (!chosen.offsetWidth) return;

    if (!animate) pill.style.transition = 'none';
    pill.style.width = chosen.offsetWidth + 'px';
    pill.style.transform = `translateX(${chosen.offsetLeft - 3}px)`;
    if (!animate) requestAnimationFrame(() => (pill.style.transition = ''));
  }

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      paint(button.dataset.v);
      chrome.storage.local.set({ [key]: button.dataset.v });
      onPick?.(button.dataset.v);
    });
  });

  segments.push(() => paint(null, false));
  return paint;
}

function repaintSegments() {
  requestAnimationFrame(() => segments.forEach(fn => fn()));
}

function swatches(id, key) {
  const root = document.getElementById(id);
  const buttons = [...root.querySelectorAll('.theme')];

  function paint(value) {
    buttons.forEach(b => b.classList.toggle('on', b.dataset.v === value));
  }

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      paint(button.dataset.v);
      chrome.storage.local.set({ [key]: button.dataset.v });
      // The chosen swatch pops once (CSS, so reduced motion turns it off).
      const chip = button.querySelector('.chip');
      if (chip) {
        chip.classList.remove('pop');
        void chip.offsetWidth;
        chip.classList.add('pop');
        chip.addEventListener('animationend', () => chip.classList.remove('pop'), { once: true });
      }
    });
  });

  return paint;
}

function toggle(id, key) {
  const input = document.getElementById(id);
  input.addEventListener('change', () => {
    chrome.storage.local.set({ [key]: input.checked });
  });
  return input;
}

const paintMode = segment('modeSeg', 'outputMode');
const paintLang = segment('langSeg', 'uiLang');
const paintLayout = segment('layoutSeg', 'layout');
const paintSize = segment('sizeSeg', 'uiSize');
// Picking a corner also clears any dragged position, otherwise the drag
// would keep winning and the buttons would look broken.
const btnGrip = buttonToggle('btnGrip', 'grip');

const paintPos = segment('posSeg', 'barCorner', () =>
  chrome.storage.local.set({ barPos: null })
);
const paintTheme = swatches('themes', 'theme');
const paintShow = segment('showSeg', 'showMode', async mode => {
  if (mode === 'sites') {
    const { allowSites } = await chrome.storage.local.get({ allowSites: [] });
    if (!allowSites.length) await chrome.storage.local.set({ allowSites: STARTER_SITES });
  }
  refreshPower();
});

// The per-button switches share one stored object, so they are saved
// together rather than as four separate keys.
function buttonToggle(id, name) {
  const input = document.getElementById(id);
  input.addEventListener('change', async () => {
    const { buttons } = await chrome.storage.local.get({
      buttons: DEFAULTS.buttons
    });
    chrome.storage.local.set({
      buttons: { ...DEFAULTS.buttons, ...buttons, [name]: input.checked }
    });
  });
  return input;
}

const btnBanglish = buttonToggle('btnBanglish', 'banglish');
const btnEnglish = buttonToggle('btnEnglish', 'english');
const btnUndo = buttonToggle('btnUndo', 'undo');

const showHints = toggle('showHints', 'showHints');
const cleanFillers = toggle('cleanFillers', 'cleanFillers');
const autoSubmit = toggle('autoSubmit', 'autoSubmit');
const voiceCommands = toggle('voiceCommands', 'voiceCommands');
const mixedEnglish = toggle('mixedEnglish', 'mixedEnglish');
const sounds = toggle('sounds', 'sounds');
const paintDigits = segment('digitsSeg', 'digits');
const paintRecog = segment('recogSeg', 'recogLang');

// ---- custom replacements ----

const replacements = document.getElementById('replacements');

function rulesToText(rules) {
  if (!Array.isArray(rules)) return '';
  return rules.map(rule => `${rule.from} = ${rule.to}`).join('\n');
}

function textToRules(text) {
  return text
    .split('\n')
    .map(line => {
      const at = line.indexOf('=');
      if (at === -1) return null;
      const from = line.slice(0, at).trim();
      const to = line.slice(at + 1).trim();
      return from ? { from, to } : null;
    })
    .filter(Boolean);
}

let saveTimer = null;
replacements.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ replacements: textToRules(replacements.value) });
  }, 400);
});

// ---- load ----

// A tab's id comes free, but its url needs a host permission. Asking the
// page's own content script for its hostname keeps the extension off the
// "read your data on all websites" warning entirely.
chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
  const id = tabs[0]?.id;
  if (id == null) return '';
  return chrome.tabs
    .sendMessage(id, { source: 'ukti-popup', type: 'GET_HOST' })
    .then(reply => reply?.host || '')
    .catch(() => '');   // chrome:// pages and the store have no content script
}).then(found => {
  host = found;
  return chrome.storage.local.get(DEFAULTS);
}).then(settings => {
  showMode = settings.showMode || 'smart';
  allowSites = settings.allowSites || [];
  paintPower(settings.enabled !== false, settings.disabledSites || []);
  // No animation on the first paint, or the pill visibly flies into place.
  paintMode(settings.outputMode, false);
  paintLang(settings.uiLang || 'bn', false);
  paintLayout(settings.layout || 'full', false);
  paintSize(settings.uiSize, false);
  paintPos(settings.barPos ? 'auto' : (settings.barCorner || 'auto'), false);
  paintShow(settings.showMode || 'smart', false);

  const buttons = { ...DEFAULTS.buttons, ...(settings.buttons || {}) };
  btnBanglish.checked = buttons.banglish !== false;
  btnEnglish.checked = buttons.english !== false;
  btnUndo.checked = buttons.undo !== false;
  btnGrip.checked = buttons.grip !== false;
  paintTheme(settings.theme || 'glass');
  showHints.checked = settings.showHints === true;
  cleanFillers.checked = settings.cleanFillers !== false;
  autoSubmit.checked = !!settings.autoSubmit;
  voiceCommands.checked = settings.voiceCommands !== false;
  mixedEnglish.checked = !!settings.mixedEnglish;
  sounds.checked = !!settings.sounds;
  paintDigits(settings.digits || 'asis', false);
  paintRecog(settings.recogLang || 'bn-BD', false);
  replacements.value = rulesToText(settings.replacements);
  repaintSegments();
});

// ---- tabs ----

const tabs = [...document.querySelectorAll('.tabs button')];
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(b => b.classList.toggle('on', b === tab));
    document.querySelectorAll('.pane').forEach(pane => {
      pane.classList.toggle('on', pane.id === tab.dataset.p);
    });
    repaintSegments();
  });
});

// ---- on/off, globally and for this site ----

const master = document.getElementById('master');
const masterLabel = document.getElementById('masterLabel');
const siteOn = document.getElementById('siteOn');
const siteName = document.getElementById('siteName');
const siteState = document.getElementById('siteState');

let host = '';

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}

// In "chosen sites only" mode the site switch adds or removes the site from
// the chosen list; otherwise it adds or removes it from the off list.
let showMode = 'smart';
let allowSites = [];

async function refreshPower() {
  const s = await chrome.storage.local.get({ enabled: true, disabledSites: [], showMode: 'smart', allowSites: [] });
  showMode = s.showMode;
  allowSites = s.allowSites;
  paintPower(s.enabled !== false, s.disabledSites);
}

function paintPower(enabled, disabledSites) {
  document.body.classList.toggle('off', !enabled);
  master.checked = enabled;
  masterLabel.textContent = enabled ? tr('সব জায়গায় চালু', uktiLang) : tr('সব জায়গায় বন্ধ', uktiLang);

  const offHere = showMode === 'sites' ? !allowSites.includes(host) : disabledSites.includes(host);
  siteOn.checked = !offHere;
  siteName.textContent = host || tr('এই সাইট', uktiLang);
  siteState.textContent = !enabled
    ? tr('সব জায়গায় বন্ধ', uktiLang)
    : offHere ? tr('এই সাইটে বন্ধ', uktiLang) : tr('এই সাইটে চালু', uktiLang);
}

master.addEventListener('change', async () => {
  const { disabledSites } = await chrome.storage.local.get({ disabledSites: [] });
  await chrome.storage.local.set({ enabled: master.checked });
  paintPower(master.checked, disabledSites);
});

siteOn.addEventListener('change', async () => {
  if (!host) return;
  if (showMode === 'sites') {
    const { allowSites: list } = await chrome.storage.local.get({ allowSites: [] });
    const next = siteOn.checked ? [...new Set([...list, host])] : list.filter(h => h !== host);
    await chrome.storage.local.set({ allowSites: next });
    return refreshPower();
  }
  const { disabledSites } = await chrome.storage.local.get({ disabledSites: [] });
  const next = siteOn.checked
    ? disabledSites.filter(h => h !== host)
    : [...new Set([...disabledSites, host])];
  await chrome.storage.local.set({ disabledSites: next });
  paintPower(master.checked, next);
});

// The full list, with export and import. A page of its own, because a file
// chooser opened from the popup closes the popup.
document.getElementById('openWords').addEventListener('click', event => {
  event.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('words.html') });
});

document.getElementById('openSetup').addEventListener('click', event => {
  event.preventDefault();
  chrome.runtime.sendMessage({ type: 'OPEN_SETUP' });
  window.close();
});

// ---- tell a friend, and the one rating request ----

wireShare(document.getElementById('share'));

const rate = document.getElementById('rate');
chrome.storage.local.get({ uses: 0, rateDone: false }).then(({ uses, rateDone }) => {
  if (rateDone || uses < 15 || !self.UKTI_STORE_URL) return;
  rate.hidden = false;
});
function rateAnswered() {
  rate.hidden = true;
  chrome.storage.local.set({ rateDone: true });
}
document.getElementById('rateGo').addEventListener('click', () => {
  chrome.tabs.create({ url: self.UKTI_STORE_URL });
  rateAnswered();
});
document.getElementById('rateLater').addEventListener('click', rateAnswered);

document.getElementById('openSnips').addEventListener('click', event => {
  event.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('words.html') + '#snippets' });
});
