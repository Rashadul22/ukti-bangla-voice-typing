# Read as a Chrome Web Store reviewer

What in Ukti could draw a rejection or a request for changes, most serious
first. Each item says whether it is fixed, needs your decision, or is
something to state clearly in the submission. Measured items say how.

## 1. Broad host access from the content script (state it, or decide)

**What a reviewer sees.** The install warning "Read and change all your data
on all websites" (measured with Chrome's own
`getPermissionWarningsByManifest`), caused by `content_scripts.matches`
covering every http and https page, with `all_frames: true`. Broad access is
the most common reason an extension is sent to in-depth review, and
reviewers ask whether `activeTab` would do.

**Status.** Justification written in `checklist.md`. The honest answer to
"would activeTab do" is: it would, at the cost of the product's core gesture
(the control appearing when you click into a box). That is your call; see
`PRIVACY-FACTS.md`, "Could the access be narrowed". If you keep it, expect
in-depth review and a slower first approval.

## 2. The hotkeys take over keys on every page (needs your decision)

**Measured.** On a page with the extension on, a page listener never
receives Ctrl+Shift+Z, Ctrl+Shift+B, Ctrl+Shift+E or Ctrl+Shift+Space, whether
or not a text box is focused: Ukti catches them at `window` in the capture
phase and calls `stopImmediatePropagation`. Ctrl+Shift+Z is redo in Google
Docs, Figma, VS Code for the web and many other editors; Ctrl+Shift+B is
Chrome's own "show bookmarks bar".

**Why it matters.** Users will report "redo stopped working" without knowing
why, and a reviewer can read it as interfering with sites and the browser.

**Recommendation.** Move the shortcuts to the `chrome.commands` API. It needs
no permission, the user can see and rebind them at
`chrome://extensions/shortcuts`, and Chrome resolves conflicts instead of the
extension silently winning. The cost is a message from the service worker to
the tab for each press. Smaller step if you want to keep the current design:
act on (and swallow) a hotkey only when the focused element is a box Ukti
handles, and let Ctrl+Shift+Z through unless Ukti has something to undo for
that box. I have not changed this: it changes how the product is used.

## 3. Data-usage disclosure (needs your decision, in the dashboard)

Ukti's own code sends nothing (tested), but dictation makes Chrome send audio
to Google through the Web Speech API. If the dashboard declares no data
handling at all and a reviewer tests dictation, the disclosure can look
false. The privacy policy describes the speech path plainly; the form should
not contradict it. My reading is in `checklist.md`.

## 4. A web page could switch the microphone on (fixed tonight)

Before task 11, page script could start dictation with a synthetic
Ctrl+Shift+Space or `button.click()` through the open shadow root. A reviewer
who found that would reject outright: a microphone extension usable by any
website without a user gesture. Fixed: only trusted events are obeyed, with
tests (`tests/security.test.js`) and mutants proving it.

## 5. Privacy claims that were not true (fixed tonight)

The README said "nothing sent to a server" (corrected on `main` before
tonight) and that the install dialog shows no site warning (corrected
tonight). Misleading claims are a listed rejection reason and a removal
reason after approval. Every user-facing claim is now in `PRIVACY-FACTS.md`
with the code behind it, and `tests/strings.test.js` fails if the old claim
returns.

## 6. The microphone left on after the page was gone (fixed tonight)

Before task 3, navigating away or closing the tab mid-dictation left the
offscreen document listening, with audio still going to Google. A reviewer
watching Chrome's microphone indicator after closing a tab would have seen
it stay on. Fixed and tested (`tests/lifecycle.test.js`).

## 7. Password fields (fixed tonight, with a stated limit)

The policy says password and payment fields are skipped. Before task 11 the
standard `one-time-code` and `cc-*` autocomplete values, CSS-masked passwords
and `contenteditable` widgets got past the filter. Fixed and tested. The policy
states the remaining limit (an unmarked password box cannot be recognised).

## Lower risk, worth a glance

- **`author` in `manifest.json` is a string.** Chrome documents `author` as an
  object (`{"email": "..."}`). A string is not an error today, but it is not
  the documented form. Removing it or switching to the object form costs
  nothing. Not changed.
- **Setup page opens on install** (`chrome.tabs.create` in `onInstalled`).
  Allowed for onboarding, and it is needed for the microphone prompt and the
  language-pack download. Fine as long as it opens only on `install`, which
  it does.
- **The listing mentions Google.** Descriptive use ("Chrome sends the audio to
  Google's servers") is fine; do not use Google's logos in screenshots or the
  promo tile.
- **Screenshots must show the real product.** None exist yet.
- **`homepage_url` and the policy link `rashadul.me`.** Make sure it loads and
  says who you are; reviewers sometimes check.
- **Requirements.** `minimum_chrome_version: 138` is honest about the
  Translator API. Say "desktop Chrome" in the listing (it does), since the
  Translator API and offscreen documents are not on Android.

## Checked and fine

- No remote code: every script is packaged; no `eval`, no remote `src`
  (`tests/privacy.test.js`).
- Two permissions only, `storage` and `offscreen`, both used and justified.
- Single purpose holds: voice typing, with translation and Banglish
  conversion as parts of writing in a box.
- Code is readable, not minified or obfuscated.
- The package holds only the files the extension uses
  (`scripts/package.js`, `tests/release.test.js`).
- No `web_accessible_resources`, no `externally_connectable`, no message
  listeners a page can reach (`SECURITY.md`).
