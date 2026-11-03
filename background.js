// Ukti - service worker.
// Owns nothing. Routes messages and manages the offscreen document lifecycle.
// Recognition state lives in the offscreen document, NOT here, because this
// worker can be terminated by Chrome at any moment.

const OFFSCREEN_PATH = 'offscreen.html';

let creatingOffscreen = null;

const ENDINGS = new Set(['STOPPED', 'FATAL', 'STUCK', 'TAKEN_OVER']);

// Stops dictation if the offscreen document is running the session named.
// The offscreen side ignores a stop for any other session or tab.
async function stopSession(which) {
  try {
    if (!(await hasOffscreenDocument())) return;
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_DICTATION', ...which });
  } catch (_) {}
}

// Closing the tab is the one ending a page cannot report itself. Needs no
// permission: onRemoved gives the id, which is all that is compared.
chrome.tabs.onRemoved.addListener(tabId => stopSession({ tabId }));

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
    showMode: 'smart',         // when the control appears: 'smart' | 'always' | 'sites'
    allowSites: [],            // in 'sites' mode, the only sites Ukti works on
    setupDone: false,
    voiceCommands: true,       // দাঁড়ি, প্রশ্নবোধক, নতুন লাইন, মুছে দাও (safe forms only)
    snippets: [],              // [{say, text}]: say the trigger alone, get the text
    mixedEnglish: false,       // অফিসে -> "office এ", for people who write mixed
    digits: 'asis',            // 'asis' | 'bn' | 'en'
    recogLang: 'bn-BD',        // 'bn-BD' | 'bn-IN'
    sounds: false              // a soft tone when listening starts and stops
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

// Keyboard shortcuts come through chrome.commands, so the user can see and
// change them at chrome://extensions/shortcuts. They used to be caught by
// the content script on every page, which took Ctrl+Shift+Z (redo in Docs
// and Figma) and Chrome's own Ctrl+Shift+B from everyone. The command goes to
// every frame of the tab; only the frame holding focus in a box Ukti handles
// acts on it (content.js, runCommand).
async function handleCommand(command, tab) {
  let id = tab?.id;
  if (id == null) {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    id = active?.id;
  }
  if (id == null) return;
  chrome.tabs.sendMessage(id, { source: 'ukti-command', command }).catch(() => {
    // chrome:// pages, the store, a page opened before install: no script.
  });
}
chrome.commands.onCommand.addListener(handleCommand);

// The shortcuts as currently bound, for the labels on the floating control.
async function currentShortcuts() {
  const all = await chrome.commands.getAll();
  return Object.fromEntries(all.map(c => [c.name, c.shortcut || '']));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ---- from content script ----

  if (message.type === 'GET_SHORTCUTS') {
    currentShortcuts().then(sendResponse, () => sendResponse({}));
    return true;
  }

  if (message.type === 'START_DICTATION') {
    (async () => {
      try {
        if (!sender.tab?.id) throw new Error('No originating tab');
        // How many times dictation was started: a number, nothing else.
        // The popup asks for a store rating once, after real use.
        chrome.storage.local.get({ uses: 0 }).then(({ uses }) =>
          chrome.storage.local.set({ uses: (Number(uses) || 0) + 1 })).catch(() => {});

        const settings = await getSettings();
        await ensureOffscreenDocument();

        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'START_DICTATION',
          tabId: sender.tab.id,
          frameId: sender.frameId,
          sessionId: message.sessionId,
          epoch: message.epoch,
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
            type: 'STOP_DICTATION',
            sessionId: message.sessionId,
            epoch: message.epoch
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
  if (message.type === 'REPAIR_WORDS') {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const result = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'REPAIR_WORDS', text: message.text });
        sendResponse(result || { ok: false });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

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
      epoch: message.epoch,
      text: message.text,
      punct: message.punct,
      action: message.action,
      error: message.error,
      detail: message.detail
    };

    const options = {};
    if (typeof message.frameId === 'number') options.frameId = message.frameId;

    chrome.tabs.sendMessage(message.tabId, payload, options).catch(() => {
      // Nobody is there any more: the tab navigated, the frame was removed,
      // or the content script was orphaned by an update. The microphone must
      // not keep running for it. The end-of-session messages are left alone,
      // or stopping a dead session would answer itself forever.
      if (ENDINGS.has(message.type)) return;
      stopSession({ sessionId: message.sessionId });
    });
    return false;
  }

  return false;
});
