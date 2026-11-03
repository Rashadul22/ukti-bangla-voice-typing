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

## 2. The hotkeys took over keys on every page (fixed)

**Was:** a page never received Ctrl+Shift+Z, B, E or Space, focused box or
not, which broke redo in Google Docs and Figma and Chrome's own Ctrl+Shift+B.

**Now:** the shortcuts are `chrome.commands`, rebindable at
`chrome://extensions/shortcuts`, with defaults Ctrl+Shift+Space (speak),
Alt+Shift+1 (Bangla), Alt+Shift+2 (English) and Alt+Shift+3 (undo). Adding
`commands` adds no install warning (measured). A command does nothing unless
focus is in a box Ukti handles, except stopping a dictation already running.
A test checks a page now receives Ctrl+Shift+Z, B, E and Alt+Z, and another
pins the defaults clear of a list of shortcuts Chrome and common editors use.

One thing a reviewer could still raise: a `chrome.commands` shortcut is
consumed by Chrome before any page sees it, so the four default combinations
are unavailable to pages everywhere. That is how every extension shortcut
works, and the user can unbind any of them.

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

- **`author` in `manifest.json` was a string** where Chrome documents an
  object with an email. Removed: the object form would publish an email
  address, and the store shows the publisher from the developer account.
- **Setup page opens on install** (`chrome.tabs.create` in `onInstalled`).
  Allowed for onboarding, and it is needed for the microphone prompt and the
  language-pack download. Fine as long as it opens only on `install`, which
  it does.
- **The listing mentions Google.** Descriptive use ("Chrome sends the audio to
  Google's servers") is fine; do not use Google's logos in screenshots or the
  promo tile.
- **Screenshots must show the real product.** None exist yet.
- **`homepage_url` and the policy link `rashadul.me`.** Well formed; whether it
  loads could not be checked from here. Make sure it does and says who you are;
  reviewers sometimes check.
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
