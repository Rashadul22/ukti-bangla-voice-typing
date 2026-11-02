// Ukti - service worker.
// Owns nothing. Routes messages and manages the offscreen document lifecycle.
// Recognition state lives in the offscreen document, NOT here, because this
// worker can be terminated by Chrome at any moment.

const OFFSCREEN_PATH = 'offscreen.html';

let creatingOffscreen = null;

async function hasOffscreenDocument() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url]
  });
  return contexts.length > 0;
}

// Only one offscreen document may exist per extension. Guard against the
// well-known MV3 race where two calls try to create it at once.
async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA'],
    justification:
      'Runs microphone speech recognition and on-device translation for user-requested dictation.'
  });

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function getSettings() {
  const defaults = {
    outputMode: 'bangla',      // 'bangla' | 'english'
    cleanFillers: true,
    autoSubmit: false,
    uiSize: 'medium',          // 'small' | 'medium' | 'large'
    theme: 'glass',            // 'glass' | 'dark' | 'light'
    enabled: true,             // master switch
    disabledSites: [],         // hostnames where Ukti stays out of the way
    uiLang: 'bn',              // 'bn' | 'en', for the on-page control
    layout: 'compact',         // 'compact' = only the mic until the arrow is pressed
    buttons: { banglish: true, english: true, undo: true, grip: true },
    showHints: false,           // label chips next to the buttons
    useCount: 0,               // the labels retire themselves after a few uses
    barPos: null,              // where the user dragged the control to
    barCorner: 'auto',         // auto: sit beside the box being typed in
    coachDone: false,          // first-run card has been seen
    replacements: [],          // [{from, to}]
    setupDone: false
  };
  const stored = await chrome.storage.local.get(defaults);
  return { ...defaults, ...stored };
}

// Open the setup page on first install. Microphone permission and the
// language pack download both need a real tab with a user click.
// Settings survive a remove and reinstall, because an unpacked extension
// keeps its id as long as it loads from the same folder. So a choice made
// in an old version outranks a new default forever, and the only visible
// symptom is that a fix appears not to have worked. Stamp the schema and
// move the keys whose defaults have genuinely changed.
const SCHEMA = 3;

async function migrate() {
  const { schema = 0 } = await chrome.storage.local.get({ schema: 0 });
  if (schema >= SCHEMA) return;

  // v3: the control starts collapsed, curves open, and shows its labels
  // on demand rather than pinned.
  await chrome.storage.local.set({
    schema: SCHEMA,
    layout: 'compact',
    showHints: false
  });
}

chrome.runtime.onInstalled.addListener(details => {
  migrate();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
  }
});
chrome.runtime.onStartup.addListener(migrate);

// The toolbar tooltip is the one piece of text the pages cannot reach, so
// it follows the language setting from here.
async function paintActionTitle() {
  try {
    const { uiLang } = await chrome.storage.local.get({ uiLang: 'bn' });
    chrome.action.setTitle({ title: uiLang === 'en' ? 'Ukti' : 'উক্তি' });
  } catch (_) {}
}
paintActionTitle();
chrome.storage.onChanged.addListener(changes => {
  if (changes.uiLang) paintActionTitle();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ---- from content script ----

  if (message.type === 'START_DICTATION') {
    (async () => {
      try {
        if (!sender.tab?.id) throw new Error('No originating tab');

        const settings = await getSettings();
        await ensureOffscreenDocument();

        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'START_DICTATION',
          tabId: sender.tab.id,
          frameId: sender.frameId,
          sessionId: message.sessionId,
          settings
        });

        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === 'STOP_DICTATION') {
    (async () => {
      try {
        if (await hasOffscreenDocument()) {
          await chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'STOP_DICTATION'
          });
        }
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  // Content script asks for one-off translation (used by the Banglish hotkey
  // when the output mode is English).
  if (message.type === 'TRANSLATE') {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const result = await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'TRANSLATE',
          text: message.text,
          from: message.from,
          to: message.to
        });
        sendResponse(result || { ok: false, error: 'No response' });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  // The offscreen document asks for this when speech recognition has gone
  // unrecoverable. Closing it means the next start gets a fresh context,
  // which clears what a plain restart cannot.
  if (message.type === 'RESET_ENGINE') {
    (async () => {
      try {
        if (await hasOffscreenDocument()) {
          await chrome.offscreen.closeDocument();
        }
      } catch (_) {}
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    getSettings().then(s => sendResponse(s));
    return true;
  }

  if (message.type === 'OPEN_SETUP') {
    chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
    sendResponse({ ok: true });
    return false;
  }

  // ---- from offscreen document, forward to the originating tab ----

  if (message.source === 'ukti-offscreen') {
    if (!message.tabId) return false;

    const payload = {
      source: 'ukti-background',
      type: message.type,
      sessionId: message.sessionId,
      text: message.text,
      error: message.error,
      detail: message.detail
    };

    const options = {};
    if (typeof message.frameId === 'number') options.frameId = message.frameId;

    chrome.tabs.sendMessage(message.tabId, payload, options).catch(() => {
      // Tab closed or content script gone. Nothing to do.
    });
    return false;
  }

  return false;
});
