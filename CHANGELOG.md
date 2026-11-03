# Changelog

Versions follow the `version` in `manifest.json`, which must match the
footer of the setup page (`scripts/package.js` refuses to build otherwise).

## Unreleased

Work done after 1.0.1, not yet given a version number. Details and the
measurements behind each item are in `PROGRESS.md`.

- **Feedback motion.** A press ripples; the box glows where the words
  landed; a success sends a green ring from its button and a refusal gives
  it a short shake; the mic sends out one ring when it starts listening and
  leans toward the pointer while hovered. Small press feedback in the popup
  and on the setup page. All of it is off with reduced motion, and nothing
  runs at idle. The design at rest is unchanged.
- **Readability and reach.** Grey labels, hints and footers in the popup and
  setup page, white text on the purple buttons, the welcome card's button and
  the light theme's shortcut labels now meet 4.5:1 contrast (they measured
  3.11 to 4.27). Small links, the tabs and the header switches have a 40px
  hit area. Both pages respect reduced motion. "Built by" no longer runs into
  the name in English.
- **Shortcuts.** Ukti no longer takes Ctrl+Shift+Z (redo), Ctrl+Shift+B
  (Chrome's bookmarks bar) or Ctrl+Shift+E from every page. Shortcuts are now
  Chrome extension commands, changeable at `chrome://extensions/shortcuts`:
  Ctrl+Shift+Space to speak, Alt+Shift+1 for Bangla, Alt+Shift+2 for English,
  Alt+Shift+3 to undo. They do nothing outside a text box. The Alt+Z fallback
  is gone (it was word wrap in VS Code for the web). Pages opened before an
  update need a refresh before the shortcuts reach them; the buttons work.
- **Security.** A web page could switch on the microphone with a synthetic
  keypress or a script click on the button. Only the user's own keys and
  clicks are obeyed now. The password and payment field filter now covers the
  standard `one-time-code` and `cc-*` autocomplete values, CSS-masked
  passwords and `contenteditable` PIN and card widgets, and is re-checked at
  the moment of use.
- **The microphone stops** when the page navigates away, the tab closes or the
  frame is removed mid-dictation. It used to keep listening.
- **Rapid presses and two tabs.** Pressing the mic quickly no longer leaves it
  in the opposite state from the button; a tab that loses the microphone to
  another tab says so instead of keeping a lit button.
- **Messages.** Every error is now in both Bangla and English. Going offline
  is said at once. A missing language pack says "open setup" at once instead
  of showing "translating" for ever.
- **Accessibility.** Hidden buttons no longer take keyboard focus; the mic and
  toggle report their state; messages are announced; reduced motion stops
  every animation.
- **Performance.** No message to the service worker on page load (was one per
  frame); the Banglish dictionary is built on first use; tiny frames skip
  setup. Budget in `PERF.md`.
- **Banglish.** Corpus-measured rules for cch, the য-ফলা, verb and case
  endings, and English words with Bangla suffixes. Held-out word accuracy
  52.6% to 57.7%.
- **Privacy.** The README and the setup page now say plainly that Chrome sends
  speech to Google, and what the install warning means.
- **Development.** A Playwright test suite (`npm test`), a Banglish corpus
  (`npm run corpus`), a mutation check (`npm run test:mutants`), and this
  release process (`scripts/package.sh`, `RELEASING.md`).

## 1.0.1

- **Gemini insertion.** Converting text in Gemini's composer now sticks;
  before, the change was thrown away a moment later. Each way of writing into
  the box is now tried in turn and checked after the editor has had its turn,
  because Gemini's editor accepts a synthetic paste and then rewrites it from
  its own model.
- **No-op translation guard.** When a translation comes back identical to the
  input, which happens when a language pack is missing, Ukti says so instead
  of writing the same sentence into the box again.
- **The toast is no longer clipped.** Long messages wrap onto more lines
  instead of being cut off at an ellipsis, which used to hide the part of the
  sentence that said what to do.
- **Nasal clusters in Banglish.** `ng` before a consonant or at the end of a
  word is ং (বাংলা, ইংরেজি, রং), before a vowel ঙ (বাঙালি, ভাঙা), and `n`
  before `k` is ং with the k kept (সংখ্যা, অংক).

## 1.0.0

First release.

- Speak Bangla into any text box on any site, from a floating control or
  Ctrl+Shift+Space.
- Output as Bangla script or as English, translated on the device with
  Chrome's Translator API.
- Typed Banglish converted to Bangla (Ctrl+Shift+B); text turned into
  English (Ctrl+Shift+E); undo (Ctrl+Shift+Z).
- Off for one site or everywhere, from the popup.
- Bangla and English interface.
