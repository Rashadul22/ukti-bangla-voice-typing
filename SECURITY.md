# Ukti as a hostile page sees it

The content script runs in every frame of every http and https page, and the
floating control lives in an open shadow root. This is what a page's own
JavaScript can and cannot do to it. Every claim below is a test in
`tests/security.test.js` unless it says otherwise; the attack page is
`tests/pages/hostile.html`.

Tested on 2026-11-03 against Chromium 153, headless, with a fake speech
recogniser driving the real offscreen document.

## Summary

| Attack | Before | After |
|---|---|---|
| Start the microphone with a synthetic Ctrl+Shift+Space | **worked** | blocked |
| Start the microphone with `button.click()` through the shadow root | **worked** | blocked |
| Run a conversion with a synthetic click or key | **worked** | blocked |
| Drag the control (and save a position) with synthetic pointer events | **worked** | blocked |
| Field filter: `autocomplete="one-time-code"` | **control shown** | refused |
| Field filter: `autocomplete="cc-number"` | **control shown** | refused |
| Field filter: `autocomplete="cc-csc"` | **control shown** | refused |
| Field filter: `type="text"` masked with `-webkit-text-security: disc` | **control shown** | refused |
| Field filter: `contenteditable` with `aria-label="Enter your PIN"` | **control shown** | refused |
| Field filter: `contenteditable` with `autocomplete="cc-number"` | **control shown** | refused |
| Field marked `current-password` only after the user focused it | **dictation started** | refused at the moment of use |
| Password field inside a cross-origin iframe | refused | refused |
| Read the interim words from the preview panel | possible | possible, by design (see below) |
| Read `chrome.storage`, including the sites Ukti is off for | not possible | not possible |
| Send Ukti a message | not possible | not possible |

The real user's path still works: a trusted hotkey starts dictation and a
trusted click stops it (tested).

## What was wrong, and the fix

**Synthetic events were obeyed.** Neither the hotkey handler nor the buttons
checked `event.isTrusted`. A page could dispatch a `KeyboardEvent` with
`ctrlKey` and `shiftKey` set, or call `.click()` on the mic button through the
open shadow root, and switch on a microphone the user had already granted to
the extension. The transcript then landed in the page's own box. That is an
eavesdropping primitive available to every website, without a gesture from
the user. Fixed: the hotkey handler, every button's click handler, and the
drag handle's `pointerdown` all ignore untrusted events (`content.js`,
`handleHotkey`, `makeButton`, `makeDraggable`). A closed shadow root alone
would not have fixed this: the synthetic hotkey needs no access to the root.

**The field filter missed the standard autocomplete tokens.** The regex knew
`otp` and `cardnumber`, but the HTML standard values are `one-time-code` and
`cc-number`, `cc-csc`, `cc-exp`. A field marked up exactly as the standard
says got the control. Fixed in a shared `sensitive()` check, which also reads
`aria-label`, `placeholder` and `aria-placeholder`, and the computed
`-webkit-text-security` that sites use to draw a password as dots in a
`type="text"` box.

**contenteditable was never filtered.** Custom PIN and card widgets are often
`contenteditable` and carry their meaning only in `aria-label` or
`autocomplete`. `sensitive()` now applies to them, and to `textarea`.

**The remembered box was not re-checked.** `resolveTarget()` fell back to the
last box focused without filtering it again, so a field that a page marked
as a password after focus still got dictation. The fallback is now filtered
at the moment of use.

Each fix has a test that failed before it, and `tests/mutants.js` puts each
bug back (mutants 9, 11, 12) to show the suite catches it.

## What a page can still see, and why that is acceptable

- **The control exists.** The shadow host `<div data-ukti="bar">` is in the
  page's DOM, so a page can tell Ukti is installed. Its attributes show the
  chosen theme and size. A closed root would hide the inside, not the host.
- **The words while dictating.** The preview panel shows interim words, and
  an open shadow root lets the page read them a moment before they are
  inserted into the page's own box. The page receives those same words when
  they land, so this reveals nothing it would not get anyway. The one case
  where the page could see words it would not otherwise get: the user
  dictates, then deletes the text before it is committed. Minor.
- **Whether Ukti is off for this site.** The control simply does not appear.
  The page cannot learn anything about other sites: the list lives in
  `chrome.storage` and in the content script's isolated world, neither of
  which a page can reach.

## What a page cannot do

- **Message the extension.** There is no `window` message listener, no
  `onMessageExternal`, and no `externally_connectable` key, so web pages
  cannot use `chrome.runtime.sendMessage` to reach Ukti. (Other extensions
  could address it, but it has no external listener, so nothing answers.)
- **Probe extension files.** There are no `web_accessible_resources`.
- **Inject markup.** Every `innerHTML` in `content.js` takes a constant (the
  icons, the loading dots, empty templates); page text, transcripts and
  translations only ever go in through `textContent` or as `text/plain` into
  the page's own editor. Checked by reading every use; there are six.
- **Redirect dictation into another box.** The target is fixed when dictation
  starts. A page can move focus, but the words still go to the box the user
  started in, which is a box on that same page.
- **Fake the loaded guard.** `self.__uktiLoaded` lives in the isolated world.

## Should the shadow root be closed

**Recommendation: not now.** After the `isTrusted` fix, the open root's only
remaining exposure is the interim preview words, which the page gets a moment
later anyway. Closing it:

- would hide the preview and the buttons from page script, which is a small
  gain on top of `isTrusted`;
- would not hide the host element, so it does not stop fingerprinting;
- would cost the test suite its way in (Playwright pierces open roots only;
  every test that reads the control would need another route) and make the
  control harder to debug on a real site.

If you want it anyway it is a one-line change (`attachShadow({ mode: 'closed' })`
in `buildBar`) plus test plumbing. Per your instructions I have not made it.

## Not tested here

- Real sites. Everything above was measured on synthetic pages.
- Pages that patch DOM prototypes (`Element.prototype.attachShadow`,
  `EventTarget.prototype.dispatchEvent`). Content scripts run in an isolated
  world with their own wrappers, so these patches should not reach Ukti,
  but it is not tested.
- A closed shadow root on the page's side hiding a password field from
  `deepActiveElement()`. Focus inside a closed root stops at the host, which
  is not editable, so the control does not appear; reasoned, not tested.

## Second pass, 4 November: a compromised renderer, and the network

The first pass was a hostile *page*. This pass assumes worse: a page that
has taken over its renderer process, which can then send any extension
message the content script could. Chromium's security team says to treat
content scripts as less trustworthy for exactly this reason, to validate
everything they send, and not to let them trigger privileged actions
([Chromium extensions group](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/0ei-UCHNm34),
[Duo Labs](https://duo.com/labs/tech-notes/message-passing-and-security-considerations-in-chrome-extensions)).
The tests send such messages from a tab context, which has the same sender
shape as a content script (`tests/security2.test.js`).

| Attack | Before | After |
|---|---|---|
| A tab context posts a fake recogniser result to another tab, which writes it into that tab's box | **worked** (measured: the words went in) | refused: only the offscreen document may speak for the recogniser (`fromOffscreen`, by `sender.url` and no `sender.tab`) |
| A tab context drives the offscreen document directly (`target: 'offscreen'`) | **worked** (the microphone started) | refused: the offscreen document obeys only the service worker (no `sender.tab`) |
| A tab in the background asks for the microphone | **worked** | refused: dictation starts only for the active tab |
| A result with no session id reaches a listening page | **written in** | ignored: results must name the frame's own session |
| A huge text sent for repair or translation | ran unbounded | refused at 20,000 (repair) and 50,000 (translate) characters |
| `RESET_ENGINE` from a tab (closes the recogniser) | **worked** | refused, offscreen only |
| Any network request from Ukti's own pages | none made (code check only) | **forbidden by Chrome**: `connect-src 'none'` in the manifest CSP; the test makes a fetch and sees Chrome's policy refuse it |

The manifest CSP for extension pages is now
`script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';
frame-ancestors 'none'; connect-src 'none'`. It adds no permission and no
install warning (the pinned warning list in `tests/privacy.test.js` is
unchanged). It does not affect speech recognition or the translator, which
are Chrome's own, and it does not cover the content script, which runs under
the page's policy (the code check still covers that).

### Still true, and why

- **The active tab can still start the microphone without a click**, if its
  renderer is compromised: the background cannot see a user gesture in a
  content script. The microphone is then for that same page, Chrome shows
  its recording indicator, and the page would only get words it could get
  by asking for the microphone itself.
- **Nothing is ever 100% secure.** What can be said: every attack listed
  here and in the first pass has a test that failed before its fix, and the
  places a page can reach Ukti are written down above.

### New surfaces from this round, checked

- **Repair and translate** take page text; both are now bounded, and both
  return text that goes in through the same `textContent` and editor paths.
- **Snippets** are the user's own text from `chrome.storage`; they are
  inserted as text, never as markup.
- **The try-it box** runs on Ukti's own page; a website cannot reach it.
- **"Tell a friend"** writes a fixed sentence, on a click, and nothing else.
- **`CSS.registerProperty('--ukti-glow-angle')`** is the only thing Ukti adds
  to the page's own world. A page could register the name first; the ring
  would then stand still. Cosmetic only.
- **`data-tone`** on the control's host, when sounds are on, tells a page
  that the sound setting is on. A page can already tell Ukti is installed.
