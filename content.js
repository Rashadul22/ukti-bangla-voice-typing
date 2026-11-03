// Ukti - content script.
// Watches for the hotkeys, remembers which box the user was in, and inserts
// text the way each kind of editor expects.

(function ukti() {
  'use strict';

  if (self.__uktiLoaded) return;

  // A frame too small to hold a text box (tracking pixels, hidden iframes)
  // does not need the control, so nothing is set up there until it grows.
  // Only sub-frames: the top page is never skipped.
  const TINY_W = 60, TINY_H = 24;
  if (window.top !== window && (innerWidth < TINY_W || innerHeight < TINY_H)) {
    const grow = () => {
      if (innerWidth < TINY_W || innerHeight < TINY_H) return;
      removeEventListener('resize', grow);
      ukti();
    };
    addEventListener('resize', grow, { passive: true });
    return;
  }
  self.__uktiLoaded = true;

  // ------------------------------------------------------------- strings

  const STRINGS = {
    bn: {
      speak: 'বলে লিখুন', stopSpeak: 'বলা বন্ধ করুন', startSpeak: 'বলা শুরু করুন',
      toBangla: 'বাংলা করুন', toEnglish: 'ইংরেজি করুন',
      undo: 'ফেরত নিন', move: 'টেনে সরান', more: 'আরও', less: 'গুটিয়ে নিন',
      listening: 'শুনছি', speakNow: 'বলুন, শুনছি…', stopped: 'থামানো হলো', doneBangla: 'বাংলা হয়েছে',
      doneEnglish: 'ইংরেজি হয়েছে', working: 'ইংরেজি করছি',
      putBackFailed: 'এই বক্সটা লেখা বদলাতে দিল না। লেখাটা সিলেক্ট করে আবার চেষ্টা করুন।',
      noBox: 'কোনো লেখার বক্সে ক্লিক করুন', noText: 'বক্সে কোনো লেখা নাই',
      alreadyBangla: 'এটা তো অলরেডি বাংলা',
      alreadyEnglish: 'এটা তো অলরেডি ইংরেজি',
      mixedText: 'লেখাটা মেশানো, আগে এক ভাষায় আনুন',
      toBanglaBtn: 'বাংলা করুন', toEnglishBtn: 'ইংরেজি করুন',
      workingBangla: 'বাংলা করছি',
      boxGone: 'বক্সটা আর নাই, লেখাটা প্রিভিউতে আছে',
      transFail: 'অনুবাদ হলো না',
      transNoop: 'অনুবাদ করে একই লেখা ফেরত আসলো। সেটআপে দেখুন ভাষা প্যাক নামানো আছে কিনা।',
      needPack: 'ভাষা প্যাক নামানো দরকার, সেটআপ খুলুন',
      reload: 'উক্তি আবার লোড হয়েছে, পেজটা রিফ্রেশ করুন (F5)',
      nothingUndo: 'ফেরত নেওয়ার কিছু নাই', undone: 'ফেরত নেওয়া হলো',
      throttled: n => `Google এর ভয়েস সার্ভিস একটু বিশ্রাম চাইছে, ${n} সেকেন্ড পর নিজেই চালু হবে`,
      stuck: 'ভয়েস আটকে গেছে। মাইকে চেপে বন্ধ করুন, তারপর আবার চালু করুন',
      coachTitle: 'উক্তি তৈরি',
      coachBody: 'ডানদিকের মাইকে চাপুন, তারপর বাংলায় বলুন। লেখা এখানেই বসে যাবে।',
      coachNote: 'নতুন কোনো পেজে কাজ না করলে একবার F5 চেপে নিন।',
      coachOk: 'বুঝেছি',
      elsewhere: 'অন্য ট্যাবে বলা শুরু হয়েছে, এখানে থামানো হলো',
      startFail: e => `চালু করা গেল না: ${e}`,
      reconnecting: 'আবার যুক্ত হচ্ছি…',
      offline: 'ইন্টারনেট নাই। বলা কথা লেখায় বদলাতে ইন্টারনেট লাগে, বাংলিশ আর অনুবাদ ইন্টারনেট ছাড়াই চলে।',
      noTranslator: 'এই Chrome এ অনুবাদ নাই। Chrome 138 বা নতুন ভার্সন লাগবে।',
      fatalNotAllowed: 'মাইক্রোফোনের অনুমতি নাই। উক্তি সেটআপ খুলুন',
      fatalNoMic: 'মাইক্রোফোন পাওয়া যাচ্ছে না',
      fatalService: 'ভয়েস সার্ভিস চালু হলো না, একটু পরে আবার চেষ্টা করুন',
      fatalLang: 'এই ব্রাউজারে বাংলা ভয়েস নাই',
      fatalNetwork: 'ইন্টারনেট সমস্যা, বারবার চেষ্টা করেও হলো না। ইন্টারনেট ফিরলে মাইকে আবার চাপুন',
      fatalNoAudio: 'অনেকক্ষণ কিছু শোনা যায়নি, তাই থামানো হলো',
      fatalOther: code => `সমস্যা হয়েছে (${code})। মাইকে চেপে আবার চেষ্টা করুন`,
      teachAsk: (from, to) => `মনে রাখব? পরেরবার "${from}" শুনলে "${to}" লিখব।`,
      teachYes: 'হ্যাঁ, মনে রাখো',
      teachNo: 'না',
      remembered: 'মনে রাখলাম। শব্দগুলো পপআপের "শব্দ" ট্যাবে দেখা ও বদলানো যায়।'
    },
    en: {
      speak: 'Speak to type', stopSpeak: 'Stop listening', startSpeak: 'Start listening',
      toBangla: 'Make it Bangla', toEnglish: 'Make it English',
      undo: 'Undo', move: 'Drag to move', more: 'More', less: 'Collapse',
      listening: 'Listening', speakNow: 'Speak, I am listening…', stopped: 'Stopped', doneBangla: 'Converted to Bangla',
      doneEnglish: 'Converted to English', working: 'Translating',
      putBackFailed: 'This box refused the change. Select the text and try again.',
      noBox: 'Click inside a text box first', noText: 'The box is empty',
      alreadyBangla: 'This is already Bangla',
      alreadyEnglish: 'This is already English',
      mixedText: 'Mixed text, get it into one language first',
      toBanglaBtn: 'Make it Bangla', toEnglishBtn: 'Make it English',
      workingBangla: 'Translating to Bangla',
      boxGone: 'The box is gone, your words are in the preview',
      transFail: 'Translation failed',
      transNoop: 'The translation came back unchanged. Check in setup that the language pack is downloaded.',
      needPack: 'The language pack is needed, open Setup',
      reload: 'Ukti was reloaded, please refresh this page (F5)',
      nothingUndo: 'Nothing to undo', undone: 'Undone',
      throttled: n => `Google's speech service needs a short break, back in ${n}s`,
      stuck: 'Speech is stuck. Tap the mic to stop, then start again',
      coachTitle: 'Ukti is ready',
      coachBody: 'Press the mic on the right, then speak. Your words land right here.',
      coachNote: 'If it does not work on a page, press F5 once.',
      coachOk: 'Got it',
      elsewhere: 'Dictation moved to another tab, stopped here',
      startFail: e => `Could not start: ${e}`,
      reconnecting: 'Reconnecting…',
      offline: 'No internet. Speech needs a connection; Banglish and translation work without one.',
      noTranslator: 'This Chrome cannot translate. Chrome 138 or newer is needed.',
      fatalNotAllowed: 'Microphone access is blocked. Open Ukti setup to allow it.',
      fatalNoMic: 'No microphone was found. Check that one is connected.',
      fatalService: 'The speech service would not start. Try again in a moment.',
      fatalLang: 'This browser has no Bangla speech recognition.',
      fatalNetwork: 'No internet, and retrying did not help. Press the mic again once you are back online.',
      fatalNoAudio: 'Nothing was heard for a long time, so listening stopped.',
      fatalOther: code => `Something went wrong (${code}). Press the mic to try again.`,
      teachAsk: (from, to) => `Remember this? Next time "${from}" becomes "${to}".`,
      teachYes: 'Yes, remember',
      teachNo: 'No',
      remembered: 'Remembered. You can see and change it in the Words tab of the popup.'
    }
  };

  // Settings writes that must never break an action. After the extension is
  // reloaded or updated, an open page keeps this script running with
  // chrome.storage gone, so a plain set() threw synchronously and took the
  // Banglish button down with it, silently, though conversion needs no
  // extension at all.
  function save(items) {
    try { chrome.storage.local.set(items).catch(() => {}); } catch (_) {}
  }

  function t(key, ...args) {
    const table = STRINGS[settings.uiLang === 'en' ? 'en' : 'bn'];
    const value = table[key] ?? STRINGS.bn[key] ?? key;
    return typeof value === 'function' ? value(...args) : value;
  }

  const sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  // Every start and stop from this frame gets the next number. Both travel
  // through the service worker as separate async handlers, so they can
  // arrive out of order; the offscreen side drops a command older than one
  // it has already obeyed, and replies carry the number of the start they
  // belong to, so a late STOPPED from an earlier round is ignored here.
  let epoch = 0;
  let liveEpoch = 0;

  let listening = false;
  let target = null;          // the box dictation was started in
  let undoStack = [];         // {element, kind, snapshot}
  let indicator = null;
  // Must agree with getSettings() in background.js for every key used here
  // (tests/migration.test.js checks the popup's copy the same way).
  const DEFAULTS = {
    outputMode: 'bangla', autoSubmit: false, uiSize: 'medium',
    showHints: false, useCount: 0, barPos: null, barCorner: 'auto', coachDone: false,
    theme: 'glass', uiLang: 'bn', layout: 'compact',
    buttons: { banglish: true, english: true, undo: true, grip: true },
    enabled: true, disabledSites: [],
    showMode: 'smart',          // 'smart' | 'always' | 'sites'
    allowSites: []              // the sites chosen in 'sites' mode
  };
  let settings = { ...DEFAULTS };

  // ------------------------------------------------------- target detection

  // Words that mark a field as a secret: a password, a one-time code, a
  // PIN, or any part of a payment card. Matched against the hints a site
  // gives its own password manager and its screen reader users. The cc-
  // tokens and one-time-code are the standard autocomplete values, which
  // the older list missed (it only knew "cardnumber" and "otp").
  const SENSITIVE =
    /password|passwd|passcode|\bpin\b|\botp\b|one-time-code|\bcc-|cvv|cvc|\bcsc\b|security.?code|cardnumber|card.?number|creditcard|credit.?card/i;

  function sensitive(node) {
    const attr = name => node.getAttribute(name) || '';
    const hint = [attr('autocomplete'), attr('name'), node.id || '', attr('aria-label'),
      attr('placeholder'), attr('aria-placeholder')].join(' ');
    if (SENSITIVE.test(hint)) return true;
    // A password drawn as dots by CSS rather than by type="password".
    try {
      const mask = getComputedStyle(node).webkitTextSecurity;
      if (mask && mask !== 'none') return true;
    } catch (_) {}
    return false;
  }

  function editableFrom(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;

    if (node instanceof HTMLTextAreaElement) return sensitive(node) ? null : node;

    if (node instanceof HTMLInputElement) {
      // Password fields are deliberately absent. Dictation there would
      // send a password to a speech service, and no store reviewer would
      // pass a microphone extension that switches itself on at a login box.
      const ok = ['text', 'search', 'url', 'tel', 'email'];
      if (!ok.includes(node.type)) return null;
      // Sites that hide a password behind type="text" still mark it up for
      // their own password managers, so honour those hints too.
      if (sensitive(node)) return null;
      return node;
    }

    if (node.isContentEditable) {
      const root = node.closest('[contenteditable=""],[contenteditable="true"]') || node;
      // Custom PIN and card widgets are often contenteditable, and carry
      // their meaning only in aria-label or autocomplete.
      if (sensitive(root) || (root !== node && sensitive(node))) return null;
      return root;
    }

    return null;
  }

  // document.activeElement stops at the shadow host, so walk into open roots.
  function deepActiveElement() {
    let element = document.activeElement;
    while (element && element.shadowRoot && element.shadowRoot.activeElement) {
      element = element.shadowRoot.activeElement;
    }
    return element;
  }

  function currentEditable() {
    return editableFrom(deepActiveElement());
  }

  // The box can lose focus while the user fiddles, so keep the last good one.
  let lastEditable = null;
  document.addEventListener(
    'focusin',
    () => {
      const found = currentEditable();
      if (!found) return;
      clearTimeout(hideSoon);
      // A heavy site can fire focusin many times for one user action, and
      // measuring the page on each of them is how a control like this
      // starts costing frames. Nothing to do if the box has not changed.
      if (found === lastEditable && bar && bar.classList.contains('on')) return;
      lastEditable = found;
      if (quietBox(found)) { watchQuiet(found); return; }
      showButtons();
      if (found !== anchored) requestAnimationFrame(() => anchorToField(found));
    },
    true
  );

  // ------------------------------------------------- when the control shows
  // It used to appear on the first focus in any box and then stay for the
  // life of the page: one click in YouTube's search box and it sat there
  // through the video. Now it follows focus, search boxes do not summon it,
  // and the popup lets the user choose where it appears at all.

  // Search and address fields: short lookups, not writing. They do not
  // summon the control in smart mode, though the shortcuts work there and
  // typing Banglish into one brings it (watchQuiet).
  const SEARCH_NAMES = new Set(['q', 's', 'k', 'query', 'search', 'search_query', 'searchterm', 'keyword', 'keywords']);
  const SEARCH_HINT = /\bsearch\b|\bfind\b|\blook ?up\b|খুঁজ|সার্চ|অনুসন্ধান/i; // not-a-message: matches page labels
  function quietBox(el) {
    if (settings.showMode === 'always') return false;
    if (el instanceof HTMLInputElement && ['search', 'url', 'email', 'tel'].includes(el.type)) return true;
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'searchbox' || role === 'combobox') return true;
    if (el.closest('[role="search"], search')) return true;
    if (SEARCH_NAMES.has((el.getAttribute('name') || '').toLowerCase())) return true;
    const im = (el.getAttribute('inputmode') || '') + ' ' + (el.getAttribute('enterkeyhint') || '');
    if (/search/i.test(im)) return true;
    const hint = [el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('title'), el.id].join(' ');
    return SEARCH_HINT.test(hint);
  }

  // In a quiet box the control waits until the user writes Banglish there:
  // two Banglish words are a person writing Bangla, not searching.
  const watched = new WeakSet();
  function watchQuiet(el) {
    if (watched.has(el)) return;
    watched.add(el);
    let timer = 0;
    el.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (currentEditable() !== el || (bar && bar.classList.contains('on'))) return;
        const s = self.UktiBanglish.stats(existingText(el));
        // Two words or more, at least one the dictionary knows as Bangla,
        // and no more than half of them looking English.
        if (s.words < 2 || s.bangla < 1 || s.english > s.words / 2) return;
        showButtons();
        requestAnimationFrame(() => anchorToField(el));
      }, 350);
    });
  }

  // Hide once focus has left the box, after a grace period long enough to
  // reach the control with the pointer. Not while dictating, not while the
  // pointer or keyboard focus is on the control, not while its preview or
  // welcome card is open.
  const HIDE_AFTER_MS = 2000;
  let hideSoon = 0;
  let pointerOnBar = false;
  function scheduleHide() {
    clearTimeout(hideSoon);
    hideSoon = setTimeout(maybeHide, HIDE_AFTER_MS);
  }
  function maybeHide() {
    if (!bar || !bar.classList.contains('on')) return;
    const box = currentEditable();
    const keep = listening || starting || pointerOnBar ||
      document.activeElement === hostEl ||
      (preview && preview.classList.contains('on')) ||
      (coach && coach.classList.contains('on')) ||
      (box && !quietBox(box));
    if (keep) { scheduleHide(); return; }
    bar.classList.remove('on');
    lastEditable = null;
  }
  document.addEventListener('focusout', () => { if (bar) scheduleHide(); }, true);

  // The remembered box is checked again at the moment of use. A page can
  // mark a field as a password after it was focused, and the old fallback
  // handed that field over without asking.
  function resolveTarget() {
    return currentEditable() || (lastEditable?.isConnected ? editableFrom(lastEditable) : null);
  }

  // ------------------------------------------------------ insertion engine

  function snapshot(element) {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return {
        element,
        kind: 'value',
        snapshot: element.value,
        start: element.selectionStart,
        end: element.selectionEnd
      };
    }
    // Rich editors used to be left to the browser's own undo. That never
    // worked: our insert goes in through execCommand, which the editor
    // folds into its own history, so the browser's undo stepped somewhere
    // else entirely and the old text came back beside the new one instead
    // of replacing it. Keep the text ourselves and put it back the same
    // way we put text in.
    return { element, kind: 'editable', snapshot: existingText(element) };
  }

  function insertIntoNative(element, text) {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    const old = element.value;
    const next = old.slice(0, start) + text + old.slice(end);

    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    // React installs its own value setter on the instance and uses it to
    // detect changes. Going through the prototype setter bypasses that, and
    // the input event below is what makes React pick the change up.
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) return false;

    element.focus();
    setter.call(element, next);

    const caret = start + text.length;
    try { element.setSelectionRange(caret, caret); } catch (_) {}

    element.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertText',
        data: text
      })
    );
    return true;
  }

  // `only` runs one strategy instead of walking all three. replaceAll uses
  // it because a strategy can look like it worked and be undone a tick
  // later: Gemini's editor accepts a synthetic paste into the DOM and then
  // rewrites it from its own model, so a check taken here reports success
  // on an edit that is already doomed. Driving one strategy at a time lets
  // the caller wait, see what survived, and move to the next one.
  function insertIntoEditable(element, text, expect, only) {
    element.focus();

    const doc = element.ownerDocument;
    const selection = doc.getSelection();
    if (!selection) return false;

    const range =
      selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const inside =
      range && element.contains(range.commonAncestorContainer);

    if (!inside) {
      const fresh = doc.createRange();
      fresh.selectNodeContents(element);
      fresh.collapse(false);
      selection.removeAllRanges();
      selection.addRange(fresh);
    }

    // Which way in works depends on the editor, and the order matters.
    // execCommand writes straight into the DOM without the editor's model
    // hearing about it, so on a site like WhatsApp the text appears for an
    // instant and is thrown away on the next render, while a check made
    // here would call it a success. A paste is the one edit every editor
    // that owns its model handles properly, so it goes first; plain boxes
    // ignore it and fall through.
    const before = existingText(element);
    // When the caller says what the box should end up holding, check for
    // exactly that. Otherwise any change counts, which is right for
    // dictation, where text is added at the caret.
    const ok = () => expect == null
      ? existingText(element) !== before
      : sameText(existingText(element), expect);

    // When replacing, cover the whole box again before each attempt. A
    // strategy that appended rather than replaced has left the box wrong,
    // and the next attempt must overwrite all of it, not add to it.
    const coverAll = () => {
      if (expect == null) return;
      try { if (doc.execCommand('selectAll')) return; } catch (_) {}
      const r = doc.createRange();
      r.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(r);
    };

    // An attempt can append instead of replacing. That leaves the box
    // holding the old text and the new text together, which is exactly
    // what the user was complaining about, so undo it before trying again.
    const repair = () => {
      if (expect == null) return;
      if (sameText(existingText(element), before)) return;
      try {
        if (doc.execCommand('selectAll')) {
          doc.execCommand('insertText', false, before);
        }
      } catch (_) {}
      if (!sameText(existingText(element), before)) {
        element.textContent = before;
      }
    };

    // 1. A paste, which Lexical, Draft and ProseMirror all route through
    //    their own model.
    if (!only || only === 'paste') try {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
          composed: true
        })
      );
      if (ok()) return true;
    } catch (_) {}

    // 2. The browser's own editing engine. Right for plain editable boxes,
    //    and the only thing Gemini's Quill editor keeps.
    if (!only || only === 'command') try {
      if (!only) { repair(); coverAll(); }
      doc.execCommand('insertText', false, text);
      if (ok()) return true;
    } catch (_) {}

    // Last resort. Touches the DOM directly, so a framework editor may
    // discard it on the next render.
    if (!only || only === 'range') try {
      if (!only) { repair(); coverAll(); }
      const r = selection.getRangeAt(0);
      r.deleteContents();
      const node = doc.createTextNode(text);
      r.insertNode(node);
      r.setStartAfter(node);
      r.collapse(true);
      selection.removeAllRanges();
      selection.addRange(r);

      element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertText',
          data: text
        })
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function insertText(element, text) {
    if (!element || !element.isConnected) return false;

    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return insertIntoNative(element, text);
    }
    return insertIntoEditable(element, text);
  }

  function existingText(element) {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return element.value;
    }
    // Rich editors pad their contents with zero-width marks and a
    // trailing newline of their own. Those are not the user's text.
    return (element.innerText || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\n+$/, '');
  }

  const sameText = (a, b) =>
    a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

  const nextTurn = ms =>
    new Promise(resolve =>
      requestAnimationFrame(() => setTimeout(resolve, ms))
    );

  // Replacing everything in a rich editor is not the same as typing into
  // it. The editor keeps its own idea of where the selection is, and only
  // updates it some time after the browser says the selection moved. Ask
  // it to replace before it has caught up and it puts the new text at the
  // old caret instead, which is how a translation ended up sitting beside
  // the original rather than replacing it.
  //
  // How long "some time" is differs by editor and by how busy the page is,
  // so waiting a fixed moment and hoping is a race. Instead: try, check
  // what actually ended up in the box, and if it is wrong, put the box
  // back and try again with more room to breathe.
  // Whether the current selection covers everything the box holds. The
  // comparison ignores the zero-width marks rich editors pad their content
  // with, and the difference between one space and several.
  function everythingSelected(element, doc) {
    const whole = existingText(element);
    if (!whole) return true;
    const selection = doc.getSelection();
    if (!selection || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.commonAncestorContainer)) return false;
    const picked = range.toString().replace(/[​-‍﻿]/g, '');
    return sameText(picked, whole);
  }

  async function replaceAll(element, text) {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      element.focus();
      element.setSelectionRange(0, element.value.length);
      return insertIntoNative(element, text);
    }

    const doc = element.ownerDocument;
    const original = existingText(element);

    const selectEverything = () => {
      element.focus({ preventScroll: true });
      let picked = false;
      const active = deepActiveElement();
      if (active === element || element.contains(active)) {
        try { picked = doc.execCommand('selectAll'); } catch (_) {}
      }
      if (!picked) {
        const selection = doc.getSelection();
        const range = doc.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    };

    const putBackOriginal = () => {
      if (sameText(existingText(element), original)) return;
      try {
        if (doc.execCommand('selectAll')) {
          doc.execCommand('insertText', false, original);
        }
      } catch (_) {}
      if (!sameText(existingText(element), original)) {
        element.textContent = original;
      }
    };

    // One attempt per strategy rather than three of the same. Retrying the
    // way that just lost is how a box on Gemini stayed in Banglish through
    // all three tries: the paste landed, the editor rewrote it from its
    // model, and the next attempt pasted again.
    for (const how of ['paste', 'command', 'range']) {
      if (!element.isConnected) return false;
      putBackOriginal();
      // Twice, with a turn in between. The first select-all can land while
      // the editor is still digesting the typing that came before it, and
      // then it reads a selection that is already out of date. The second
      // one is made against a settled editor, and the wait after it is what
      // lets the editor read it. Nothing may touch the selection after that
      // point, or we are racing it again.
      selectEverything();
      await nextTurn(35);
      if (!element.isConnected) return false;
      selectEverything();
      await nextTurn(35);
      if (!element.isConnected) return false;

      // Do not write unless the whole box really is selected. A paste into
      // an unselected box lands beside the old text instead of over it, and
      // the user is left holding the sentence twice, which is worse than a
      // button that did nothing. Better to run out of attempts and say so.
      if (!everythingSelected(element, doc)) continue;

      if (!insertIntoEditable(element, text, text, how)) continue;

      // An editor that owns its DOM does not argue at the moment of the
      // write: it lets the change land and reverts it on a later task. A
      // check taken straight after the write therefore sees text the editor
      // is about to throw away. Look again once the page has had a turn,
      // and only then call it done.
      await nextTurn(140);
      if (!element.isConnected) return false;
      if (sameText(existingText(element), text)) return true;
    }

    putBackOriginal();
    return false;
  }

  function selectedText(element) {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      const start = element.selectionStart ?? 0;
      const end = element.selectionEnd ?? 0;
      return start === end ? '' : element.value.slice(start, end);
    }
    const selection = element.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed) return '';
    if (!element.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      return '';
    }
    return selection.toString();
  }

  function submitBox(element) {
    const init = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      composed: true
    };
    element.dispatchEvent(new KeyboardEvent('keydown', init));
    element.dispatchEvent(new KeyboardEvent('keypress', init));
    element.dispatchEvent(new KeyboardEvent('keyup', init));
  }

  // ------------------------------------------------------------- indicator

  let hideTimer = null;

  // ---------------------------------------------------------- live preview

  let doneSpan = null;
  let liveSpan = null;
  let scrollBox = null;
  let hintSpan = null;
  let lastWords = [];

  // The frame keeps the size and place it always had; the text scrolls in
  // an inner box so the glow ring on the frame's edge never scrolls away.
  function ensurePreviewParts() {
    buildBar();
    if (doneSpan) return;
    scrollBox = document.createElement('div');
    scrollBox.className = 'scroll';
    hintSpan = document.createElement('span');
    hintSpan.className = 'hint';
    doneSpan = document.createElement('span');
    doneSpan.className = 'done';
    liveSpan = document.createElement('span');
    liveSpan.className = 'live';
    const caret = document.createElement('span');
    caret.className = 'caret';
    scrollBox.append(hintSpan, doneSpan, liveSpan, caret);
    preview.append(scrollBox);
  }

  // The prompt shows until the first word, so an open, empty panel never
  // looks broken.
  function paintHint() {
    if (!hintSpan) return;
    hintSpan.textContent = t('speakNow');
    const empty = !doneSpan.childNodes.length && !liveSpan.childNodes.length;
    hintSpan.hidden = !empty;
  }

  function scrollToEnd() {
    if (scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight;
  }

  let coach = null;

  // The preview and the welcome card both hang above the bar, so they have
  // to be measured against it rather than pinned to a corner. The bar now
  // moves to sit beside the active box, which would otherwise strand them.
  function placePreview() {
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    if (!rect.height) return;
    const gap = 12;
    const bottom = Math.round(window.innerHeight - rect.top + gap) + 'px';
    const right = Math.round(window.innerWidth - rect.right) + 'px';

    if (preview) {
      preview.style.bottom = bottom;
      preview.style.right = right;
    }
    if (coach) {
      coach.style.bottom = bottom;
      coach.style.right = right;
    }
  }

  function showPreview() {
    ensurePreviewParts();
    if (coach) {
      coach.classList.remove('on');
      settings.coachDone = true;
      save({ coachDone: true });
    }
    placePreview();
    paintHint();
    preview.classList.add('on');
  }

  function resetPreview() {
    if (!doneSpan) return;
    doneSpan.textContent = '';
    liveSpan.textContent = '';
    lastWords = [];
    paintHint();
  }

  function hidePreview() {
    if (preview) {
      preview.classList.remove('on');
      preview.style.removeProperty('--lvl');
    }
    for (const f of shadow?.querySelectorAll('.fly') || []) f.remove();
    resetPreview();
  }

  // Interim transcripts arrive as a growing, sometimes rewritten string.
  // Only the words that are genuinely new get re-created, so settled words
  // do not flicker and re-animate on every update.
  function renderInterim(text) {
    ensurePreviewParts();
    placePreview();
    const words = text.trim().split(/\s+/).filter(Boolean);

    let same = 0;
    while (
      same < words.length &&
      same < lastWords.length &&
      words[same] === lastWords[same]
    ) same++;

    while (liveSpan.children.length > same) liveSpan.lastChild.remove();
    for (let i = same; i < words.length; i++) {
      const w = document.createElement('w');
      w.textContent = words[i];
      // A word that arrives in a burst with others starts a beat later, so
      // a phrase reads in rather than popping in all at once.
      w.style.animationDelay = `${Math.min(i - same, 6) * 35}ms`;
      liveSpan.appendChild(w);
    }

    lastWords = words;
    paintHint();
    scrollToEnd();
  }

  // Each final sentence becomes its own segment, which settles from the
  // bright live colour to the quieter colour of finished text.
  function commitToPreview(text) {
    ensurePreviewParts();
    const seg = document.createElement('span');
    seg.className = 'seg';
    seg.textContent = text;
    if (doneSpan.childNodes.length) doneSpan.append(' ');
    doneSpan.append(seg);
    liveSpan.textContent = '';
    lastWords = [];
    paintHint();
    scrollToEnd();
  }

  // A copy of the sentence travels from the preview into the box it went
  // to. Decoration only: the words are already in the box by the time it
  // lands, and under reduced motion it never runs.
  function flyToBox(text, box) {
    if (calm() || !shadow || !preview || !box?.isConnected) return;
    const from = (doneSpan.lastChild || preview).getBoundingClientRect();
    const to = box.getBoundingClientRect();
    if (!from.width || !to.width) return;
    const fly = document.createElement('div');
    fly.className = 'fly';
    fly.textContent = text;
    fly.style.left = `${from.left}px`;
    fly.style.top = `${from.top}px`;
    shadow.appendChild(fly);
    const dx = Math.round(to.left + Math.min(24, to.width / 4) - from.left);
    const dy = Math.round(to.top + Math.min(to.height / 2, 28) - from.top);
    const gone = () => fly.remove();
    if (!fly.animate) { gone(); return; }
    const anim = fly.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 0, filter: 'blur(0)' },
      { opacity: 1, offset: .15 },
      { transform: `translate(${dx * .55}px, ${dy * .55 - 30}px) scale(.85)`, opacity: .9, offset: .6 },
      { transform: `translate(${dx}px, ${dy}px) scale(.5)`, opacity: 0, filter: 'blur(3px)' },
    ], { duration: 640, easing: 'cubic-bezier(.45,0,.2,1)' });
    anim.onfinish = gone;
    anim.oncancel = gone;
    setTimeout(gone, 900);
  }

  const DOTS = '<span class="dots"><i></i><i></i><i></i></span>';

  function showIndicator(label, tone, dots) {
    buildBar();
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'toast';
      indicator.setAttribute('data-ukti-toast', '');
      indicator.setAttribute('role', 'status');
      indicator.setAttribute('aria-live', 'polite');
      shadow.appendChild(indicator);
    }
    clearTimeout(hideTimer);
    // A refusal or a failure shakes the button it answers. The toast, in red,
    // stays the message; the shake only says "that did not happen".
    if (tone === 'error' && !calm()) { shake(feedbackButton(null)); acted = null; }
    indicator.textContent = label;
    if (dots) indicator.insertAdjacentHTML('beforeend', DOTS);
    indicator.className =
      'toast on' + (tone === 'error' ? ' err' : tone === 'busy' ? ' busy' : '');
  }

  function hideIndicator(delay = 1200) {
    if (!indicator) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (indicator) indicator.classList.remove('on');
    }, delay);
  }

  // Ukti is not wanted on every site. One switch turns it off everywhere,
  // another turns it off just here, which is what people actually reach for.
  // In a frame, the site is the page the user is looking at, not the
  // frame's own origin. Otherwise "off for this site" left every embedded
  // third-party editor (comments, chat widgets) still showing the control.
  // ancestorOrigins is readable even across origins.
  function siteKey() {
    try {
      const up = location.ancestorOrigins;
      const host = up && up.length ? new URL(up[up.length - 1]).hostname : location.hostname;
      return host.replace(/^www\./, '');
    } catch (_) { return ''; }
  }

  function isOff() {
    if (settings.enabled === false) return true;
    // "Chosen sites only": everywhere else Ukti is as good as off,
    // shortcuts included.
    if (settings.showMode === 'sites') {
      const allow = settings.allowSites;
      if (!Array.isArray(allow) || !allow.includes(siteKey())) return true;
    }
    const list = settings.disabledSites;
    return Array.isArray(list) && list.includes(siteKey());
  }

  function applyEnabled() {
    if (!bar) return;
    if (isOff()) {
      if (listening) stopDictation();
      bar.classList.remove('on');
      hidePreview();
      if (indicator) indicator.classList.remove('on');
      if (coach) coach.classList.remove('on');
    } else {
      const box = currentEditable();
      if (box && !quietBox(box)) bar.classList.add('on');
    }
  }

  // --------------------------------------------------------------- actions

  // Read straight from storage. This used to ask the service worker, which
  // meant every frame of every page woke the worker on load: a page with ten
  // ad iframes sent eleven messages before the user had done anything.
  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get(null);
      settings = { ...DEFAULTS, ...stored };
    } catch (_) {}
  }

  // A start takes a round trip to the service worker and the offscreen
  // document, and `listening` only turns true at the end of it. A second
  // press inside that gap used to start again rather than stop, and its
  // stop could overtake the start, leaving the microphone on after the user
  // had pressed it off. Presses during a start now only flip what is
  // wanted, and the start honours the last word when its reply lands.
  let starting = false;
  let wanted = false;
  let startToken = 0;
  let stopping = null;

  function toggleDictation() {
    if (starting) { wanted = !wanted; return; }
    listening ? stopDictation() : startDictation();
  }

  async function startDictation() {
    const box = resolveTarget();
    if (!box) {
      showIndicator(t('noBox'), 'error');
      hideIndicator();
      return;
    }

    starting = true;
    wanted = true;
    const mine = ++startToken;
    try {
      await beginDictation(box, mine);
    } finally {
      // Only the start that set the flag clears it: a newer start may have
      // begun while this one was finishing.
      if (startToken === mine) starting = false;
    }
  }

  async function beginDictation(box, token) {
    if (stopping) await stopping;
    await loadSettings();
    target = box;

    let reply;
    try {
      reply = await chrome.runtime.sendMessage({
        type: 'START_DICTATION',
        sessionId,
        epoch: (liveEpoch = ++epoch)
      });
    } catch (_) {
      // Happens when the extension was reloaded but this page was not.
      showIndicator(t('reload'), 'error');
      hideIndicator(4000);
      return;
    }

    if (!reply?.ok) {
      showIndicator(t('startFail', reply?.error || 'unknown'), 'error');
      hideIndicator(2500);
      return;
    }

    // Pressed off again while the start was on its way.
    if (!wanted) {
      listening = false;
      paintMic();
      // Decided. From here a press is a new start, not a change of mind about
      // this one: before, a press during this stop's round trip only flipped
      // `wanted`, which nothing read any more, and the user's "on" was lost.
      if (startToken === token) starting = false;
      const sent = stopping = (async () => {
        try { await chrome.runtime.sendMessage({ type: 'STOP_DICTATION', sessionId, epoch: ++epoch }); } catch (_) {}
      })();
      await sent;
      if (stopping === sent) stopping = null;
      return;
    }

    countUse();
    // The engine's own LISTENING can arrive before this reply, and after it
    // a warning (offline, say). Announcing "listening" again here covered
    // that warning, so only announce it if the engine has not.
    if (listening) return;
    listening = true;
    paintMic();
    resetPreview();
    showPreview();
    showIndicator(t('listening'), null, true);
  }

  async function stopDictation() {
    listening = false;
    paintMic();
    hidePreview();
    showIndicator(t('stopped'));
    hideIndicator();
    // Scoped to this frame's session, so stopping here can never stop a
    // dictation another tab has since started. Kept as a promise because a
    // start must not overtake it: both go through the service worker as
    // separate async handlers, and a STOP that lands after the next START
    // switched the new session straight off.
    const sent = stopping = (async () => {
      try { await chrome.runtime.sendMessage({ type: 'STOP_DICTATION', sessionId, epoch: ++epoch }); } catch (_) {}
    })();
    await sent;
    if (stopping === sent) stopping = null;
  }

  // A page that goes away mid-dictation used to leave the microphone
  // running in the offscreen document, sending audio for a page that no
  // longer existed. Tell the engine before the page goes.
  window.addEventListener('pagehide', () => {
    if (!listening) return;
    listening = false;
    try { chrome.runtime.sendMessage({ type: 'STOP_DICTATION', sessionId, epoch: ++epoch }).catch(() => {}); } catch (_) {}
  });

  function pushUndo(element) {
    undoStack.push(snapshot(element));
    // Long dictation would otherwise grow this forever.
    if (undoStack.length > 20) undoStack.shift();
  }

  // Returns { box, selected, source }, or null after telling the user why.
  function grabText() {
    const box = resolveTarget();
    if (!box) {
      showIndicator(t('noBox'), 'error');
      hideIndicator();
      return null;
    }
    const selected = selectedText(box);
    const source = selected || existingText(box);
    if (!source.trim()) {
      showIndicator(t('noText'), 'error');
      hideIndicator();
      return null;
    }
    return { box, selected, source };
  }

  async function putBack(box, selected, text) {
    pushUndo(box);
    const before = existingText(box);
    if (selected) insertText(box, text);
    else await replaceAll(box, text);

    // Some editors refuse an edit they did not originate, and a few take it
    // in the wrong place. This check used to ask only whether anything had
    // changed, so a box that ended up holding both the old sentence and the
    // new one counted as a success and the user got no warning at all.
    // Ask the real question instead: does the box now hold what it should.
    await nextTurn(60);
    if (!box.isConnected) return false;

    const after = existingText(box);
    if (sameText(after, text)) return true;
    if (selected && after !== before) return true;   // a partial replace

    // A box left holding the text twice is worse than one that did not
    // change, so put the original back before owning up.
    if (!sameText(after, before)) {
      await replaceAll(box, before);
    }
    showIndicator(t('putBackFailed'), 'error');
    hideIndicator(5000);
    return false;
  }

  // Only three conversions make sense. Anything else is refused with a
  // reason, because silently doing the wrong thing is worse than doing
  // nothing:
  //
  //            অ (to Bangla)              EN (to English)
  //   banglish transliterate              transliterate, then bn to en
  //   bangla   refuse, already Bangla     translate bn to en
  //   english  translate en to bn         refuse, already English

  async function ask(text, from, to) {
    try {
      return await chrome.runtime.sendMessage({
        type: 'TRANSLATE', text, from, to
      });
    } catch (_) {
      return { ok: false, error: 'DISCONNECTED' };
    }
  }

  function translateProblem(reply) {
    if (reply?.error === 'DISCONNECTED') return t('reload');
    // No API at all is an old Chrome, which no language pack will fix.
    if (reply?.error === 'NO_TRANSLATOR_API') return t('noTranslator');
    if (reply?.error === 'NotAllowedError' ||
        reply?.error === 'PAIR_UNAVAILABLE' ||
        reply?.error === 'NEEDS_DOWNLOAD') return t('needPack');
    return t('transFail');
  }

  // অ button: whatever is in the box ends up in Bangla.
  // The last conversion in each box: what was there, what Ukti made of it,
  // and which way it went. Translating back is never the original wording
  // (reported: "আচ্ছা দেখি তো এখন ঠিক মতন কাজ করে নাকি" went to "Well now it
  // works fine" and came back "ভাল এখন এটা ভাল কাজ করে"), so if the box still
  // holds exactly what Ukti wrote, the opposite button puts the original
  // back. Kept in the page's memory only, never stored.
  const lastConversion = new WeakMap();

  function remember(box, selected, original, result, to) {
    if (selected) { lastConversion.delete(box); return; }   // whole boxes only
    lastConversion.set(box, { original, result, to });
  }

  // The original, if pressing toward `to` should undo the last conversion.
  function reversible(box, selected, source, to) {
    const last = lastConversion.get(box);
    if (!last || selected || last.to === to) return null;
    return sameText(source, last.result) ? last.original : null;
  }

  async function restore(box, selected, original, doneKey, button) {
    lastConversion.delete(box);
    if (!(await putBack(box, selected, original))) return;
    showIndicator(t(doneKey));
    succeeded(box, button);
    hideIndicator();
  }

  async function convertBanglish() {
    const grabbed = grabText();
    if (!grabbed) return;

    const { box, selected, source } = grabbed;
    const back = reversible(box, selected, source, 'bn');
    if (back != null) return restore(box, selected, back, 'doneBangla', banglishButton);
    const kind = self.UktiBanglish.classify(source);

    if (kind === 'bangla') {
      showIndicator(t('alreadyBangla'), 'error');
      hideIndicator(2500);
      return;
    }

    if (kind === 'banglish') {
      countUse();
      const out = self.UktiBanglish.convert(source);
      if (!(await putBack(box, selected, out))) return;
      // Not reversible: the original is Banglish, and EN asks for English.
      lastConversion.delete(box);
      showIndicator(t('doneBangla'));
      succeeded(box, banglishButton);
      hideIndicator();
      return;
    }

    // Real English: translate it rather than mangling it letter by letter.
    showIndicator(t('workingBangla'), 'busy', true);
    const reply = await ask(source, 'en', 'bn');
    if (!reply?.ok) {
      showIndicator(translateProblem(reply), 'error');
      hideIndicator(3500);
      return;
    }
    if (sameText(reply.text, source)) {
      showIndicator(t('transNoop'), 'error');
      hideIndicator(5000);
      return;
    }

    countUse();
    if (!(await putBack(box, selected, reply.text))) return;
    remember(box, selected, source, reply.text, 'bn');
    showIndicator(t('doneBangla'));
    succeeded(box, banglishButton);
    hideIndicator();
  }

  // EN button: whatever is in the box ends up in English. Banglish goes
  // through Bangla script first, because the translator reads Bangla, not
  // romanised Bangla, and the two-step result is much better.
  async function convertToEnglish() {
    const grabbed = grabText();
    if (!grabbed) return;

    const { box, selected, source } = grabbed;
    const back = reversible(box, selected, source, 'en');
    if (back != null) return restore(box, selected, back, 'doneEnglish', englishButton);
    const kind = self.UktiBanglish.classify(source);

    if (kind === 'english') {
      showIndicator(t('alreadyEnglish'), 'error');
      hideIndicator(2500);
      return;
    }

    const bangla = kind === 'banglish'
      ? self.UktiBanglish.convert(source)
      : source;

    showIndicator(t('working'), 'busy', true);
    const reply = await ask(bangla, 'bn', 'en');

    if (!reply?.ok) {
      // The Bangla step already succeeded, so hand that over rather than
      // leaving the user with nothing.
      if (kind === 'banglish') await putBack(box, selected, bangla);  // best effort
      showIndicator(translateProblem(reply), 'error');
      hideIndicator(3500);
      return;
    }

    // A translator with no language pack can hand the text straight back.
    // Writing that into the box put the same sentence in twice and looked
    // like the button was broken, so stop here and say what is wrong.
    if (sameText(reply.text, bangla)) {
      showIndicator(t('transNoop'), 'error');
      hideIndicator(5000);
      return;
    }

    countUse();
    if (!(await putBack(box, selected, reply.text))) return;
    // Back to Bangla means the Bangla form, even if Banglish was typed.
    remember(box, selected, bangla, reply.text, 'en');
    showIndicator(t('doneEnglish'));
    succeeded(box, englishButton);
    hideIndicator();
  }

  async function undoLast() {
    // An entry whose box has left the page cannot be undone, and stopping
    // at it hid every older entry for a box that is still here.
    let entry = undoStack.pop();
    while (entry && !entry.element.isConnected) entry = undoStack.pop();
    if (!entry) {
      showIndicator(t('nothingUndo'), 'error');
      hideIndicator();
      return;
    }

    if (entry.kind === 'value') {
      await replaceAll(entry.element, entry.snapshot);
      try {
        entry.element.setSelectionRange(entry.start, entry.end);
      } catch (_) {}
    } else {
      // Same path as an insert: select everything, then ask the editing
      // engine to replace it. That keeps ProseMirror and friends in step.
      await replaceAll(entry.element, entry.snapshot ?? '');
    }

    showIndicator(t('undone'));
    succeeded(entry.element, undoButton);
    hideIndicator();
  }

  // -------------------------------------------------------- floating buttons

  let bar = null;
  let micButton = null;
  let banglishButton = null, englishButton = null, undoButton = null;
  let shadow = null;
  let preview = null;
  let hostEl = null;

  const svg = (size, body) =>
    `<svg viewBox="0 0 24 24" style="width:${size}em;height:${size}em" fill="none" ` +
    `stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ` +
    `stroke-linejoin="round">${body}</svg>`;

  const ICONS = {
    mic: svg(
      1.45,
      '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>' +
        '<path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/>'
    ),
    stop: svg(1.3, '<rect x="7" y="7" width="10" height="10" rx="2.5" fill="currentColor"/>'),
    undo: svg(1.2, '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H10"/>'),
    more: svg(1.2, '<path d="M5 15l7-7 7 7"/>'),
    less: svg(1.2, '<path d="M19 9l-7 7-7-7"/>'),
    grip: svg(
      1.15,
      '<circle cx="9" cy="6" r="1.35" fill="currentColor" stroke="none"/>' +
        '<circle cx="15" cy="6" r="1.35" fill="currentColor" stroke="none"/>' +
        '<circle cx="9" cy="12" r="1.35" fill="currentColor" stroke="none"/>' +
        '<circle cx="15" cy="12" r="1.35" fill="currentColor" stroke="none"/>' +
        '<circle cx="9" cy="18" r="1.35" fill="currentColor" stroke="none"/>' +
        '<circle cx="15" cy="18" r="1.35" fill="currentColor" stroke="none"/>'
    )
  };

  // The browser only knows pixels, never how big the screen physically is,
  // so this is a sensible default that the user can override in settings.
  function autoScale() {
    const w = window.innerWidth;
    if (w >= 2800) return 1.75;
    if (w >= 2200) return 1.5;
    if (w >= 1750) return 1.25;
    if (w >= 1400) return 1.1;
    return 1;
  }

  const SIZE_FACTOR = { small: 0.85, medium: 1, large: 1.3 };

  function applyTheme() {
    if (!hostEl) return;
    const theme = settings.theme || 'glass';
    if (theme === 'glass') hostEl.removeAttribute('data-theme');
    else hostEl.setAttribute('data-theme', theme);
  }

  function applyScale() {
    if (!hostEl) return;
    const factor = SIZE_FACTOR[settings.uiSize] ?? 1;
    hostEl.style.setProperty('--s', (autoScale() * factor).toFixed(3));
    requestAnimationFrame(placePreview);
  }

  // Everything lives in a shadow root so no site's CSS can restyle it and
  // our styles cannot leak onto the page.
  // One scale variable drives every size, so the whole control grows
  // together on a large screen instead of needing a dozen breakpoints.
  const STYLE = `
    :host {
      all: initial;
      --s: 1;
      --unit: calc(16px * var(--s));
      --spring: cubic-bezier(.34, 1.4, .5, 1);
      /* A real spring, sampled into linear() (Chrome 113+): a soft
         overshoot and one small settle, which cubic-bezier cannot draw. */
      --spring-soft: linear(0, .009, .035 2.1%, .141, .281 6.7%, .723 12.9%, .938 16.7%,
        1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%,
        1.051 39.6%, 1.017 43.1%, .991, .977 51%, .974 53.8%, .975 57.1%, .997 69.8%,
        1.003 76.9%, 1.004 83.8%, 1);

      /* Glass: see-through, blurred. The default. */
      --ink: #f4f4f5;
      --glass: rgba(22, 24, 30, .93);
      --edge: rgba(255, 255, 255, .12);
      --blur: none;
      /* Only the speech preview blurs, and only while it is on screen. */
      --blur-panel: blur(12px) saturate(1.25);
      --drop: rgba(0, 0, 0, .3);
      --hover: rgba(38, 41, 50, .92);
      --hover-edge: rgba(255, 255, 255, .2);
    }
    /* Solid dark: no blur, so it stays readable over busy pages. */
    :host([data-theme="dark"]) {
      --blur-panel: none;
      --ink: #f4f4f5;
      --glass: #1b1d23;
      --edge: rgba(255, 255, 255, .09);
      --blur: none;
      --drop: rgba(0, 0, 0, .45);
      --hover: #272a32;
      --hover-edge: rgba(255, 255, 255, .18);
    }
    /* Light, for pale pages and anyone who dislikes dark controls. */
    :host([data-theme="light"]) {
      --blur-panel: none;
      --ink: #1d2230;
      --glass: #ffffff;
      --edge: rgba(0, 0, 0, .1);
      --blur: none;
      --drop: rgba(15, 23, 42, .18);
      --hover: #eef1f6;
      --hover-edge: rgba(0, 0, 0, .18);
    }
    .bar {
      position: fixed;
      right: calc(var(--unit) * 1.4);
      bottom: calc(var(--unit) * 5);
      display: flex; flex-direction: column-reverse; align-items: center;
      gap: calc(var(--unit) * .8);
      font-family: system-ui, "Noto Sans Bengali", sans-serif;
      opacity: 0; pointer-events: none;
      /* visibility, not just opacity: a transparent button can still take
         keyboard focus and still be read by a screen reader. It flips after
         the fade on the way out and at once on the way in. */
      visibility: hidden;
      transition: opacity .25s ease, visibility 0s linear .25s;
    }
    .bar.on { opacity: 1; pointer-events: auto; visibility: visible; transition: opacity .25s ease; }

    button {
      all: unset; box-sizing: border-box; cursor: pointer;
      position: relative;
      display: grid; place-items: center;
      border-radius: 999px;
      background: var(--glass);
      border: 1px solid var(--edge);
      color: var(--ink);
      box-shadow: 0 calc(var(--unit) * .3) calc(var(--unit) * .9) var(--drop);
      backdrop-filter: var(--blur);
      -webkit-backdrop-filter: var(--blur);
      transition: background .18s ease, transform .22s var(--spring),
                  border-color .18s ease, opacity .25s ease;
      transform: scale(.4); opacity: 0;
    }
    .bar.on button { transform: scale(1); opacity: 1; }
    /* The small buttons fan out after the mic, which reads as one motion. */
    .bar.on .row:nth-of-type(2) button { transition-delay: .05s; }
    .bar.on .row:nth-of-type(3) button { transition-delay: .10s; }
    .bar.on .row:nth-of-type(4) button { transition-delay: .15s; }

    button:hover {
      background: var(--hover);
      border-color: var(--hover-edge);
      transform: scale(1.09);
    }
    button:active { transform: scale(.93); }
    button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 3px; }

    /* The min sizes are a floor, not decoration. Accessibility guidance
       puts the smallest safe pointer target at 24px and a comfortable one
       at 44px, and the "small" size preset used to scale these below that,
       which produced misclicks on exactly the hardware that needs them
       biggest. The floor wins over the preset. */
    .main {
      width: calc(var(--unit) * 3.5); height: calc(var(--unit) * 3.5);
      min-width: 48px; min-height: 48px;
      font-size: calc(var(--unit) * 1);
    }
    .small {
      width: calc(var(--unit) * 2.75); height: calc(var(--unit) * 2.75);
      min-width: 40px; min-height: 40px;
      font-size: calc(var(--unit) * .78);
      opacity: .82;
    }
    .small:hover { opacity: 1; }
    .en { font-size: calc(var(--unit) * .66); font-weight: 650; letter-spacing: .04em; }
    .row[hidden] { display: none; }
    /* Compact: only the mic and the toggle, until the toggle is pressed. */
    /* Only the collapsed state is written, so the open state is simply the
       bar's normal layout. Two competing rules here meant the open one had
       to out-rank the closed one, and that is a fight worth not having. */
    /* The buttons sit on a curve, not in a straight line. The column only
       sets how far apart they are; the sideways offset that bends them
       into an arc is written on each row by paintArc(), because it has to
       know which way there is room to bend. */
    .row { transition: transform .34s var(--spring); }
    .row:not([data-name="mic"]):not([data-name="toggle"]) {
      transition: opacity .18s ease, transform .34s var(--spring),
                  max-height .3s var(--spring),
                  margin-top .3s var(--spring), margin-bottom .3s var(--spring);
    }
    .bar.compact:not(.open) .row:not([data-name="mic"]):not([data-name="toggle"]) {
      max-height: 0; opacity: 0; pointer-events: none;
      margin-top: calc(var(--unit) * -.275);
      margin-bottom: calc(var(--unit) * -.275);
      /* They fold back into the microphone rather than just fading, so
         opening looks like the buttons coming out of it. */
      transform: translateY(calc(var(--unit) * 1.1)) scale(.4);
    }
    .bar.compact.open .row:nth-of-type(2) { transition-delay: .04s; }
    .bar.compact.open .row:nth-of-type(3) { transition-delay: .08s; }
    .bar.compact.open .row:nth-of-type(4) { transition-delay: .12s; }
    .bar.compact.open .row:nth-of-type(5) { transition-delay: .16s; }
    .bar.compact:not(.open) .row:not([data-name="mic"]):not([data-name="toggle"]) {
      overflow: hidden;   /* clip only while they are tucked away */
      visibility: hidden; /* and out of the tab order while they are */
    }
    .row:has(.noTip) .tip { display: none; }
    .toggle { opacity: .55; }
    .bar:hover .toggle { opacity: .9; }
    .grip { cursor: grab; opacity: .32; }
    .bar:hover .grip { opacity: .85; }
    .grip:active, .bar.dragging .grip { cursor: grabbing; opacity: 1; }
    .main { cursor: grab; }
    .bar.dragging .main { cursor: grabbing; }
    .bar.dragging, .bar.dragging button { transition: none; }

    /* Listening. The halo tracks how loud the voice actually is, so the
       button reacts to speech instead of pulsing on a fixed timer. */
    .main.live {
      --lvl: 0;
      background: linear-gradient(145deg, #ef4444, #b91c1c);
      border-color: rgba(255,255,255,.28);
      color: #fff;
      box-shadow:
        0 0 0 calc(var(--unit) * .18 * var(--lvl)) rgba(239,68,68,.34),
        0 0 calc(var(--unit) * (.6 + 1.5 * var(--lvl))) rgba(239,68,68,.55);
      transform: scale(calc(1 + .06 * var(--lvl)));
      transition: box-shadow .09s linear, transform .09s linear;
    }
    .main.live::before {
      content: ''; position: absolute;
      width: 100%; height: 100%; border-radius: 999px;
      border: 2px solid rgba(239, 68, 68, .5);
      transform: scale(calc(1 + .55 * var(--lvl)));
      opacity: calc(.15 + .6 * var(--lvl));
      transition: transform .12s ease-out, opacity .12s ease-out;
    }
    /* A slow breath so it still looks alive during silence. */
    .main.live::after {
      content: ''; position: absolute;
      width: 100%; height: 100%; border-radius: 999px;
      border: 2px solid rgba(239, 68, 68, .4);
      animation: ring 2.4s cubic-bezier(.25,.6,.3,1) infinite;
    }
    @keyframes ring {
      0%   { transform: scale(1);    opacity: .6; }
      100% { transform: scale(1.95); opacity: 0; }
    }

    .bar.dragging { transition: none; }
    .bar.dragging button { cursor: grabbing; }

    /* First-run coach mark. */
    .coach {
      position: fixed;
      max-width: min(30rem, 48vw);
      padding: calc(var(--unit) * 1) calc(var(--unit) * 1.2);
      border-radius: calc(var(--unit) * 1.1);
      background: rgba(37, 99, 235, .95);
      color: #fff;
      font-size: calc(var(--unit) * .92);
      line-height: 1.6;
      box-shadow: 0 calc(var(--unit) * .5) calc(var(--unit) * 1.4) rgba(0,0,0,.4);
      opacity: 0; transform: translateY(calc(var(--unit) * .6));
      transition: opacity .3s ease, transform .35s var(--spring);
      pointer-events: auto;
    }
    .coach.on { opacity: 1; transform: none; }
    .coach b { display: block; margin-bottom: .35em; font-size: 1.05em; }
    /* The offer to remember a correction. Like the welcome card, it sits
       above the control and takes clicks; it shows only after the user has
       fixed a word Ukti wrote. */
    .teach {
      position: fixed;
      max-width: min(26rem, 70vw);
      padding: calc(var(--unit) * .75) calc(var(--unit) * .95);
      border-radius: calc(var(--unit) * 1.1);
      background: var(--glass); color: var(--ink);
      border: 1px solid var(--edge);
      box-shadow: 0 calc(var(--unit) * .4) calc(var(--unit) * 1.2) var(--drop);
      font-family: system-ui, "Noto Sans Bengali", sans-serif;
      font-size: calc(var(--unit) * .86); line-height: 1.5;
      opacity: 0; transform: translateY(calc(var(--unit) * .5));
      transition: opacity .22s ease, transform .28s var(--spring);
      pointer-events: none; visibility: hidden;
    }
    .teach.on { opacity: 1; transform: none; pointer-events: auto; visibility: visible; }
    .teach .acts { display: flex; gap: .5em; margin-top: .6em; flex-wrap: wrap; }
    .teach button {
      all: unset; cursor: pointer; position: relative;
      padding: .35em 1em; border-radius: 999px; font-size: .92em;
      transform: none; opacity: 1;
    }
    .teach button::before { content: ''; position: absolute; inset: -5px -4px; }
    .teach button.yes { background: #2563eb; color: #fff; }
    .teach button.no { border: 1px solid var(--edge); color: var(--ink); }
    .teach button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }

    .coach button {
      all: unset; cursor: pointer; margin-top: .7em;
      padding: .35em 1em; border-radius: 999px;
      /* A darker chip, not a lighter one: white on the lightened blue was
         3.37:1, under the 4.5 body text needs. */
      background: rgba(0,0,0,.22); font-size: .92em;
      transform: none; opacity: 1;
      position: relative;
    }
    /* 32px tall; a finger needs 40. The hit area grows, the chip does not. */
    .coach button::before { content: ''; position: absolute; inset: -5px -4px; }
    .coach button:hover { background: rgba(0,0,0,.32); transform: none; }
    .coach button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

    /* Live preview of what is being said, above the buttons. The frame
       holds the place, the colour and the ring; .scroll holds the text. */
    .preview {
      position: fixed;
      right: calc(var(--unit) * 1.4);
      bottom: calc(var(--unit) * 9.2); /* replaced at runtime by placePreview */
      width: min(34rem, 42vw);
      border-radius: calc(var(--unit) * 1.1);
      background: var(--glass);
      border: 1px solid var(--edge);
      color: var(--ink);
      font-size: calc(var(--unit) * 1.02);
      line-height: 1.65;
      box-shadow: 0 calc(var(--unit) * .4) calc(var(--unit) * 1.2) var(--drop);
      opacity: 0; transform: translateY(calc(var(--unit) * .7)) scale(.98);
      transition: opacity .25s ease, transform .45s var(--spring-soft),
                  box-shadow .3s ease;
      pointer-events: none;
      --lvl: 0;
    }
    .preview .scroll {
      max-height: calc(var(--unit) * 11);
      overflow-y: auto;
      padding: calc(var(--unit) * .85) calc(var(--unit) * 1.1);
      scrollbar-width: thin;
      text-wrap: pretty;
      overflow-wrap: anywhere;
    }
    .preview.on {
      backdrop-filter: var(--blur-panel);
      -webkit-backdrop-filter: var(--blur-panel); opacity: 1; transform: none;
      box-shadow: 0 calc(var(--unit) * .4) calc(var(--unit) * 1.2) var(--drop),
                  0 0 calc(var(--unit) * (.6 + var(--lvl) * 1.6)) rgba(124, 108, 240, calc(.12 + var(--lvl) * .3));
    }
    /* The listening ring: a conic gradient whose angle turns, masked down
       to a thin line on the frame's edge. It brightens with the voice.
       Only while the panel is open; nothing runs at idle. */
    .preview::before {
      content: ''; position: absolute; inset: -1px; border-radius: inherit;
      padding: 1.5px; pointer-events: none;
      background: conic-gradient(from var(--ukti-glow-angle),
        #7c6cf0, #4aa8ff, #34d3c3, #f472b6, #7c6cf0);
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
      opacity: 0;
      transition: opacity .3s ease;
    }
    .preview.on::before {
      opacity: calc(.55 + var(--lvl) * .45);
      animation: glow-turn 3.2s linear infinite;
    }
    @keyframes glow-turn { to { --ukti-glow-angle: 360deg; } }

    .preview .hint {
      color: var(--ink); opacity: .55; font-style: normal;
      animation: hint-breathe 2.4s ease-in-out infinite;
    }
    .preview .hint[hidden] { display: none; }
    @keyframes hint-breathe { 0%, 100% { opacity: .4 } 50% { opacity: .72 } }

    .preview .done { opacity: .62; }
    .preview .seg { display: inline; animation: settle .7s ease-out both; }
    .preview .seg:last-child { margin-right: .22em; }
    /* A finished sentence arrives at full brightness and cools to the
       finished colour, so the eye can tell what was just written. */
    @keyframes settle {
      from { opacity: 1; filter: brightness(1.25); text-shadow: 0 0 .6em rgba(124, 108, 240, .55); }
      to   { opacity: 1; filter: none; text-shadow: none; }
    }
    .preview .live { opacity: .97; }
    .preview w {
      display: inline-block;
      margin-right: .22em;
      animation: rise .5s var(--spring-soft) both;
    }
    /* Words still being guessed carry a slow light across them. Only with
       motion allowed: the text is transparent inside the gradient, so it
       must never apply when the animation would not run. */
    @media (prefers-reduced-motion: no-preference) {
      .preview .live w {
        background: linear-gradient(100deg, var(--ink) 0 40%, #b9b0ff 50%, var(--ink) 60% 100%)
          0 0 / 250% 100%;
        -webkit-background-clip: text; background-clip: text;
        color: transparent;
        animation: rise .5s var(--spring-soft) both, shimmer 2.2s linear .5s infinite;
      }
    }
    @keyframes shimmer { from { background-position: 100% 0 } to { background-position: -150% 0 } }
    @keyframes rise {
      from { opacity: 0; transform: translateY(.45em) scale(.94); filter: blur(6px); }
      to   { opacity: 1; transform: none; filter: blur(0); }
    }
    .caret {
      display: inline-block; width: .09em; height: 1.05em;
      background: #f87171; vertical-align: text-bottom;
      border-radius: 1px;
      animation: caret 1.1s steps(1) infinite;
    }
    .fly {
      position: fixed; z-index: 2; pointer-events: none;
      max-width: 22em; white-space: nowrap; overflow: hidden; text-overflow: clip;
      padding: .1em .5em; border-radius: .6em;
      font: 500 calc(var(--unit) * 1.02) / 1.5 inherit;
      color: #fff; background: linear-gradient(120deg, #7c6cf0, #4aa8ff);
      box-shadow: 0 .3em 1em rgba(124, 108, 240, .45);
      will-change: transform, opacity;
    }
    @keyframes caret { 0%,50% { opacity: 1 } 50.01%,100% { opacity: 0 } }

    /* Label chips that explain each button. */
    .row { position: relative; display: flex; align-items: center; }
    .tip {
      position: absolute;
      right: calc(100% + var(--unit) * .5);
      top: 50%;
      margin-top: calc(var(--unit) * -.85);
      white-space: nowrap;
      padding: calc(var(--unit) * .3) calc(var(--unit) * .65);
      border-radius: calc(var(--unit) * .8);
      background: var(--glass);
      border: 1px solid var(--edge);
      color: var(--ink);
      font-size: calc(var(--unit) * .74);
      box-shadow: 0 calc(var(--unit) * .2) calc(var(--unit) * .6) var(--drop);
      backdrop-filter: var(--blur);
      -webkit-backdrop-filter: var(--blur);
      opacity: 0; transform: translateX(calc(var(--unit) * .5));
      transition: opacity .2s ease, transform .26s var(--spring);
      pointer-events: none;
    }
    .tip b { font-weight: 600; }
    .tip span {
      /* .6 left the shortcut at 4.27:1 on the light theme; .7 passes there
         and still reads as secondary to the label beside it. */
      opacity: .7; margin-left: .45em;
      font-family: ui-monospace, monospace; font-size: .92em;
    }
    .bar.hints .tip,
    .row:hover .tip,
    .row:focus-within .tip { opacity: 1; transform: none; }
    .bar.on.hints .row:nth-of-type(1) .tip { transition-delay: .10s; }
    .bar.on.hints .row:nth-of-type(2) .tip { transition-delay: .16s; }
    .bar.on.hints .row:nth-of-type(3) .tip { transition-delay: .22s; }
    .bar.on.hints .row:nth-of-type(4) .tip { transition-delay: .28s; }

    .toast {
      position: fixed;
      right: calc(var(--unit) * 1.4);
      bottom: calc(var(--unit) * 1.6);
      max-width: min(46ch, 76vw);
      padding: calc(var(--unit) * .6) calc(var(--unit) * 1.05);
      border-radius: calc(var(--unit) * 1.2);
      background: var(--glass);
      border: 1px solid var(--edge);
      color: var(--ink);
      font-size: calc(var(--unit) * .88);
      line-height: 1.5;
      box-shadow: 0 calc(var(--unit) * .3) calc(var(--unit) * .9) var(--drop);
      backdrop-filter: var(--blur);
      -webkit-backdrop-filter: var(--blur);
      opacity: 0; transform: translateY(calc(var(--unit) * .5)) scale(.97);
      transition: opacity .22s ease, transform .28s var(--spring);
      pointer-events: none;
      /* These used to be one clipped line, so the sentence that tells the
         user what to do next was cut off at an ellipsis and the advice
         never arrived. A message is worth more than a tidy single line. */
      white-space: normal;
      overflow-wrap: break-word;
    }
    .toast.on { opacity: 1; transform: none; }
    /* Entering, the small panels rise on the sampled spring and come out
       of a light blur. Only on the way in, and only for that moment: no
       panel keeps a filter while it sits on screen. */
    .toast.on, .coach.on, .teach.on {
      transition-duration: .22s, .5s;
      transition-timing-function: ease, var(--spring-soft);
      animation: unblur .35s ease-out;
    }
    @keyframes unblur { from { filter: blur(5px); } }
    .toast.err  { background: rgba(185, 28, 28, .95); color: #fff; }
    .toast.busy { background: rgba(180, 83, 9, .95); color: #fff; }

    /* Three dots that march while the engine is hearing speech. */
    .dots { display: inline-flex; gap: .22em; margin-left: .45em; vertical-align: middle; }
    .dots i {
      width: .3em; height: .3em; border-radius: 999px;
      background: currentColor; opacity: .35;
      animation: blink 1.3s ease-in-out infinite;
    }
    .dots i:nth-child(2) { animation-delay: .18s; }
    .dots i:nth-child(3) { animation-delay: .36s; }
    @keyframes blink {
      0%, 60%, 100% { opacity: .3;  transform: translateY(0); }
      30%           { opacity: 1;   transform: translateY(-.16em); }
    }

    /* ---- Feedback motion (MOTION.md). Event-driven, short, transform and
       opacity only, and gone when done: nothing here runs at idle. Each
       effect is a fixed element over its target, so the buttons' own
       transforms and contents are never touched. */
    .ripple, .pulse, .burst, .landed {
      position: fixed; pointer-events: none; box-sizing: border-box;
    }
    .ripple { border-radius: 999px; overflow: hidden; }
    .ripple i {
      position: absolute; border-radius: 50%;
      background: rgba(255, 255, 255, .34);
      transform: scale(0); opacity: 1;
      animation: ripple .46s cubic-bezier(.2, 0, 0, 1) forwards;
    }
    :host([data-theme="light"]) .ripple i { background: rgba(29, 34, 48, .14); }
    @keyframes ripple { to { transform: scale(1); opacity: 0; } }

    /* A success: a green ring leaves the button. */
    .pulse {
      border-radius: 999px; border: 2px solid rgba(52, 211, 153, .85);
      animation: pulse .52s cubic-bezier(.2, 0, 0, 1) forwards;
    }
    @keyframes pulse { from { transform: scale(1); opacity: .9; } to { transform: scale(1.5); opacity: 0; } }

    /* Listening has begun: one red ring, then the live halo takes over. */
    .burst {
      border-radius: 999px; border: 2px solid rgba(239, 68, 68, .75);
      animation: burst .6s cubic-bezier(.2, 0, 0, 1) forwards;
    }
    @keyframes burst { from { transform: scale(1); opacity: .9; } to { transform: scale(1.9); opacity: 0; } }

    /* Where the words landed: a brief glow on the box itself. */
    .landed {
      border: 2px solid rgba(96, 165, 250, .9);
      box-shadow: 0 0 0 4px rgba(96, 165, 250, .22);
      animation: landed .75s ease-out forwards;
    }
    @keyframes landed {
      0% { opacity: 0; transform: scale(1.015); }
      25% { opacity: 1; transform: scale(1); }
      100% { opacity: 0; transform: scale(1); }
    }

    /* A refusal: a short, sharp shake. The red toast says why. */
    .bar.on button.shake { animation: shake .32s cubic-bezier(.36, .07, .19, .97) both; }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-5px); }
      40% { transform: translateX(5px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(3px); }
    }

    /* Depth: the mic leans toward the pointer while hovered, and a soft
       highlight follows it. At rest nothing differs. */
    .bar.on .main:not(.live):hover {
      transform: perspective(240px) rotateX(calc(var(--rx, 0) * 1deg)) rotateY(calc(var(--ry, 0) * 1deg));
    }
    .bar.dragging .main { transform: none !important; }
    .main:not(.live)::before {
      content: ''; position: absolute; inset: 0; border-radius: 999px; pointer-events: none;
      background: radial-gradient(circle at var(--mx, 50%) var(--my, 30%), rgba(255, 255, 255, .2), transparent 62%);
      opacity: 0; transition: opacity .2s ease;
    }
    .main:not(.live):hover::before { opacity: 1; }

    @media (prefers-reduced-motion: reduce) {
      /* Everything, not a chosen few: the rows, the tips, the preview and
         the listening halo all moved before, measured. */
      *, *::before, *::after {
        transition-duration: .01ms !important;
        transition-delay: 0s !important;
        animation: none !important;
      }
    }
  `;

  let suppressClick = false;

  function row(button, label, keys, name) {
    const wrap = document.createElement('div');
    wrap.className = 'row';
    if (name) wrap.dataset.name = name;
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.innerHTML = '<b></b><span></span>';
    tip.querySelector('b').textContent = label;
    tip.querySelector('span').textContent = keys;
    wrap.append(button, tip);
    return wrap;
  }

  function makeButton(html, title, cls, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = cls;
    button.innerHTML = html;
    button.title = title;
    button.setAttribute('aria-label', title);
    // Keep focus in the text box: a blur would lose the insertion target.
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      // The shadow root is open, so page script can call button.click().
      // That is not the user, and the mic button must not obey it.
      if (!event.isTrusted) return;
      if (suppressClick) return;
      acted = { button, at: Date.now() };
      ripple(button, event);
      onClick();
    });
    return button;
  }

  // ------------------------------------------------ learning from corrections
  // After dictation, Ukti watches the one box it just wrote into, for two
  // minutes, and compares that box's text with what it wrote. If the user
  // replaced one to three of Ukti's own words with others, it offers once,
  // in one click, to remember the correction. Nothing else is watched:
  // not the user's own typing, not other boxes, not other pages. Nothing is
  // stored unless the user says yes, and it is stored only in the same
  // local list as the user's own word fixes, where it can be seen, changed
  // and deleted. Nothing leaves the machine.
  const WATCH_MS = 120000;
  const WATCH_EVENTS = ['input', 'beforeinput', 'compositionend'];
  const SETTLE_MS = 1200;
  let watching = null;
  const declined = new Set();     // pairs the user said no to, on this page
  const words = text => text.split(/\s+/).filter(Boolean);
  const bare = w => w.replace(/^[,।?!.;:"'()\[\]]+|[,।?!.;:"'()\[\]]+$/g, '');

  function stopWatching() {
    if (!watching) return;
    clearTimeout(watching.timer);
    for (const type of WATCH_EVENTS) watching.box.removeEventListener(type, watching.onInput);
    watching = null;
  }

  function watchInsert(box, before) {
    // One dictation can insert several segments into the same box; they all
    // count as Ukti's words, measured from the text before the first one.
    const base = watching && watching.box === box && Date.now() < watching.until ? watching.base : before;
    stopWatching();
    if (!box.isConnected) return;
    // The snapshot of what Ukti wrote is taken at once, so the user's first
    // keystrokes can never be mistaken for Ukti's words. An editor that
    // settles a moment later (re-rendering from its own model) is allowed
    // for by taking it again at 120 ms, but only if nothing was typed since.
    const snap = () => {
      const wrote = words(existingText(box));
      const was = words(base);
      let p = 0;
      while (p < was.length && p < wrote.length && was[p] === wrote[p]) p++;
      let q = 0;
      while (q < was.length - p && q < wrote.length - p && was[was.length - 1 - q] === wrote[wrote.length - 1 - q]) q++;
      return { wrote, range: [p, wrote.length - q] };     // Ukti's words, as indexes into `wrote`
    };
    const first = snap();
    if (first.range[1] <= first.range[0]) return;
    const w = { box, base, ...first, until: Date.now() + WATCH_MS, timer: 0, typed: false };
    w.onInput = () => {
      w.typed = true;
      clearTimeout(w.timer);
      w.timer = setTimeout(() => checkCorrection(w), SETTLE_MS);
    };
    // Editors that own their model (Lexical, as on WhatsApp) take every
    // keystroke at beforeinput and update the page themselves, so no input
    // event ever fires there. Listening to both, on this one box only.
    for (const type of WATCH_EVENTS) box.addEventListener(type, w.onInput);
    watching = w;
    setTimeout(() => {
      if (watching !== w || w.typed || !box.isConnected) return;
      const later = snap();
      if (later.range[1] > later.range[0]) Object.assign(w, later);
    }, 120);
  }

  function checkCorrection(w) {
    if (watching !== w) return;
    if (Date.now() > w.until || !w.box.isConnected) { stopWatching(); return; }
    const now = words(existingText(w.box));
    const was = w.wrote;
    let p = 0;
    while (p < was.length && p < now.length && was[p] === now[p]) p++;
    let q = 0;
    while (q < was.length - p && q < now.length - p && was[was.length - 1 - q] === now[now.length - 1 - q]) q++;
    const gone = was.slice(p, was.length - q);
    const came = now.slice(p, now.length - q);
    // A correction swaps words for words. A pure deletion or insertion is
    // not one, and a rewrite of more than three words is not a word fix.
    if (!gone.length || !came.length || gone.length > 3 || came.length > 3) return;
    // Only Ukti's own words count.
    if (p < w.range[0] || was.length - q > w.range[1]) return;
    const from = gone.map(bare).join(' ').trim();
    const to = came.map(bare).join(' ').trim();
    if (!from || !to || from === to) return;
    if (declined.has(from + '\u0000' + to)) return;
    offerToRemember(from, to);
  }

  let teachCard = null;
  let teachTimer = 0;
  function offerToRemember(from, to) {
    if (isOff()) return;
    buildBar();
    if (!teachCard) {
      teachCard = document.createElement('div');
      teachCard.className = 'teach';
      teachCard.setAttribute('role', 'group');
      teachCard.setAttribute('aria-live', 'polite');
      const msg = document.createElement('span');
      msg.className = 'msg';
      const acts = document.createElement('div');
      acts.className = 'acts';
      const yes = makeButton('', '', 'yes', () => answer(true));
      const no = makeButton('', '', 'no', () => answer(false));
      acts.append(yes, no);
      teachCard.append(msg, acts);
      shadow.appendChild(teachCard);
    }
    teachCard.dataset.from = from;
    teachCard.dataset.to = to;
    teachCard.querySelector('.msg').textContent = t('teachAsk', from, to);
    for (const [cls, key] of [['yes', 'teachYes'], ['no', 'teachNo']]) {
      const b = teachCard.querySelector('button.' + cls);
      b.textContent = t(key);
      b.title = t(key);
      b.setAttribute('aria-label', t(key));
    }
    const r = bar.getBoundingClientRect();
    teachCard.style.right = Math.round(window.innerWidth - r.right) + 'px';
    teachCard.style.bottom = Math.round(window.innerHeight - r.top + 14) + 'px';
    teachCard.classList.add('on');
    clearTimeout(teachTimer);
    teachTimer = setTimeout(() => teachCard?.classList.remove('on'), 15000);
  }

  async function answer(remember) {
    if (!teachCard) return;
    const from = teachCard.dataset.from, to = teachCard.dataset.to;
    teachCard.classList.remove('on');
    clearTimeout(teachTimer);
    if (!remember) { declined.add(from + '\u0000' + to); return; }
    try {
      const { replacements = [] } = await chrome.storage.local.get({ replacements: [] });
      // The same heard word is corrected once: a new answer replaces the old.
      const next = replacements.filter(r => r && r.from !== from);
      next.push({ from, to });
      await chrome.storage.local.set({ replacements: next });
      declined.add(from + '\u0000' + to);    // do not ask about it again
      showIndicator(t('remembered'));
      hideIndicator(3500);
    } catch (_) {}
  }

  // ---------------------------------------------------------- feedback fx
  // See MOTION.md. None of these run under prefers-reduced-motion, where the
  // toast and the colours carry the meaning on their own.

  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let acted = null;   // the button the user last pressed, for its feedback

  // The button an outcome belongs to: the one just pressed, else the one
  // named, else the mic, so a shortcut used while collapsed still answers.
  function feedbackButton(named) {
    const shown = b => b && b.getBoundingClientRect().width > 0 &&
      getComputedStyle(b.closest('.row') || b).visibility === 'visible';
    if (acted && Date.now() - acted.at < 8000 && shown(acted.button)) return acted.button;
    if (shown(named)) return named;
    return shown(micButton) ? micButton : null;
  }

  // A short-lived element laid over `rect`, removed when its animation ends.
  function overlay(cls, rect, ms, fill) {
    if (calm() || !shadow || !rect || !rect.width) return null;
    const el = document.createElement('div');
    el.className = cls;
    el.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
    fill?.(el);
    shadow.appendChild(el);
    const gone = () => el.remove();
    el.addEventListener('animationend', gone, { once: true });
    setTimeout(gone, ms + 250);
    return el;
  }

  function ripple(button, event) {
    const r = button.getBoundingClientRect();
    overlay('ripple', r, 460, el => {
      const dot = document.createElement('i');
      // From the press point; a keyboard press has no point, so the centre.
      const x = event.clientX ? event.clientX - r.left : r.width / 2;
      const y = event.clientY ? event.clientY - r.top : r.height / 2;
      const size = 2 * Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
      dot.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px`;
      el.append(dot);
      dot.addEventListener('animationend', () => el.remove(), { once: true });
    });
  }

  function pulse(button) {
    if (button) overlay('pulse', button.getBoundingClientRect(), 520);
  }

  function landed(box) {
    if (!box?.isConnected) return;
    overlay('landed', box.getBoundingClientRect(), 750, el => {
      el.style.borderRadius = getComputedStyle(box).borderRadius;
    });
  }

  function shake(button) {
    if (!button || calm()) return;
    button.classList.remove('shake');
    void button.offsetWidth;            // restart if it is already shaking
    button.classList.add('shake');
    button.addEventListener('animationend', () => button.classList.remove('shake'), { once: true });
  }

  // A success: the box glows where the words went, the button answers.
  function succeeded(box, named) {
    landed(box);
    pulse(feedbackButton(named));
    acted = null;
  }

  // The mic leans toward the pointer while hovered. Only while hovered, so
  // nothing runs at idle, and never under reduced motion.
  function tilt(button) {
    let frame = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      for (const [k, v] of [['--rx', '0'], ['--ry', '0'], ['--mx', '50%'], ['--my', '30%']]) button.style.setProperty(k, v);
    };
    button.addEventListener('pointermove', event => {
      if (calm() || listening || bar.classList.contains('dragging')) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = button.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width)) - 0.5;
        const y = Math.min(1, Math.max(0, (event.clientY - r.top) / r.height)) - 0.5;
        button.style.setProperty('--ry', (x * 16).toFixed(2));     // at most 8 degrees
        button.style.setProperty('--rx', (-y * 16).toFixed(2));
        button.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(0) + '%');
        button.style.setProperty('--my', ((y + 0.5) * 100).toFixed(0) + '%');
      });
    });
    button.addEventListener('pointerleave', reset);
    reset();
  }

  function buildBar() {
    if (bar) return;

    const host = document.createElement('div');
    hostEl = host;
    // So a screen reader pronounces the labels in the right language.
    host.setAttribute('lang', settings.uiLang === 'en' ? 'en' : 'bn');
    host.setAttribute('data-ukti', 'bar');
    // No contain:layout here. It would make this host the containing block
    // for the fixed-position bar and panels inside, so their right/bottom
    // offsets would stop meaning "from the window edge".
    host.style.cssText =
      'position:fixed;top:0;left:0;z-index:2147483646;pointer-events:none';
    shadow = host.attachShadow({ mode: 'open' });

    // @property is ignored inside a shadow root, and the ring's angle has to
    // be a typed <angle> to turn smoothly instead of jumping. Registering it
    // on the document is the only way; the name is prefixed so no page
    // property can collide, and a second frame or reload finds it taken.
    try {
      CSS.registerProperty({ name: '--ukti-glow-angle', syntax: '<angle>', inherits: false, initialValue: '0deg' });
    } catch (_) {}

    const style = document.createElement('style');
    style.textContent = STYLE;

    bar = document.createElement('div');
    bar.className = 'bar';

    micButton = makeButton(ICONS.mic, t('startSpeak'), 'main', () => {
      toggleDictation();
    });
    micButton.setAttribute('aria-pressed', 'false');
    tilt(micButton);
    const banglish = makeButton('অ', t('toBangla'), 'small', convertBanglish);
    const english = makeButton('EN', t('toEnglish'), 'small en', convertToEnglish);
    const undo = makeButton(ICONS.undo, t('undo'), 'small', undoLast);
    banglishButton = banglish; englishButton = english; undoButton = undo;

    const grip = makeButton(ICONS.grip, t('move'), 'small grip', () => {});
    // Dragging is a pointer gesture with no keyboard meaning; the popup's
    // "where it sits" setting is the keyboard way to move the control. A
    // focusable button that does nothing is worse than none.
    grip.tabIndex = -1;
    grip.setAttribute('aria-hidden', 'true');
    const toggle = makeButton(ICONS.more, t('more'), 'small toggle noTip', () => {
      expanded = !expanded;
      paintLayout();
    });

    bar.append(
      row(micButton, t('speak'), '', 'mic'),
      row(banglish, t('toBangla'), '', 'banglish'),
      row(english, t('toEnglish'), '', 'english'),
      row(undo, t('undo'), '', 'undo'),
      row(grip, t('move'), '', 'grip'),
      row(toggle, '', '', 'toggle')
    );

    // Both work: the handle is the obvious one, the microphone is the
    // shortcut for anyone who finds it.
    bar.addEventListener('pointerenter', () => { pointerOnBar = true; });
    bar.addEventListener('pointerleave', () => { pointerOnBar = false; scheduleHide(); });
    makeDraggable(grip);
    makeDraggable(micButton);

    preview = document.createElement('div');
    preview.className = 'preview';
    preview.setAttribute('data-ukti-preview', '');
    // The words change many times a second while speaking, and they end up
    // in the box anyway. Announcing every interim guess would drown a
    // screen reader user.
    preview.setAttribute('aria-hidden', 'true');

    shadow.append(style, preview, bar);
    (document.body || document.documentElement).appendChild(host);

    applyScale();
    applyTheme();
    applyPosition();
    paintLayout();
    paintHints();
    loadShortcuts();
    window.addEventListener('resize', () => {
      applyScale();
      // A smaller window can strand a saved position off the edge, and the
      // anchor needs recomputing against the box's new rect.
      applyPosition();
      placePreview();
      paintArc();
    }, { passive: true });
  }

  // Keep the whole bar on screen. A position saved on a wide monitor would
  // otherwise sit off the edge in a narrow window, where it cannot be
  // reached or dragged back.
  function clampToViewport(right, bottom) {
    const rect = bar.getBoundingClientRect();
    const w = rect.width || 60;
    const h = rect.height || 60;
    return {
      right: Math.max(4, Math.min(right, window.innerWidth - w - 4)),
      bottom: Math.max(4, Math.min(bottom, window.innerHeight - h - 4))
    };
  }

  // The bottom-right corner of a page is the most crowded real estate on
  // the web: Gmail's compose row, WhatsApp's send button, Intercom's chat
  // bubble, the reCAPTCHA badge and Grammarly's icon all live there. So
  // when the user has not chosen a spot, sit next to the box being typed
  // in instead, which is both out of the way and easier to connect to the
  // text it acts on.
  const ANCHOR_GAP = 8;
  let anchored = null;

  function anchorToField(box) {
    if (!bar || settings.barPos) return false;   // a dragged spot always wins
    if ((settings.barCorner || 'auto') !== 'auto') return false;
    if (!box || !box.isConnected) return false;

    const field = box.getBoundingClientRect();
    if (!field.width || !field.height) return false;

    // A full-page editor (Docs, a chat canvas) gives a rect the size of the
    // window. Anchoring to that is meaningless, so fall back to the corner.
    if (field.height > window.innerHeight * 0.6) return false;

    const self = bar.getBoundingClientRect();
    const w = self.width || 60;
    const h = self.height || 60;

    const right = window.innerWidth - field.right;
    let bottom = window.innerHeight - field.bottom + field.height + ANCHOR_GAP;

    // No room above the box? Drop below it.
    if (bottom + h > window.innerHeight - 4) {
      bottom = window.innerHeight - field.top + ANCHOR_GAP;
    }
    // Still no room, or the box fills the screen: let the corner have it.
    if (bottom + h > window.innerHeight - 4 || right + w > window.innerWidth - 4) {
      return false;
    }

    const safe = clampToViewport(right, bottom);
    bar.style.right = safe.right + 'px';
    bar.style.bottom = safe.bottom + 'px';
    anchored = box;
    placePreview();
    return true;
  }

  // Dragging writes right/bottom offsets in pixels, which then win over
  // both the anchor and the stylesheet's scaled defaults.
  function applyPosition() {
    if (!bar) return;

    if (settings.barPos) {
      const safe = clampToViewport(settings.barPos.right, settings.barPos.bottom);
      bar.style.right = safe.right + 'px';
      bar.style.bottom = safe.bottom + 'px';
      anchored = null;
      placePreview();
      return;
    }

    // Clear the inline styles so the stylesheet's corner applies again.
    bar.style.right = '';
    bar.style.bottom = '';
    anchored = null;

    const corner = settings.barCorner || 'auto';

    // Bottom-left is the escape hatch for the sites where bottom-right is
    // hopeless, and it is set from the popup, so the control can always be
    // moved without dragging it.
    if (corner === 'bl') {
      const w = bar.getBoundingClientRect().width || 60;
      bar.style.right = Math.max(4, window.innerWidth - w - 22) + 'px';
      placePreview();
      return;
    }
    if (corner === 'br') {
      placePreview();
      return;
    }

    if (!anchorToField(resolveTarget())) placePreview();
  }

  // The mic button doubles as the drag handle. A press that moves more
  // than a few pixels is a drag; anything else stays a plain click, so
  // there is no extra chrome hanging off the control.
  const DRAG_THRESHOLD = 5;

  function makeDraggable(handle) {
    let startX = 0, startY = 0, startRight = 0, startBottom = 0;
    let dragging = false;

    const onMove = event => {
      if (!dragging) {
        if (
          Math.abs(event.clientX - startX) < DRAG_THRESHOLD &&
          Math.abs(event.clientY - startY) < DRAG_THRESHOLD
        ) return;
        dragging = true;
        bar.classList.add('dragging');
      }
      const right = startRight - (event.clientX - startX);
      const bottom = startBottom - (event.clientY - startY);
      bar.style.right =
        Math.max(4, Math.min(right, window.innerWidth - 70)) + 'px';
      bar.style.bottom =
        Math.max(4, Math.min(bottom, window.innerHeight - 70)) + 'px';
      placePreview();
    };

    const onUp = event => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      if (!dragging) return;

      // Swallow the click that would otherwise follow the drag.
      event.preventDefault();
      event.stopPropagation();
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);

      bar.classList.remove('dragging');
      dragging = false;
      const rect = bar.getBoundingClientRect();
      save({
        barPos: {
          right: Math.round(window.innerWidth - rect.right),
          bottom: Math.round(window.innerHeight - rect.bottom)
        }
      });
    };

    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isTrusted) return;
      const rect = bar.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startRight = window.innerWidth - rect.right;
      startBottom = window.innerHeight - rect.bottom;
      dragging = false;
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
      // A cancelled drag (a touch turned into a scroll, a context menu)
      // never sends pointerup, which left the control following the pointer.
      document.addEventListener('pointercancel', onUp, true);
    });
  }

  // Which optional buttons the user wants, and whether they live behind a
  // single toggle instead of being on screen all the time.
  let expanded = false;

  function paintLayout() {
    if (!bar) return;
    const want = settings.buttons || {};
    const compact = settings.layout === 'compact';

    bar.classList.toggle('compact', compact);
    bar.classList.toggle('open', expanded);
    requestAnimationFrame(paintArc);

    for (const row of bar.querySelectorAll('.row')) {
      const name = row.dataset.name;
      if (name === 'mic' || name === 'toggle') continue;
      row.hidden = want[name] === false;
    }

    const toggleRow = bar.querySelector('[data-name="toggle"]');
    if (toggleRow) {
      // The toggle is pointless if nothing is hidden behind it.
      const hasAny = ['banglish', 'english', 'undo', 'grip']
        .some(n => want[n] !== false);
      toggleRow.hidden = !compact || !hasAny;
      const button = toggleRow.querySelector('button');
      button.innerHTML = expanded ? ICONS.less : ICONS.more;
      button.title = expanded ? t('less') : t('more');
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-expanded', String(expanded));
    }

    requestAnimationFrame(placePreview);
  }

  // Labels are built once, so switching language has to rewrite them in
  // place rather than waiting for a page reload.
  // [string key, command name]. The keys shown come from chrome.commands.
  const LABELS = {
    mic: ['speak', 'toggle-dictation'],
    banglish: ['toBangla', 'to-bangla'],
    english: ['toEnglish', 'to-english'],
    undo: ['undo', 'undo'],
    grip: ['move', ''],
    toggle: [null, '']
  };

  function paintLabels() {
    if (!bar) return;
    for (const row of bar.querySelectorAll('.row')) {
      const entry = LABELS[row.dataset.name];
      if (!entry) continue;
      const [key, name] = entry;
      if (!key) continue;
      const text = t(key);
      row.querySelector('.tip b').textContent = text;
      row.querySelector('.tip span').textContent = (name && shortcuts[name]) || '';
      const button = row.querySelector('button');
      button.title = text;
      button.setAttribute('aria-label', text);
    }
    if (micButton) {
      micButton.title = listening ? t('stopSpeak') : t('startSpeak');
      micButton.setAttribute('aria-label', micButton.title);
    }
    if (hostEl) hostEl.setAttribute('lang', settings.uiLang === 'en' ? 'en' : 'bn');
  }

  // Labels stay until the user turns them off in the popup. They used to
  // vanish after six uses, which was a bad idea: six uses of one button
  // teaches nothing about the other three, and anyone coming back after a
  // few weeks found a row of unexplained circles.
  // The buttons follow a quarter-circle sweeping away from the microphone
  // rather than standing in a straight tower. The offset is written here
  // and not in the stylesheet because the direction depends on which side
  // of the window the control is sitting on, and the collapsed state must
  // flatten the curve so the arrow sits squarely on the microphone's head.
  function paintArc() {
    if (!bar) return;

    const rows = [...bar.querySelectorAll('.row')].filter(r => !r.hidden);
    const n = rows.length;
    if (n < 2) return;

    const unit = parseFloat(getComputedStyle(bar).getPropertyValue('--unit')) || 16;
    const open = !bar.classList.contains('compact') || bar.classList.contains('open');

    if (!open) {
      // Flat while closed, so the arrow sits squarely on the mic's head.
      rows.forEach(r => { r.style.transform = ''; });
      return;
    }

    // The curve leans towards the nearer edge, so the stack looks like it
    // is growing out of that corner rather than away from it.
    const here = bar.getBoundingClientRect();
    const midX = here.left + here.width / 2;
    const toRight = midX > window.innerWidth / 2;
    const sign = toRight ? 1 : -1;
    const room = (toRight ? window.innerWidth - midX : midX) - unit * 1.9;

    // Where the column itself puts each button, measured from the mic
    // upwards. offsetTop is the layout position, so unlike a screen rect
    // it is not polluted by the offset this function set last time. That
    // feedback was flattening the curve a little more on every repaint.
    const nat = rows.map(r => rows[0].offsetTop - r.offsetTop);
    const span = Math.abs(nat[n - 1]) || unit * 3.3 * (n - 1);

    // lean 0 is a straight line, 1 is a full quarter circle. Pick the
    // roundest curve whose widest point still fits beside the window edge.
    function widthAt(lean) {
      if (lean <= 0.001) return 0;
      const sweep = (Math.PI / 2) * lean;
      const R = span / sweep;
      return R * (1 - Math.cos(sweep));
    }
    let lean = 1;
    if (widthAt(1) > room) {
      let lo = 0, hi = 1;
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2;
        if (widthAt(mid) > room) hi = mid; else lo = mid;
      }
      lean = lo;
    }

    if (lean <= 0.001) {
      rows.forEach(r => { r.style.transform = ''; });
      return;
    }

    const sweep = (Math.PI / 2) * lean;
    const R = span / sweep;

    rows.forEach((row, i) => {
      const a = sweep * (i / (n - 1));
      // Where the button should sit on the circle, against where the
      // column already put it.
      const x = sign * R * (1 - Math.cos(a));
      const y = Math.abs(nat[i]) - R * Math.sin(a);
      row.style.transform =
        'translate(' + Math.round(x) + 'px, ' + Math.round(y) + 'px)';
    });
  }

  function paintHints() {
    if (!bar) return;
    bar.classList.toggle('hints', settings.showHints !== false);
    requestAnimationFrame(placePreview);
  }

  function countUse() {
    const next = (settings.useCount ?? 0) + 1;
    settings.useCount = next;
    save({ useCount: next });
    paintHints();
  }

  // One short card, the first time the user lands in a text box. It points
  // at the control rather than explaining every button, because the labels
  // beside the buttons already do that.
  function maybeCoach() {
    if (coach || settings.coachDone) return;

    coach = document.createElement('div');
    coach.className = 'coach';
    coach.innerHTML =
      '<b></b><span class="c1"></span><br><span class="c2"></span>' +
      '<br><button type="button"></button>';
    coach.querySelector('b').textContent = t('coachTitle');
    coach.querySelector('.c1').textContent = t('coachBody');
    coach.querySelector('.c2').textContent = t('coachNote');
    coach.querySelector('button').textContent = t('coachOk');

    coach.querySelector('button').addEventListener('click', () => {
      coach.classList.remove('on');
      settings.coachDone = true;
      save({ coachDone: true });
      setTimeout(() => { coach?.remove(); coach = null; }, 400);
    });

    shadow.appendChild(coach);
    requestAnimationFrame(() => {
      const rect = bar.getBoundingClientRect();
      coach.style.right =
        Math.round(window.innerWidth - rect.right) + 'px';
      coach.style.bottom =
        Math.round(window.innerHeight - rect.top + 14) + 'px';
      coach.classList.add('on');
    });

    // Never nag: it goes away on its own too.
    setTimeout(() => coach?.classList.remove('on'), 14000);
  }

  function showButtons() {
    if (isOff()) return;
    buildBar();
    applyScale();
    bar.classList.add('on');
    maybeCoach();
  }

  let wasLive = false;
  function paintMic() {
    if (!micButton) return;
    // The moment listening begins, one ring goes out; the halo follows.
    if (listening && !wasLive) overlay('burst', micButton.getBoundingClientRect(), 600);
    // Dictation over: the control may go once focus is no longer in a box.
    if (!listening && wasLive) scheduleHide();
    wasLive = listening;
    micButton.classList.toggle('live', listening);
    if (!listening) micButton.style.setProperty('--lvl', 0);
    micButton.innerHTML = listening ? ICONS.stop : ICONS.mic;
    micButton.title = listening ? t('stopSpeak') : t('startSpeak');
    micButton.setAttribute('aria-label', micButton.title);
    micButton.setAttribute('aria-pressed', String(listening));
  }

  // --------------------------------------------------------------- hotkeys

  function handleHotkey(event) {
    // Only the user's own keys. A page can dispatch a KeyboardEvent with
    // ctrlKey and shiftKey set, and without this check that switched on a
    // microphone the user had granted, with no gesture from the user.
    if (!event.isTrusted) return;
    if (isOff()) return;

    // Escape stops dictation and puts the caret back in the box. It only
    // acts when our own UI is doing something, so a site's own Escape
    // handling (closing its dialogs) is never swallowed.
    if (event.key === 'Escape') {
      if (!listening) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      stopDictation();
      const box = resolveTarget();
      if (box?.isConnected) box.focus({ preventScroll: true });
      return;
    }

    // Nothing else here. The shortcuts are chrome.commands now (runCommand
    // below): catching Ctrl+Shift combinations on every page took keys that
    // pages use, redo above all.
  }

  // On window, in the capture phase, so a site's own Escape handling does not
  // see the key first while dictation is running.
  window.addEventListener('keydown', handleHotkey, true);

  // A chrome.commands shortcut, sent by the worker to every frame of the tab.
  // It acts only where focus is in a box Ukti handles: not the remembered box,
  // not a password field, not a frame without focus. The one exception is
  // stopping a dictation this frame is running, wherever focus has gone.
  function runCommand(command) {
    if (isOff()) return;
    if (command === 'toggle-dictation' && (listening || starting)) {
      toggleDictation();
      return;
    }
    if (!document.hasFocus() || !currentEditable()) return;
    switch (command) {
      case 'toggle-dictation': toggleDictation(); break;
      case 'to-bangla': convertBanglish(); break;
      case 'to-english': convertToEnglish(); break;
      case 'undo': undoLast(); break;
    }
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message.source === 'ukti-command') runCommand(message.command);
    return false;
  });

  // The labels beside the buttons show the shortcuts as the user has bound
  // them, so they are asked for when the control is built and again when the
  // page comes back into view (the user may have been off rebinding them).
  let shortcuts = {};
  async function loadShortcuts() {
    try {
      shortcuts = (await chrome.runtime.sendMessage({ type: 'GET_SHORTCUTS' })) || {};
      paintLabels();
    } catch (_) {}
  }
  document.addEventListener('visibilitychange', () => {
    if (bar && document.visibilityState === 'visible') loadShortcuts();
  });

  // A chat site usually focuses its composer as the page settles, and on a
  // fast load that happens before this script exists. No focusin ever fires
  // after that, so the control used to stay hidden until the user clicked
  // away and back. Check once for a box that is already focused.
  function adoptFocusedBox() {
    const found = currentEditable();
    if (!found) return;
    lastEditable = found;
    if (quietBox(found)) { watchQuiet(found); return; }
    showButtons();
    requestAnimationFrame(() => anchorToField(found));
  }

  loadSettings().then(() => {
    applyScale();
    paintHints();
    adoptFocusedBox();
  });

  chrome.storage.onChanged.addListener(changes => {
    for (const key of Object.keys(changes)) {
      settings[key] = changes[key].newValue;
    }
    applyScale();
    applyTheme();
    applyPosition();
    paintLabels();
    paintLayout();
    paintHints();
    applyEnabled();
  });

  // -------------------------------------------------------- engine replies

  // The popup needs the current site's hostname for its per-site switch.
  // Reading tab.url would force a host permission on the whole extension,
  // which is the scariest line in the install dialog and the biggest
  // review risk. The page can simply tell us its own hostname instead.
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.source !== 'ukti-popup' || message.type !== 'GET_HOST') {
      return false;
    }
    if (window.top !== window) return false;  // top frame answers, not iframes
    respond({ host: location.hostname.replace(/^www\./, '') });
    return false;
  });

  chrome.runtime.onMessage.addListener(message => {
    if (message.source !== 'ukti-background') return false;
    if (message.sessionId && message.sessionId !== sessionId) return false;
    if (typeof message.epoch === 'number' && message.epoch < liveEpoch) return false;

    switch (message.type) {
      case 'LISTENING':
        if (starting && !wanted) break;   // already pressed off again
        listening = true;
        paintMic();
        showPreview();
        showIndicator(t('listening'), null, true);
        break;

      case 'INTERIM_RESULT':
        if (message.text) {
          showPreview();
          renderInterim(message.text);
        }
        break;

      case 'FINAL_RESULT': {
        if (!message.text) break;

        // Show it first. Even if the box has gone, the user can still see
        // and copy what they said instead of losing it.
        commitToPreview(message.text);

        if (!target || !target.isConnected) {
          showIndicator(t('boxGone'), 'error');
          hideIndicator(3000);
          break;
        }

        pushUndo(target);

        const before = existingText(target);
        const needsSpace = before.length > 0 && !/\s$/.test(before);
        insertText(target, (needsSpace ? ' ' : '') + message.text);
        flyToBox(message.text, target);
        landed(target);
        watchInsert(target, before);

        showIndicator(t('listening'), null, true);

        if (settings.autoSubmit) {
          stopDictation();
          setTimeout(() => submitBox(target), 120);
        }
        break;
      }

      case 'LEVEL':
        if (micButton && listening) {
          micButton.style.setProperty('--lvl', message.level ?? 0);
          preview?.style.setProperty('--lvl', message.level ?? 0);
        }
        break;

      case 'THROTTLED':
        showIndicator(t('throttled', message.seconds), 'busy');
        hideIndicator(6000);
        break;

      case 'STUCK':
        listening = false;
        paintMic();
        hidePreview();
        showIndicator(t('stuck'), 'error');
        hideIndicator(8000);
        break;

      case 'TRANSLATE_FAILED':
        showIndicator(t('transFail'), 'error');
        break;

      case 'RESTARTING':
        // A restart after a network error is already explained by the
        // offline notice. Saying "reconnecting" here replaced that notice
        // within 15 ms, measured, so the user never got to read it.
        if (message.detail === 'network') break;
        showIndicator(t('reconnecting'), 'busy');
        break;

      case 'RECOGNITION_ERROR':
        // Transient. The engine restarts itself; no need to alarm the user,
        // except when the cause is that there is no internet. Then nothing
        // will be heard however long they speak, and they should know now,
        // not after eight failed retries.
        if (message.error === 'network') {
          showIndicator(t('offline'), 'busy');
          hideIndicator(5000);
        }
        break;

      case 'FATAL':
        listening = false;
        paintMic();
        hidePreview();
        showIndicator(fatalMessage(message.error), 'error');
        hideIndicator(4000);
        break;

      // Another tab started dictating, and there is only one microphone.
      case 'TAKEN_OVER':
        listening = false;
        paintMic();
        hidePreview();
        showIndicator(t('elsewhere'));
        hideIndicator(3000);
        break;

      case 'STOPPED':
        listening = false;
        paintMic();
        hidePreview();
        hideIndicator(600);
        break;
    }
    return false;
  });

  function fatalMessage(code) {
    switch (code) {
      case 'not-allowed': return t('fatalNotAllowed');
      case 'audio-capture': return t('fatalNoMic');
      case 'service-not-allowed': return t('fatalService');
      case 'language-not-supported': return t('fatalLang');
      case 'network-retry-limit': return t('fatalNetwork');
      case 'no-audio': return t('fatalNoAudio');
      default: return t('fatalOther', code);
    }
  }
})();
