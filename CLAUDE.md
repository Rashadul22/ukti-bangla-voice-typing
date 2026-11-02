# Ukti

You are working on **উক্তি (Ukti)**, a Manifest V3 Chrome extension at version
1.0.1 that lets Bengali speakers who cannot type Bengali script speak into any
text box on any site. Output can be Bangla script or auto-translated English,
and typed Banglish can be converted to Bangla. Author: Md Rashadul Islam.

This file is the standing briefing for anyone, human or agent, working in this
repository. Read it before changing code.

## The code

- `manifest.json` — MV3, two permissions only (`storage`, `offscreen`), no host permissions
- `background.js` — service worker: message routing, offscreen lifecycle, settings migration
- `content.js` — the floating control and the text insertion engine (the hard part)
- `banglish.js` — phonetic Banglish to Bangla transliteration plus a dictionary
- `offscreen.js` — microphone, Web Speech recognition, Chrome Translator API
- `popup.html` / `popup.js` — settings popup
- `setup.html` / `setup.js` — first-run setup page
- `i18n.js` — English layer for the popup and setup page

## What already works. Do not regress any of this

Every item here was found by testing and cost real effort. Read the comments in
the code before changing the surrounding lines.

1. **Insertion strategy order with per-strategy async verification.**
   `replaceAll` in `content.js` tries `paste`, then `execCommand`, then a manual
   `Range`, and verifies after each one whether the editor kept the change.
   This matters because Gemini's composer is Quill: it lets a synthetic paste
   land in the DOM and then rewrites the DOM from its own model a tick later, so
   a synchronous check reports success on an edit that is already doomed.
   WhatsApp's Lexical editor is the opposite and only honours the paste. Never
   collapse this back into "try one way and check immediately".

2. **`everythingSelected()` guard before any write.** If the whole box is not
   really selected, nothing is written. Without it a paste lands at the caret
   and the user ends up with the sentence in the box twice.

3. **`putBack()` verifies the result equals the expected text**, restores the
   original if it does not, and only then shows a warning. It used to ask merely
   whether anything had changed, which counted a doubled box as a success.

4. **Two `selectEverything()` calls with a wait between them.** Editors read the
   selection from `selectionchange` on a later task, so the first select-all can
   land while the editor is still digesting the typing before it.

5. **`SCHEMA` migration in `background.js`.** An unpacked extension keeps its id,
   so `chrome.storage` survives a remove and reinstall and an old version's saved
   value outranks a new default forever. If you change a default, raise `SCHEMA`
   and move that key.

6. **No `host_permissions`.** The popup asks the content script for the hostname
   rather than reading `tab.url`. This is what keeps "read your data on all
   websites" out of the install dialog. Do not reintroduce it.

7. **No resident `backdrop-filter`.** Blurred layers forced a recomposite on
   every page movement and made Gemini hang on paste. Blur is applied only to
   the preview panel while it is open.

8. **`adoptFocusedBox()` at startup.** Chat sites focus their composer before the
   content script loads, so no `focusin` ever fires and the control stayed hidden
   until the user clicked away and back.

9. **Password, OTP, PIN, CVV and card fields are excluded** from
   `editableFrom()`. Keep that filter and widen it if you find more cases.

10. **The toast wraps instead of being clipped.** It used to be one line with
    `text-overflow: ellipsis`, which cut off the half of the sentence that told
    the user what to do.

11. **Nasal clusters in `banglish.js`.** `ng` before a consonant or at a word end
    is the anusvara `ং` and the g is not written (বাংলা, ইংরেজি, রং); before a
    vowel it is `ঙ` (বাঙালি, ভাঙা); `n` before `k` is `ং` with the k kept
    (সংখ্যা, অংক). Every one of these was wrong before.

12. **`ENGLISH_STRONG` versus `ENGLISH_WEAK` in `banglish.js`.** `^th` and `^sh`
    are weak signals, because thanda, shomoy, shundor and shomossa are Bengali.
    A doubled consonant is strong but `ll`, `kk`, `nn` and `ss` are excluded,
    because Banglish doubles those. Also note the old
    `/(?:[bcdfgklmnprstz])\1/` never matched anything: a backreference to a
    non-capturing group.

## Known limits. Be honest about these

- **A cloud session cannot reach gemini.google.com or web.whatsapp.com.** Do not
  claim a fix works on a real site. Tests run against synthetic pages that mimic
  four editor archetypes: a native `textarea`, a plain `contenteditable`, an
  editor that owns its model and only honours paste, and one that syncs its
  selection a task late. Add a fifth that restores its own caret.
- The Translator API needs Chrome 138 or newer and both language packs
  downloaded. Translation itself was verified working on the author's machine, as
  was the Bengali to English direction.

## How to verify

The method that has repeatedly worked on this codebase, and the only one that
has: **build a page that mimics the failing editor, reproduce the bug, then fix
it and watch the test go from failing to passing.** Reasoning from documentation
produced several fixes that passed in isolation and failed in sequence.

Do not report a fix you have not watched fail first.

## Rules

- Do not add permissions, and do not add any network call.
- Keep the Bengali and English strings in step: `STRINGS` in `content.js` and
  `UKTI_EN` in `i18n.js`.
- If you change a stored default, raise `SCHEMA` in `background.js` and move
  that key in `migrate()`.
- Bump the version in `manifest.json` and in the setup page footer together.
- No em dashes anywhere in text the user will read.
- Report what you measured, with numbers, and say plainly what you could not
  verify from here.
