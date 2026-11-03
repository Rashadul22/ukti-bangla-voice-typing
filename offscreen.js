// Ukti - offscreen document.
// Owns the SpeechRecognition session and the Translator instance.
// Survives popup close and service-worker termination.

const SpeechRecognition =
  self.SpeechRecognition || self.webkitSpeechRecognition;

const CONFIG = {
  lang: 'bn-BD',
  initialRestartDelay: 700,
  maxRestartDelay: 15000,
  maxConsecutiveNetworkErrors: 8,
  // A session that ran this long counts as healthy, so any fault history
  // is forgiven.
  healthySessionMs: 3000,
  // Guard against a service that dies instantly forever.
  maxSilentRestarts: 60,
  // If nothing at all happens for this long while we believe we are
  // listening, the session is wedged. Force a fresh one.
  watchdogMs: 25000
};

// Restarting too eagerly is what kills long dictation. Google rate-limits
// the free speech service per client, and a tight restart loop trips it:
// sessions then end the instant they start and no results ever arrive,
// with no error to tell you why. So the calm restart is deliberately
// unhurried, and we police our own request rate below.
const CALM_RESTART_MS = 420;

// Our own rate limiter, kept well under whatever Google's actually is.
const RATE_WINDOW_MS = 60000;
const MAX_STARTS_PER_WINDOW = 14;
const THROTTLED_COOLDOWN_MS = 45000;

// A session that starts and dies at once, having heard nothing, is the
// signature of being rate-limited.
const INSTANT_DEATH_MS = 1200;
const INSTANT_DEATHS_BEFORE_COOLDOWN = 4;

const CALM_REASONS = new Set(['no-speech', 'aborted', 'clean-end', 'unknown']);

const RETRY_BASE = {
  'network': 2500,
  'unknown': 800
};

const state = {
  desired: false,        // user wants dictation
  stopRequested: false,  // user explicitly pressed stop
  phase: 'IDLE',
  current: null,         // live SpeechRecognition instance
  generation: 0,         // guards stale callbacks from old instances
  restartTimer: null,
  faultAttempts: 0,   // real failures only; silence never counts
  calmRestarts: 0,    // consecutive restarts that produced no speech
  startTimes: [],     // rolling window of session starts, for rate limiting
  instantDeaths: 0,   // sessions that died at once having heard nothing
  cooldownUntil: 0,
  cooldowns: 0,
  networkErrors: 0,
  lastError: 'unknown',
  listeningSince: 0,
  tabId: null,
  frameId: null,
  sessionId: null,
  epoch: 0,              // newest start or stop obeyed for this session
  settings: null,
  sessionStart: 0,
  lastActivity: 0,
  watchdogTimer: null
};

// ---------------------------------------------------------------- messaging

function emit(type, data = {}) {
  chrome.runtime.sendMessage({
    source: 'ukti-offscreen',
    type,
    tabId: state.tabId,
    frameId: state.frameId,
    sessionId: state.sessionId,
    epoch: state.epoch,
    ...data
  }).catch(() => {});
}

// -------------------------------------------------------------- translation

const translators = new Map();   // 'bn>en' -> Translator
const pending = new Map();       // 'bn>en' -> Promise
let releaseTimer = null;

// Holding translators open forever keeps models loaded for no reason and
// can contend with Chrome's own page translation. Let them go when idle.
function scheduleRelease() {
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    for (const t of translators.values()) {
      try { t.destroy?.(); } catch (_) {}
    }
    translators.clear();
  }, 120000);
}

// The reply to the page carries error.name, so these codes must be the
// name. As plain new Error(code) they arrived as "Error", and the page never
// recognised them: a missing pack said "translation failed", not "open setup".
function coded(code) {
  const error = new Error(code);
  error.name = code;
  return error;
}

async function getTranslator(from, to) {
  const key = from + '>' + to;
  if (translators.has(key)) return translators.get(key);
  if (pending.has(key)) return pending.get(key);

  if (!('Translator' in self)) throw coded('NO_TRANSLATOR_API');

  const task = (async () => {
    const opts = { sourceLanguage: from, targetLanguage: to };
    const status = await Translator.availability(opts);
    if (status === 'unavailable') throw coded('PAIR_UNAVAILABLE');
    // 'downloadable' means this pack was never fetched from an extension
    // page. create() was expected to throw NotAllowedError here without user
    // activation; measured in Chromium 153 it never settles at all, so the
    // page showed "translating" for good and every later request for the
    // pair queued behind it. Do not call it unless the pack is present.
    // The setup page is responsible for the first download of each pair.
    if (status !== 'available') throw coded('NEEDS_DOWNLOAD');
    const made = await Translator.create(opts);
    translators.set(key, made);
    return made;
  })();

  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}

// Spoken Bangla is full of fillers that a literal translator renders as
// noise. Measured 3 November, the old patterns damaged 23 of 25 ordinary
// sentences (tests/corpus/fillers.tsv): they had no word boundaries, so
// "বুঝলা" ate the start of "বুঝলাম" and left "ম", and "আর কি" turned
// "আর কিছু" into "ছু". So now a filler is only ever a whole word, and the
// ones that are also ordinary grammar count only where they are fillers.
//
//   ইয়ে                 anywhere, as a word of its own
//   মানে মানে (মানে...)  two or more in a row
//   আর কি, বুঝলা, বুঝছো  only at the end of a clause, where they are tags:
//                        "ও আসবে আর কি" loses it, "তুমি আর কি চাও" keeps it
//
// "কি বলে" and "হচ্ছে যে" are gone from the list: "সে কি বলে" and "মনে
// হচ্ছে যে" are grammar, and no rule tells them from the filler use.
const LETTER = '\\p{L}\\p{M}\\p{N}';
const START = `(?<![${LETTER}])`;
const END = `(?![${LETTER}])`;
const CLAUSE_END = `(?=\\s*(?:[,।?!.;:]|$))`;
const FILLER_PATTERNS = [
  new RegExp(`${START}ইয়ে${END}`, 'gu'),
  new RegExp(`${START}মানে(?:\\s+মানে)+${END}`, 'gu'),
  new RegExp(`${START}আর\\s+কি${END}${CLAUSE_END}`, 'gu'),
  new RegExp(`${START}(?:বুঝলা|বুঝছো)${END}${CLAUSE_END}`, 'gu')
];

function cleanFillers(text) {
  let out = text;
  for (const pattern of FILLER_PATTERNS) out = out.replace(pattern, ' ');
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,।?!.;:])/g, '$1')    // no space left before punctuation
    .trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The user's own corrections, applied to whole words only. As plain
// substrings, a rule "কি = কী" also turned "কিছু" into "কীছু" and "থাকি"
// into "থাকী" (8 of 628 corpus words). A rule of several words still
// matches as a phrase. The pattern is built from the user's text escaped, so
// no rule can be a regular expression that hangs the extension.
function applyReplacements(text, replacements) {
  if (!Array.isArray(replacements) || replacements.length === 0) return text;
  let out = text;
  for (const rule of replacements) {
    if (!rule || !rule.from) continue;
    const pattern = new RegExp(`${START}${escapeRegExp(rule.from)}${END}`, 'gu');
    out = out.replace(pattern, () => rule.to ?? '');
  }
  return out;
}

// ---------------------------------------------------------- voice commands
// Chrome's Bangla recognition gives almost no punctuation, so these words
// become marks. Bare দাঁড়ি (also "beard") and কমা (also "reduce") are
// ordinary words, so on their own they count only when they are the whole
// segment, said alone after a pause. The unambiguous names also count at
// the end of a sentence. tests/corpus/commands.tsv holds both kinds,
// including ordinary sentences that must not trigger.
const ALONE = new Map([
  ['দাঁড়ি', '।'], ['দাড়ি', '।'], ['কমা', ','], ['মুছে দাও', 'undo'], ['মুছে ফেলো', 'undo'], ['মুছে ফেল', 'undo']
]);
const AT_END = [
  ['প্রশ্নবোধক চিহ্ন', '?'], ['প্রশ্নবোধক', '?'], ['প্রশ্নচিহ্ন', '?'],
  ['বিস্ময়সূচক চিহ্ন', '!'], ['বিস্ময়সূচক', '!'], ['বিস্ময়বোধক চিহ্ন', '!'], ['বিস্ময়বোধক', '!'],
  ['দাঁড়ি চিহ্ন', '।'], ['দাড়ি চিহ্ন', '।'], ['ফুলস্টপ', '।'], ['ফুল স্টপ', '।'],
  ['কমা চিহ্ন', ','], ['নতুন লাইন', '\n'], ['নতুন অনুচ্ছেদ', '\n\n'], ['নতুন প্যারা', '\n\n']
].map(([words, mark]) => [words.normalize('NFC'), mark]);

function voiceCommand(raw) {
  const text = String(raw || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const alone = ALONE.get(text);
  if (alone === 'undo') return { text: '', punct: '', action: 'undo' };
  if (alone) return { text: '', punct: alone, action: '' };
  for (const [words, mark] of AT_END) {
    if (text === words) return { text: '', punct: mark, action: '' };
    if (text.endsWith(' ' + words)) return { text: text.slice(0, -words.length - 1), punct: mark, action: '' };
  }
  return { text: raw, punct: '', action: '' };
}

// ---------------------------------------------------------------- snippets
// Say the trigger on its own and the saved text goes in. Only the whole
// segment matches, so a trigger said inside a sentence stays a sentence.
function applySnippets(raw, snippets) {
  if (!Array.isArray(snippets) || !snippets.length) return null;
  const said = String(raw || '').normalize('NFC').replace(/[।,?!.]+$/, '').replace(/\s+/g, ' ').trim();
  for (const s of snippets) {
    if (!s || !s.say || typeof s.text !== 'string') continue;
    if (String(s.say).normalize('NFC').replace(/\s+/g, ' ').trim() === said) return s.text;
  }
  return null;
}

// ------------------------------------------------- English in English letters
// For people who write mixed, as most chat in Bangladesh is written: "আমি
// office এ আছি". Only loanwords that are not also Bangla words: বাস (live),
// কল (tap), কেস, ডাক্তার and the like are left out on purpose. The Bangla
// ending is kept, apart: অফিসে becomes "office এ".
const LOANWORDS = {
  'অফিস': 'office', 'মিটিং': 'meeting', 'ফোন': 'phone', 'মোবাইল': 'mobile', 'কম্পিউটার': 'computer',
  'ল্যাপটপ': 'laptop', 'ইমেইল': 'email', 'ইমেল': 'email', 'ফেসবুক': 'Facebook', 'ইউটিউব': 'YouTube',
  'হোয়াটসঅ্যাপ': 'WhatsApp', 'গুগল': 'Google', 'ইন্টারনেট': 'internet', 'ওয়াইফাই': 'WiFi', 'লিংক': 'link',
  'পাসওয়ার্ড': 'password', 'অনলাইন': 'online', 'অফলাইন': 'offline', 'প্রজেক্ট': 'project', 'রিপোর্ট': 'report',
  'প্রেজেন্টেশন': 'presentation', 'ক্লাস': 'class', 'এক্সাম': 'exam', 'অ্যাসাইনমেন্ট': 'assignment',
  'টিচার': 'teacher', 'ডেডলাইন': 'deadline', 'লোকেশন': 'location', 'ডেলিভারি': 'delivery', 'অর্ডার': 'order',
  'প্রোডাক্ট': 'product', 'পেমেন্ট': 'payment', 'মেসেজ': 'message', 'ম্যাসেজ': 'message', 'ভিডিও': 'video',
  'অ্যাপ': 'app', 'ডাউনলোড': 'download', 'আপলোড': 'upload', 'শেয়ার': 'share', 'পোস্ট': 'post',
  'কমেন্ট': 'comment', 'লাইক': 'like', 'গ্রুপ': 'group', 'চ্যাট': 'chat', 'সফটওয়্যার': 'software',
  'ডেভেলপার': 'developer', 'ইউনিভার্সিটি': 'university', 'হোমওয়ার্ক': 'homework', 'টিকেট': 'ticket',
  'টিকিট': 'ticket', 'চার্জ': 'charge', 'ব্যাটারি': 'battery', 'সার্ভার': 'server', 'ওয়েবসাইট': 'website',
  'ব্রাউজার': 'browser', 'এক্সটেনশন': 'extension', 'অ্যাকাউন্ট': 'account', 'প্রোফাইল': 'profile',
  'সেটিংস': 'settings', 'আপডেট': 'update', 'নোটিফিকেশন': 'notification', 'স্ক্রিনশট': 'screenshot',
  'ফাইল': 'file', 'ফোল্ডার': 'folder', 'প্রিন্ট': 'print', 'সিভি': 'CV', 'ইন্টারভিউ': 'interview',
  'জব': 'job', 'স্যালারি': 'salary', 'টিম': 'team', 'ক্লায়েন্ট': 'client'
};
const LOAN_KEYS = Object.keys(LOANWORDS).map(k => k.normalize('NFC')).sort((a, b) => b.length - a.length);
// Endings, longest first. A vowel-sign ending is written as its letter.
const ENDINGS = [['গুলো', 'গুলো'], ['টাও', 'টাও'], ['য়ের', 'এর'], ['য়ে', 'এ'], ['ের', 'এর'], ['টা', 'টা'],
  ['টি', 'টি'], ['কে', 'কে'], ['তে', 'তে'], ['র', 'র'], ['ে', 'এ'], ['ও', 'ও']].map(([a, b]) => [a.normalize('NFC'), b]);

function mixEnglish(raw) {
  return String(raw || '').normalize('NFC').replace(/[ঀ-৿]+/g, word => {
    if (LOANWORDS[word]) return LOANWORDS[word];
    for (const base of LOAN_KEYS) {
      if (!word.startsWith(base)) continue;
      const rest = word.slice(base.length);
      const end = ENDINGS.find(([e]) => e === rest);
      if (end) return `${LOANWORDS[base]} ${end[1]}`;
    }
    return word;
  });
}

// ------------------------------------------------------------------ digits
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function fixDigits(text, mode) {
  if (mode === 'bn') return String(text).replace(/[0-9]/g, d => BN_DIGITS[d]);
  if (mode === 'en') return String(text).replace(/[০-৯]/g, d => String(BN_DIGITS.indexOf(d)));
  return text;
}

// Translator processes sequentially and can reject large input with
// QuotaExceededError, so long dictation is sent in sentence-sized chunks.
function chunkText(text, maxLen = 900) {
  if (text.length <= maxLen) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('।', maxLen);
    if (cut < maxLen * 0.5) cut = rest.lastIndexOf(' ', maxLen);
    if (cut < maxLen * 0.5) cut = maxLen;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) parts.push(rest.trim());
  return parts;
}

// A translation that has not answered in this long is not going to. Better
// to tell the user than to leave "translating" on screen.
const TRANSLATE_TIMEOUT_MS = 20000;
let repairWords = null;

function withTimeout(promise) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Translation took too long');
      error.name = 'TIMEOUT';
      reject(error);
    }, TRANSLATE_TIMEOUT_MS);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function translateText(text, from, to) {
  return withTimeout(translateNow(text, from, to));
}

async function translateNow(text, from, to) {
  const t = await getTranslator(from, to);
  const chunks = chunkText(text);
  const out = [];
  for (const chunk of chunks) {
    out.push(await t.translate(chunk));
  }
  scheduleRelease();
  return out.join(' ').trim();
}

const toEnglish = text => translateText(text, 'bn', 'en');

// Runs the full text pipeline for one final transcript segment.
async function processSegment(rawText) {
  const settings = state.settings || {};
  let text = rawText;

  if (settings.cleanFillers) text = cleanFillers(text);
  text = applyReplacements(text, settings.replacements);
  if (!text) return;

  // A snippet is the user's own text: it goes in as saved, untranslated.
  const snippet = applySnippets(text, settings.snippets);
  if (snippet != null) { emit('FINAL_RESULT', { text: snippet }); return; }

  let punct = '';
  if (settings.voiceCommands !== false) {
    const command = voiceCommand(text);
    if (command.action) { emit('FINAL_RESULT', { text: '', action: command.action }); return; }
    text = command.text;
    punct = command.punct;
  }

  if (text && settings.outputMode === 'english') {
    try {
      text = await toEnglish(text);
    } catch (error) {
      emit('TRANSLATE_FAILED', {
        error: error.name || 'error',
        detail: error.message
      });
      // Fall back to inserting the Bangla rather than losing the user's words.
    }
    if (punct === '।') punct = '.';
  } else if (text && settings.mixedEnglish) {
    text = mixEnglish(text);
  }
  text = fixDigits(text, settings.digits);
  if (!text && !punct) return;

  emit('FINAL_RESULT', { text, punct });
}

// ------------------------------------------------------------ audio meter
// SpeechRecognition exposes no waveform, so a second, separate microphone
// stream is opened purely to measure loudness for the UI. It is advisory:
// if it fails, dictation still works, the button just does not react.

let meterStream = null;
let meterContext = null;
let meterTimer = null;

async function startMeter() {
  if (meterStream) return;
  try {
    meterStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    meterContext = new AudioContext();
    const source = meterContext.createMediaStreamSource(meterStream);
    const analyser = meterContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    let last = -1;

    meterTimer = setInterval(() => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      // Root mean square, then a curve that makes quiet speech visible.
      const rms = Math.sqrt(sum / buffer.length);
      const level = Math.min(1, Math.pow(rms * 4.2, 0.65));
      const rounded = Math.round(level * 20) / 20;
      if (rounded !== last) {
        last = rounded;
        emit('LEVEL', { level: rounded });
      }
    }, 70);
  } catch (error) {
    // Not fatal. Dictation does not depend on this.
    meterStream = null;
  }
}

function stopMeter() {
  clearInterval(meterTimer);
  meterTimer = null;
  if (meterStream) {
    meterStream.getTracks().forEach(t => t.stop());
    meterStream = null;
  }
  if (meterContext) {
    meterContext.close().catch(() => {});
    meterContext = null;
  }
}

// ------------------------------------------------------- recognition engine

function touch() {
  state.lastActivity = Date.now();
}

function startWatchdog() {
  clearInterval(state.watchdogTimer);
  state.watchdogTimer = setInterval(() => {
    if (!state.desired || state.stopRequested) return;
    if (!state.lastActivity) return;
    if (Date.now() - state.lastActivity < CONFIG.watchdogMs) return;

    // Nothing has happened for a long time: no results, no end event,
    // no error. The session is wedged, so throw it away and start over.
    emit('RESTARTING', { detail: 'watchdog' });
    state.generation++;
    const stale = state.current;
    state.current = null;
    if (stale) { try { stale.abort(); } catch (_) {} }
    touch();
    startAttempt();
  }, 5000);
}

function stopWatchdog() {
  clearInterval(state.watchdogTimer);
  state.watchdogTimer = null;
}

// How many sessions we have opened in the last minute.
function recentStarts() {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  state.startTimes = state.startTimes.filter(t => t > cutoff);
  return state.startTimes.length;
}

function enterCooldown(reason) {
  state.cooldowns = (state.cooldowns || 0) + 1;
  state.cooldownUntil = Date.now() + THROTTLED_COOLDOWN_MS;
  state.instantDeaths = 0;
  state.startTimes = [];

  // Waiting it out twice and still getting nowhere means this offscreen
  // document is spent. Tell the user plainly, and ask for a clean one so
  // the next start begins from scratch.
  if (state.cooldowns >= 2) {
    state.desired = false;
    stopWatchdog();
    stopMeter();
    emit('STUCK');
    chrome.runtime.sendMessage({ type: 'RESET_ENGINE' }).catch(() => {});
    return;
  }

  emit('THROTTLED', {
    detail: reason,
    seconds: Math.round(THROTTLED_COOLDOWN_MS / 1000)
  });
}

function clearRestartTimer() {
  if (state.restartTimer !== null) {
    clearTimeout(state.restartTimer);
    state.restartTimer = null;
  }
}

function restartDelay(reason) {
  // The common case: the service ended because the user went quiet.
  // Come straight back, or words at the start of the next sentence are lost.
  if (CALM_REASONS.has(reason) && state.lastError !== 'network') {
    return CALM_RESTART_MS;
  }

  const base = RETRY_BASE[state.lastError] ?? RETRY_BASE.unknown;
  const scaled = Math.min(
    base * Math.pow(2, state.faultAttempts),
    CONFIG.maxRestartDelay
  );
  // Jitter, so many installs do not retry in lockstep.
  return Math.round(scaled * (0.8 + Math.random() * 0.4));
}

function isFatal(error) {
  return (
    error === 'audio-capture' ||
    error === 'not-allowed' ||
    error === 'service-not-allowed' ||
    error === 'language-not-supported'
  );
}

function scheduleRestart(reason) {
  if (!state.desired || state.stopRequested) return;
  clearRestartTimer();

  if (state.networkErrors > CONFIG.maxConsecutiveNetworkErrors) {
    state.phase = 'ERROR';
    state.desired = false;
    stopMeter();
    emit('FATAL', {
      error: 'network-retry-limit',
      detail: 'Too many network failures in a row.'
    });
    return;
  }

  // Cooling off after being throttled: wait it out rather than making
  // the service angrier.
  const cooling = Date.now() < state.cooldownUntil;

  // Too many sessions in the last minute means we are the problem.
  if (!cooling && recentStarts() >= MAX_STARTS_PER_WINDOW) {
    enterCooldown('rate');
    state.restartTimer = setTimeout(() => {
      state.restartTimer = null;
      if (state.desired && !state.stopRequested) startAttempt();
    }, THROTTLED_COOLDOWN_MS);
    return;
  }

  if (cooling) {
    state.restartTimer = setTimeout(() => {
      state.restartTimer = null;
      if (state.desired && !state.stopRequested) startAttempt();
    }, state.cooldownUntil - Date.now() + 200);
    return;
  }

  const calm = CALM_REASONS.has(reason) && state.lastError !== 'network';
  const delay = restartDelay(reason);

  // Only genuine faults make the next wait longer. Silence never does.
  if (!calm) state.faultAttempts++;

  // Safety net: a service that dies instantly forever would otherwise spin.
  if (calm) {
    state.calmRestarts++;
    if (state.calmRestarts > CONFIG.maxSilentRestarts) {
      state.phase = 'ERROR';
      state.desired = false;
      emit('FATAL', {
        error: 'no-audio',
        detail: 'Restarted many times without hearing anything.'
      });
      return;
    }
  }

  state.phase = 'RESTART_WAIT';
  state.restartTimer = setTimeout(() => {
    state.restartTimer = null;
    if (!state.desired || state.stopRequested) return;
    startAttempt();
  }, delay);

  // A 180 ms gap is not worth telling the user about; it would make the
  // indicator flicker constantly during normal speech.
  if (!calm) emit('RESTARTING', { detail: reason });
}

function startAttempt() {
  if (!state.desired || state.stopRequested) return;
  if (state.current !== null) return;

  if (!SpeechRecognition) {
    state.phase = 'ERROR';
    state.desired = false;
    emit('FATAL', {
      error: 'unsupported',
      detail: 'SpeechRecognition is not available in this browser.'
    });
    return;
  }

  state.startTimes.push(Date.now());

  const generation = ++state.generation;
  let recognition;

  try {
    recognition = new SpeechRecognition();
  } catch (error) {
    state.phase = 'ERROR';
    state.desired = false;
    emit('FATAL', { error: 'constructor-failed', detail: error.message });
    return;
  }

  recognition.lang = state.settings?.recogLang === 'bn-IN' ? 'bn-IN' : CONFIG.lang;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  // Final results are identified by their index within THIS session.
  const seenFinal = new Set();

  state.current = recognition;
  state.phase = 'STARTING';

  recognition.onstart = () => {
    if (generation !== state.generation) return;
    state.phase = 'LISTENING';
    state.listeningSince = Date.now();
    state.sessionStart = Date.now();
    state.gotResult = false;
    touch();
    emit('LISTENING');
  };

  recognition.onresult = event => {
    if (generation !== state.generation) return;

    // Hearing anything at all proves the pipeline is healthy.
    touch();
    state.gotResult = true;
    state.faultAttempts = 0;
    state.calmRestarts = 0;
    state.networkErrors = 0;
    state.instantDeaths = 0;
    state.cooldowns = 0;

    let interim = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];

      if (result.isFinal) {
        if (seenFinal.has(i)) continue;
        seenFinal.add(i);
        const text = result[0].transcript.trim();
        if (text) processSegment(text);

      } else {
        interim += result[0].transcript;
      }
    }

    if (interim) emit('INTERIM_RESULT', { text: interim });
  };

  recognition.onerror = event => {
    if (generation !== state.generation) return;

    state.lastError = event.error || 'unknown';
    if (event.error === 'network') state.networkErrors++;

    if (isFatal(event.error)) {
      state.desired = false;
      state.phase = 'ERROR';
      emit('FATAL', { error: event.error, detail: event.message || '' });
    } else {
      emit('RECOGNITION_ERROR', { error: event.error });
    }
    // Deliberately no restart here. Chrome fires onerror and then onend;
    // restarting in both handlers produces two overlapping sessions.
  };

  recognition.onend = () => {
    if (generation !== state.generation) return;
    touch();

    const ranFor = state.listeningSince ? Date.now() - state.listeningSince : 0;
    state.current = null;
    state.listeningSince = 0;

    // Started and died at once, having heard nothing: that is what being
    // rate-limited looks like from the outside, since no error is given.
    if (ranFor > 0 && ranFor < INSTANT_DEATH_MS && !state.gotResult) {
      state.instantDeaths++;
      if (state.instantDeaths >= INSTANT_DEATHS_BEFORE_COOLDOWN) {
        enterCooldown('instant-death');
      }
    } else if (state.gotResult) {
      state.instantDeaths = 0;
    }

    if (!state.desired || state.stopRequested) {
      state.phase = 'IDLE';
      emit('STOPPED');
      return;
    }

    // A session that stayed up a while was working, whatever ended it.
    // Silence during a healthy session is a person thinking, not a fault,
    // so the silent-restart guard is cleared too.
    if (ranFor > CONFIG.healthySessionMs) {
      state.faultAttempts = 0;
      state.calmRestarts = 0;
      state.networkErrors = 0;
    }

    // A silent end with no error is the normal way this API behaves when
    // someone pauses. It does not mean the user finished speaking.
    const reason = state.lastError === 'network' ? 'network' : 'clean-end';
    scheduleRestart(reason);
    state.lastError = 'unknown';
  };

  try {
    recognition.start();
  } catch (error) {
    if (state.current === recognition) state.current = null;

    if (error.name === 'NotAllowedError') {
      state.desired = false;
      state.phase = 'ERROR';
      emit('FATAL', {
        error: 'not-allowed',
        detail: 'Microphone permission is missing. Open Ukti setup.'
      });
      return;
    }
    // InvalidStateError is usually transient (previous session still closing).
    state.lastError = 'unknown';
    scheduleRestart('start-threw');
  }
}

function startDictation({ tabId, frameId, sessionId, epoch, settings }) {
  // There is one microphone. If another frame was dictating, tell it before
  // switching, or its button stays lit with nothing behind it.
  if (state.desired && state.sessionId && state.sessionId !== sessionId) {
    emit('TAKEN_OVER');
  }

  // A new start always targets the newest box, so cancel any old session.
  if (state.current) {
    state.generation++;
    try { state.current.abort(); } catch (_) {}
    state.current = null;
  }
  clearRestartTimer();

  state.desired = true;
  state.stopRequested = false;
  state.tabId = tabId;
  state.frameId = frameId;
  state.sessionId = sessionId;
  state.epoch = epoch || 0;
  state.settings = settings;
  state.faultAttempts = 0;
  state.calmRestarts = 0;
  state.networkErrors = 0;
  state.instantDeaths = 0;
  state.startTimes = [];
  state.cooldownUntil = 0;
  state.lastError = 'unknown';
  touch();
  startWatchdog();
  startMeter();

  startAttempt();
}

function stopDictation() {
  state.desired = false;
  state.stopRequested = true;
  clearRestartTimer();
  stopWatchdog();
  stopMeter();

  const recognition = state.current;
  if (recognition) {
    // stop(), not abort(): stop lets the service return what it already heard.
    try { recognition.stop(); } catch (_) {}
  } else {
    state.phase = 'IDLE';
    emit('STOPPED');
  }
}

// ----------------------------------------------------------------- listener

// Starts and stops from one frame are numbered. One older than the newest
// already obeyed for the same session arrived out of order and is dropped.
function stale(message) {
  return typeof message.epoch === 'number' &&
    message.sessionId === state.sessionId &&
    message.epoch < state.epoch;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  if (message.type === 'START_DICTATION') {
    if (stale(message)) return false;   // a stop from after it already ran
    startDictation(message);
    return false;
  }

  if (message.type === 'STOP_DICTATION') {
    // A stop names the session or tab it is for. One for anything else is
    // stale: a page that was dictating before another tab took over.
    if (message.sessionId && message.sessionId !== state.sessionId) return false;
    if (message.tabId != null && message.tabId !== state.tabId) return false;
    if (stale(message)) return false;
    if (typeof message.epoch === 'number') state.epoch = message.epoch;
    // Already stopped: say nothing, so a stop sent for a dead page cannot
    // set off another round of messages to it.
    if (!state.desired && !state.current) return false;
    stopDictation();
    return false;
  }

  // Banglish repair: the word list lives here, not in every page, because
  // it is 700 KB and only a conversion needs it.
  if (message.type === 'REPAIR_WORDS') {
    try {
      if (!repairWords) repairWords = self.UktiBanglish.wordSet(self.UKTI_WORDS);
      sendResponse({ ok: true, text: self.UktiBanglish.repair(String(message.text || ''), repairWords) });
    } catch (error) {
      sendResponse({ ok: false, error: error.name || 'error' });
    }
    return false;
  }

  if (message.type === 'TRANSLATE') {
    (async () => {
      try {
        const text = await translateText(
          message.text, message.from || 'bn', message.to || 'en'
        );
        sendResponse({ ok: true, text });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error.name || 'error',
          detail: error.message
        });
      }
    })();
    return true;
  }

  return false;
});
