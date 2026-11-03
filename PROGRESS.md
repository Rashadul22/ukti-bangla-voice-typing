# Overnight progress

## Read this first

**Finished, in the order you gave:** 3, 4, 13, 11, 10, 9, 6, 12, 5, 7, and the
research half of 8 (`RESEARCH.md`, nothing built). Each has a section below
with numbers. Everything is committed and pushed to
`claude/serene-bohr-r7epda`. The suite is **170 tests, 170 passing, 0 todo**
(it was 55 with 3 todo at the start of the night).

**Not finished:** nothing on the list. Not done on purpose: the shadow root
is still open (recommended against, `SECURITY.md`), the hotkeys still work
the way they did (a decision for you, below), and no feature from task 8 was
built.

**The one thing to look at first: the install dialog.** Chrome warns
**"Read and change all your data on all websites"** for Ukti as shipped.
CLAUDE.md and the README said the opposite. I measured it by asking Chrome
itself (`getPermissionWarningsByManifest`): the content script's `matches`
cause it, not a permission. I corrected both files and the store copy says
so honestly, but whether to accept it or move to `activeTab` (no warning,
but the control no longer appears by itself) is a product decision only you
can make. Task 13 has the measurements.

**Close second, also yours to decide:** Ukti swallows Ctrl+Shift+Z, B, E and
Space on every page, so redo breaks in Google Docs, Figma and most web
editors, and Chrome's bookmarks-bar shortcut stops working. Measured in
task 7. `RESEARCH.md` ranks moving to `chrome.commands` as the first thing to
build.

**Real bugs fixed tonight, each watched failing first:**
- Any web page could switch the microphone on, with a synthetic keypress or
  a script click (task 11).
- The microphone kept listening after the tab closed or the page navigated
  away (task 3).
- A missing language pack left "translating" on screen for good (task 10).
- Rapid presses could leave the mic on when the button said off (task 4).
- The password-field filter missed the standard `one-time-code` and `cc-*`
  markup (task 11).

The insertion engine and everything CLAUDE.md lists as not to be regressed
are untouched; the tests from task 1 that guard them still pass, and so do
their mutants.

**One thing to know when you test by hand:** after replacing an unpacked
extension's files, press Reload in `chrome://extensions`. A Chrome restart
alone can keep running the old `background.js` from cache while the manifest
already shows the new version (measured in task 12).

## Readings taken on your behalf

- TASKS.md on `main` had tasks 8 to 13 that my branch did not. I merged
  `main` into `claude/serene-bohr-r7epda` (a merge commit, no rewrite) and
  worked from the merged list.
- "Do not change the insertion engine" I read as: `insertIntoNative`,
  `insertIntoEditable`, `insertText`, `replaceAll`, `everythingSelected`,
  `putBack`, `existingText`, `sameText`, `snapshot` and the strategy order
  stay untouched. Code around them (undo bookkeeping, settings writes, the
  drag handle, message routing) is fair game.

---

## Task 3: content.js lifecycle audit

**How it was tested.** A new harness (`tests/speech.js`) reaches the real
offscreen document over CDP and swaps only `webkitSpeechRecognition.prototype`
for a fake, so dictation runs through the real content script, service worker
and `offscreen.js`. `tests/lifecycle.test.js` has 11 tests.

**Measured.** Before the fixes, 6 of the 11 failed:

| Case | Before | After |
|---|---|---|
| Navigate away mid-dictation | engine kept listening (mic stays on, audio keeps going to Google) | stops within 3 s |
| Close the tab mid-dictation | engine kept listening | stops |
| iframe removed mid-dictation | engine kept listening | stops on the next result |
| Undo after a converted box was removed | "nothing to undo", older valid entries hidden | skips the dead entry, undoes the live one |
| "Off for this site" with a cross-origin iframe | control still showed inside the iframe | hidden |
| Extension reloaded, open page, press অ | nothing happened, uncaught `Cannot read properties of undefined (reading 'set')` | converts; the mic says "refresh (F5)" |
| Drag cancelled by `pointercancel` | control followed the pointer afterwards (moved 4px to 227px) | stops |

Held without changes (tests pass before and after): box removed
mid-dictation (words kept in the preview, user told), service worker killed
mid-dictation (results still arrive and stop still works), undo stack bounded
at 20 entries (25 segments dictated, exactly 20 undos, then "nothing to undo").

**Changed.**
- `content.js`: stop own session on `pagehide`; STOP carries the frame's
  `sessionId`; undo skips entries whose box is gone; `siteKey()` uses the
  top-level origin (`location.ancestorOrigins`) inside frames; all four
  storage writes go through `save()` which cannot throw; `pointercancel` ends
  a drag.
- `background.js`: when forwarding to a tab fails, stop that session; stop on
  `tabs.onRemoved` (no permission needed); pass `sessionId` through on STOP.
- `offscreen.js`: ignore a STOP for another session or tab, and ignore one
  when already idle. The second guard matters: without it, a STOP for a dead
  page answers with STOPPED, which fails to forward, which sends STOP again.

**Not changed, written up.**
- `target`, `lastEditable` and `anchored` can keep a reference to a node that
  has left the page, and each undo entry holds one too. All are bounded (three
  references plus at most 20 entries) and replaced on the next focus, so this
  is retained memory, not a leak that grows.
- With `all_frames`, a top page and an iframe can each show their own control
  at the same time, since the bar stays up after focus leaves. Not harmful,
  slightly confusing. Left for task 9's "small iframe" work.
- Page listeners (keydown, focusin, resize) are never removed. They live as
  long as the page, which is correct for a content script.

**Could not verify from here.** A real microphone. Whether `pagehide`'s
message always gets out on a real navigation; the service worker's
forward-failure stop is the backstop and is tested separately (iframe case).

**Tests.** Suite: 96 tests, 93 pass, 0 fail, 3 todo.

---

## Task 4: dictation races

**Tests.** `tests/races.test.js`, 9 tests, real worker and offscreen
document, fake recogniser.

**Measured.** Against the task 3 commit (before these fixes), three runs:

| Test | Old code | Now |
|---|---|---|
| Start then stop, pressed back to back | failed 1 of 3 runs (engine left on) | 8 of 8 runs pass |
| Three presses back to back | failed 1 of 3 runs (engine off, should be on) | 8 of 8 |
| A second tab takes over | failed 3 of 3 (tab A kept a lit mic for good) | 8 of 8 |
| Tab A's stop does not stop tab B | passed (fixed in task 3 by session scoping) | passes |
| Words handed back after stop still land | passed | passes |
| Offscreen document torn down mid-dictation, next press recovers | passed | passes |
| 4, 7 and 10 rapid presses: button and engine agree, one session at most | passed | passes |

Total after: 72 of 72 race-test results across 8 consecutive runs.

**Causes and changes.**
- A start takes a round trip, and `listening` was only set at the end, so a
  second press in that gap started again rather than stopping. Presses during
  a start now flip a `wanted` flag; when the reply lands, the start stops at
  once if the user has pressed it off.
- STOP and START go through the service worker as separate async handlers and
  can arrive out of order. Every start and stop from a frame now carries a
  rising `epoch`; the offscreen document drops a command older than the newest
  it obeyed, and every reply carries the epoch so the page ignores a late
  STOPPED from an earlier round. A start also waits for this frame's
  in-flight stop.
- When another tab takes over, the old tab now gets `TAKEN_OVER` and says so
  in both languages ("Dictation moved to another tab, stopped here").

**Not fixed, written up.**
- A result in flight when the offscreen document is torn down (for example,
  mid-translation in English mode) is lost. Nothing reports it, because the
  document holding it is gone. The button does recover on the next press, and
  a stop never creates a new document (both tested). Fixing it would mean
  the service worker tracking in-flight segments, which is more machinery
  than the case deserves tonight.

**Decided for you.**
- I loosened the 7- and 10-press tests from "ends in the state the press
  count implies" to "button and engine agree, at most one session". A debug
  log showed Playwright occasionally losing a keystroke before it reached the
  page (ten presses, nine keydowns), so the count does not say what the page
  received. The exact-state check stays for two and three presses, which were
  deterministic in all 8 runs after the fix.

**Could not verify from here.** Real Chrome speech timing; the fake ends a
session 15 ms after `stop()`, and the real service can take longer.

**Tests.** Suite: 105 tests, 102 pass, 0 fail, 3 todo.

---

## Task 13: privacy, facts first

**The finding to read.** Chrome's install dialog for Ukti, as shipped, says
**"Read and change all your data on all websites"**. Measured by asking Chrome
(`chrome.management.getPermissionWarningsByManifest`) about four manifests:

| Manifest | Warning Chrome returns |
|---|---|
| As shipped | Read and change all your data on all websites |
| Content script limited to localhost | Read and change your data on localhost |
| No content script | (none) |
| Plus `host_permissions: <all_urls>` | Read and change all your data on all websites |

So the content script's `matches` alone produce the warning. CLAUDE.md item 6
and the README both said the opposite. Corrected in both (CLAUDE.md gets a
dated correction under item 6; the rule itself stays, since not reading
`tab.url` still avoids the `tabs` permission). `tests/privacy.test.js` pins
the warning list so it cannot change unnoticed.

**Verified, with file and line, in `PRIVACY-FACTS.md`:** the audio path
(continuous Web Speech sessions, restarted while the mic is red), the
loudness-only second stream, the on-device translation path and its
no-fallback behaviour when a pack is missing, all 19 storage keys (two of
them user content: `replacements` and `disabledSites`), the undo stack and
preview as the only places dictated text lives (page memory, cleared on
stop and page close), and exactly what the content script reads.

**Tests.** `tests/privacy.test.js`, 6 tests, all pass: warning list pinned;
no network API anywhere in the code; no `console.*`; pages load nothing
remote; a dictated sentence is not in storage, the console, or the preview
after stop; every storage key is one the facts sheet lists. These verify
claims rather than fix bugs, so they passed first time; the one that failed
first was my own check counting the author's `<a href>` link as a remote load.

**Changed.**
- README: the install-dialog claim corrected; "no network permission of its
  own" replaced with the checkable "its own code makes no network requests";
  what the script reads stated exactly.
- Setup page, microphone step: one new sentence, in both languages, saying
  Chrome sends the voice to Google's servers and Ukti saves none of it. This
  is the point of consent, so the disclosure belongs there.
- CLAUDE.md item 6: correction appended, nothing removed.

**Decided for you.**
- Task 13 says to write the policy, and also to write it last, from what was
  verified, after task 11 proves the field filter. I read that as: facts now
  (`PRIVACY-FACTS.md`), policy text in task 5, after task 11. Task 5 writes
  it from the facts sheet.
- **Recommendation, not done:** if the install warning matters more than the
  control appearing on its own, the way out is `activeTab` + `scripting` with
  injection on a toolbar click or shortcut. That removes the warning and
  changes the product's core gesture. Your call.

**Could not verify from here.** What Google does with the audio, and whether
Chrome's Translator ever sends text anywhere. Both rest on Chrome's and
Google's documentation; the facts sheet says so.

**Tests.** Suite: 111 tests, 108 pass, 0 fail, 3 todo.

---

## Task 11: hostile page audit

Full write-up in `SECURITY.md`. Tests in `tests/security.test.js` (13 tests),
attack page `tests/pages/hostile.html`.

**Measured.** Before the fixes, 11 of 13 failed. **The serious one: any web
page could switch on the microphone** with a synthetic Ctrl+Shift+Space or
`button.click()` through the open shadow root, because nothing checked
`event.isTrusted`. The transcript then landed in the page's own box.
Also failing: six field-filter bypasses (`autocomplete="one-time-code"`,
`cc-number`, `cc-csc`, a CSS-masked `type="text"`, two `contenteditable`
PIN/card widgets) and a field made sensitive after focus. Held before and
after: a password inside a cross-origin iframe; no route from a page to
`chrome.storage` or to the extension's messaging.

**Changed** (`content.js`, outside the insertion engine): `isTrusted`
required on the hotkey, every button click and the drag handle; one
`sensitive()` check for inputs, textareas and `contenteditable`, covering the
standard autocomplete tokens, `aria-label`, `placeholder` and
`-webkit-text-security`; the remembered box re-filtered at the moment of use.
CLAUDE.md item 9 says to widen the filter when more cases turn up, so I did.

Three new mutants (9 updated, 11, 12) put each bug back; all killed. The task 3
drag test now uses a real mouse press, since a synthetic `pointerdown` is
ignored; checked that it still fails without the `pointercancel` fix (control
moved 62px to 322px).

**Decided for you.**
- **Closed shadow root: recommended against, not changed.** After
  `isTrusted`, the open root only exposes interim words the page receives a
  moment later anyway, and closing it does not hide the host element. Costs:
  the test suite loses its way in. Reasoning in `SECURITY.md`; a one-line
  change if you want it.
- The wider filter will refuse a few harmless boxes whose label mentions a
  password or a PIN (a support form saying "forgot your password? describe
  the problem"). I chose that direction on purpose: a missed box is a small
  annoyance, a dictated password is not.

**Could not verify from here.** Real sites; pages that patch DOM prototypes.

**Tests.** Suite: 124 tests, 121 pass, 0 fail, 3 todo.

---

## Task 10: failure paths

Tests: `tests/failures.test.js`, 17 tests, both languages where a message is
involved. Before the fixes 11 of 17 failed (first run hung; see below).

| Failure | What happened | What happens now | Fixed? |
|---|---|---|---|
| Mic permission never granted, or revoked later | Bengali message only, even in English mode | "Microphone access is blocked. Open Ukti setup to allow it." in the chosen language; mic off, engine stopped | yes |
| No microphone | Bengali only | "No microphone was found..." in either language | yes |
| Speech service refuses to start | Bengali only | translated, says to try again in a moment | yes |
| Chrome older than 138 | cannot install (`minimum_chrome_version`) | unchanged | n/a |
| Translator API missing | said "language pack needed", which no pack fixes | "This Chrome cannot translate. Chrome 138 or newer is needed." | yes |
| Language pack missing (either direction) | **"Translating..." forever**: `Translator.create()` on a `downloadable` pair never settled, and the hung promise blocked every later request for that pair | "The language pack is needed, open Setup", at once; any translation now has a 20 s ceiling | yes |
| Pack errors in general | the error codes arrived as `"Error"` (thrown as `new Error(code)`, replied as `error.name`), so the page never recognised them and always said "translation failed" | codes carried as the name, mapped to the right message | yes |
| Offline | nothing for up to eight failed retries, then a Bengali-only message | at the first network error: "No internet. Speech needs a connection; Banglish and translation work without one." Keeps retrying and recovers when words arrive (tested); after the retry limit a final message in either language and the mic off | yes |
| Rate-limited | message shown, cooldown, restart queued | unchanged and verified: message in both languages, `desired` stays on, a restart timer is queued for when the cooldown ends | held |
| Service worker terminated mid-dictation | results still arrive, stop works | unchanged (task 3 test) | held |
| Offscreen document fails to create | "চালু করা গেল না" plus the raw error, Bengali only | "Could not start: ..." in either language, mic not left lit | yes |
| Offscreen document torn down mid-result | result lost silently; next press recovers | unchanged, written up in task 4 | no |
| Navigation or box removed mid-dictation | engine kept listening | fixed in task 3 | yes (task 3) |
| Two tabs at once | first tab kept a lit mic | fixed in task 4 | yes (task 4) |
| Extension reloaded with a page open | mic: "refresh (F5)" shown; Banglish button died silently | fixed in task 3; message verified to appear | yes (task 3) |
| "Reconnecting" notice | Bengali only | translated | yes |
| Nothing heard for a long time (`no-audio`) | "সমস্যা: no-audio" | "Nothing was heard for a long time, so listening stopped." | yes |

**Changed.** `content.js`: 12 new `STRINGS` keys, each in both languages;
`fatalMessage()`, the start failure and "reconnecting" use them; the first
network error raises the offline notice. `offscreen.js`: no `create()` unless
the pair is `available`; a 20 s ceiling on translation; error codes carried as
`error.name`. The task 1 todo "no Bengali messages outside STRINGS" is now a
real, passing test.

**Decided for you.**
- Two throttles inside one offscreen document's lifetime escalate to STUCK
  even when they are hours apart, because `cooldowns` only resets on a
  result, not on a fresh start. I left that alone: the rate-limit logic was
  tuned against Google's real behaviour, which I cannot reach. Worth a look:
  resetting `cooldowns` in `startDictation` is a one-line change.
- The "pack missing" behaviour now fails at once instead of trying
  `create()`. If a future Chrome makes `create()` on a `downloadable` pair
  start a silent download from the offscreen document, this would skip it;
  the setup page remains the place downloads start, as the code already
  intended.

**Harness notes.** The first run hung for over 15 minutes: a test closed the
offscreen document (by design, via STUCK) and my CDP `eval` waited forever on
the dead target. `eval` now times out after 10 s, and each test here has a
30 s ceiling.

**Could not verify from here.** Real offline behaviour of Chrome's speech
service (the fake raises `network` the way Chrome documents it); real
revocation of the microphone permission mid-session.

**Tests.** Suite: 141 tests, 139 pass, 0 fail, 2 todo.

---

## Task 9: performance budget

Full numbers and the budget in `PERF.md`; held by `tests/perf.test.js`
(9 tests). Harness in `tests/perf.js` (`node tests/perf.js` prints a report).

**Measured.** Idle already cost nothing: 0 script, 0 layouts, 0 style
recalcs, 0 mutations over 3 s, never shown or shown. The costs were per frame
at load: 1 message to the service worker per frame (11 for a page with 10
iframes) and 81 KB of heap per frame on top of Chrome's 179 KB isolated world.

**Changed.**
- Settings read from storage directly: messages on load 11 to **0**.
- Banglish engine built on first use: `banglish.js` 1.2 to **0.5 ms** per frame;
  heap per frame 259.6 to **235.9 KB** (Ukti's share 81 to 57 KB). Corpus
  scores identical.
- Sub-frames under 60x24 skip setup until they grow: tracking-pixel frames
  **192.0 KB** (Ukti's share 13 KB).

The tiny-frame test failed before the skip (235.3 KB against 235.9) and passes
after; the "a frame that grows still gets the control" test passed before and
after, which is the point of it.

**Decided for you.** Thresholds: zeros held at zero, machine-dependent times
at roughly 3x to 7x today's numbers, so a slower CI box does not fail them.
`banglish.js` was wrapped in `build()` without re-indenting its body, to keep
the diff and `git blame` readable; a comment says so.

**Could not verify from here.** A real heavy site (used a synthetic 16,000
element page) and a slow machine.

**Tests.** Suite: 150 tests, 148 pass, 0 fail, 2 todo.

---

## Task 6: accessibility

Tests: `tests/a11y.test.js`, 10 tests. Before the fixes, 9 of 10 failed (focus
was already visible: a 2 px outline on `:focus-visible`).

| Check | Before | After |
|---|---|---|
| Tab order, collapsed | 6 stops, 4 of them invisible (folded rows) | mic, toggle |
| Tab order, expanded from the keyboard | toggle had no state | mic, অ, EN, undo, toggle; toggle has `aria-expanded` |
| Control hidden (site off) | all 6 buttons still took focus | no tab stops |
| Mic from the keyboard | Enter worked, but the name stayed "start" and there was no state | name follows ("stop listening"), `aria-pressed` follows |
| Drag grip | a focusable button that did nothing | `tabindex=-1`, `aria-hidden` (the popup's "where it sits" is the keyboard way) |
| Messages | not announced | toast is `role=status`, `aria-live=polite` |
| Preview while speaking | would be read word by word | `aria-hidden` (the words land in the box) |
| Live language switch | `aria-label` stayed Bengali | follows; host carries `lang` |
| Reduced motion | 6 elements still animated or transitioned (rows, tips, preview, halo) | nothing over 0.01 ms |
| Setup tab title in English | stayed Bengali | translated |

**Changed.** `content.js`: `visibility: hidden` on the hidden bar and on folded
rows (after the fade, so the animation is kept); ARIA state and names kept in
step in `paintMic`, `paintLayout`, `paintLabels`; grip removed from the tab
order; toast and preview roles; reduced motion now covers every element.
`i18n.js`: `document.title` translated. Both remaining todo tests from task 1
are now real, passing tests, so the suite has no todos.

**Decided for you.** The control sits at the end of the page's tab order
(its host is appended to `<body>`). I left it there rather than adding a new
shortcut to jump into it: the hotkeys already do every action from the box
itself, and a new shortcut is a new feature.

**Could not verify from here.** A real screen reader (NVDA, VoiceOver,
ChromeVox). The checks are on the accessibility attributes and on what
receives focus, not on what a screen reader actually says.

**Tests.** Suite: 160 tests, 160 pass, 0 fail, 0 todo.

---

## Task 12: releases

**Added.**
- `scripts/package.js` (and `scripts/package.sh`, a thin wrapper; `npm run
  package` also works). Written in Node rather than shell so it runs the same
  on Windows, and it zips with Node's own `zlib`, so no `zip` binary and no
  new dependency. Checks: both version strings match; every file the
  manifest, the pages and the scripts refer to exists (followed through, so
  `offscreen.html` and `i18n.js` are found); every icon is a PNG of its
  claimed size; `npm test` passes. Builds `dist/ukti-X.Y.Z.zip` from exactly
  the referenced files plus `LICENSE` (16 files, 87 KB today), then unzips it
  and loads it as an unpacked extension to confirm it starts and reports the
  right version. `unzip -t` accepts the archive.
- `CHANGELOG.md`: 1.0.0, 1.0.1 (the four items you named) and an Unreleased
  section summarising tonight.
- `RELEASING.md`: the checklist.
- `tests/release.test.js` (8 tests): the packager builds a clean tree and
  refuses version drift, a missing file, a mis-sized icon and a failing test
  suite, and keeps `tests/`, `scripts/`, `*.md` and `package.json` out of the
  zip; plus two upgrade tests.

**The upgrade tests.** Install version N into a real profile, save the user's
choices (theme, language, output mode, corner, size, disabled sites, word
replacements, button set), put N+1 at the same path, start again on the same
profile:
- Real 1.0.1 (commit `1afd7c7`) to this tree: every choice survives.
- A schema 2 build to this tree: the user's choices survive and `layout` and
  `showHints` move to the v3 defaults.

**Found while writing them.** Restarting Chrome on the same profile with an
unpacked extension whose files changed refreshes the manifest (the new
version shows) but **keeps running the old `background.js` from Chrome's
service worker cache**. Measured: the restarted worker still had `SCHEMA = 2`.
The first version of the schema 2 test failed for exactly that reason. A store
update installs afresh and is not affected; the test clears only the worker
cache to model it, and asserts the new code is running before checking
anything. For you this matters when testing by hand: after replacing an
unpacked extension's files, press Reload in `chrome://extensions`. A Chrome
restart alone can leave the old worker running, which fits CLAUDE.md's "a fix
appears not to have worked". It is in `RELEASING.md`.

**Decided for you.** `npm test` now includes the release tests, so it takes
about 2 minutes longer. The packager runs the suite, and the suite's packager
test runs the packager with the tests skipped (`UKTI_PACKAGE_SKIP_TESTS`), so
there is no loop. `dist/` is ignored by git.

**Could not verify from here.** A real Chrome Web Store update, and the
packager on Windows (written for it: Node only, `npm.cmd` on win32).

**Tests.** Suite: 168 tests, 168 pass, 0 fail, 0 todo.

---

## Task 5: store submission material

**Added, in `store/`.**
- `privacy-policy.html`: one self-contained page, English and Bengali, light
  and dark, no external loads. Written from `PRIVACY-FACTS.md` and from what
  task 11 proved about the field filter, not from the README. It says speech
  goes to Google and why, that translation and Banglish stay on the machine,
  that Ukti has no server, analytics, account or ads, exactly what is stored
  (and that the word fixes and the off-sites list are the user's own
  content), what the install warning means and what the script really reads,
  that password and payment fields are skipped **and that this is also a
  limitation** (an unmarked password box cannot be recognised), how to delete
  everything, and the "why is it free" answer.
- `listing-en.md`, `listing-bn.md`: name, summary (the manifest's 103
  characters in English; 89 in Bengali), full description, category.
- `checklist.md`: package, listing, privacy-practices answers (single
  purpose, a justification for `storage`, `offscreen` and the content
  script's host access, remote code "No"), account items.

**Tests.** Two new checks in `tests/strings.test.js`: no em dashes in any of
the documents or store copy, and no user-facing sentence claiming speech
never leaves the machine (it caught my own checklist quoting the old phrase,
which I reworded). Suite: 170 tests, all pass.

**Decided for you.**
- **The store's data-usage form is a judgement call** I have left to you,
  with my reading in the checklist. Ukti's own code sends nothing, but
  dictation makes Chrome send audio to Google. I lean towards disclosing more,
  not less.
- The policy names you and links `rashadul.me` for contact, as the manifest
  does. I did not put an email address in it.
- Screenshots: not made. The only pages I can drive here are synthetic test
  pages, and store screenshots must show the real product.

**Could not do from here.** Host the policy at a public URL (both listings
carry a `[privacy policy URL]` placeholder), take screenshots, and fill in
the dashboard.

---

## Task 7: read as a store reviewer

Written up in `store/reviewer-notes.md`, most serious first.

**New finding, measured.** The hotkeys take over Ctrl+Shift+Z, B, E and
Space on every page where Ukti is on, focused box or not: a page's own
keydown listener received none of the four (only the Shift key itself).
Ctrl+Shift+Z is redo in Google Docs, Figma and most web editors; Ctrl+Shift+B
is Chrome's bookmarks bar. **Recommended, not changed:** move to the
`chrome.commands` API (no permission, rebindable by the user), or at least
let the keys through when focus is not in a box Ukti handles and there is
nothing to undo. It changes how the product is used, so it is yours to
decide.

**Other rejection risks listed:** broad host access from the content script
(state it, or switch to `activeTab`); the dashboard's data-usage form
versus the speech path; four that were real tonight and are now fixed
(page-triggered microphone, false privacy claims, mic left on after the
page closed, field-filter gaps); and smaller items (`author` as a string,
screenshots, `homepage_url`, desktop only).

**Measured for the record.** Suite after tasks 5 and 7: 170 tests, 170 pass
(the count I gave under task 5 was by addition; this run confirms it).

---

## Task 8: research only

Written up in `RESEARCH.md`, every claim with its source. No feature built,
as you asked.

**Limits, stated in the file.** This session's network policy blocked
`developer.chrome.com` and `developer.mozilla.org`, so Chrome API claims come
from search summaries and are marked "verify". To let a later session read
them, add those two hosts under Network access, Allowed domains, in this
environment's settings (cloud environment menu, Edit; steps at
https://code.claude.com/docs/en/cloud-environments#network-access). Real
review text for competitors was mostly not reachable; where demand is not
evidenced, the table says "none found".

**Ranking.**
1. Shortcuts through `chrome.commands`: measured harm today (redo taken over
   on every site), no change to the control.
2. A spike on on-device speech (`processLocally`): if Chrome offers Bangla
   locally, the privacy policy could say the voice stays on the computer.
   Needs one line run on your machine to find out.
3. Spoken punctuation, off by default; কমা is also an ordinary word, so it
   needs native-speaker design.

Recommended against for now: learning from undo, per-site output language,
and Prompt API rewriting. Bijoy to Unicode has real demand but is a
different product.

---

# Follow-up session, 3 November

## Your decisions, recorded

1. **The broad content script stays**, and with it the install warning. The
   manifest's `content_scripts` were not touched. The honest store copy from
   task 5 stands.
2. **The hotkeys were a bug.** Fixed below.

## Shortcuts moved to chrome.commands (RESEARCH.md item 1)

**Tests first.** `tests/hotkeys.test.js`, 13 tests; all 13 failed before the
change. They check:
- a page now receives Ctrl+Shift+Z, B, E and Alt+Z, both in a text box and with nothing focused
- the manifest declares four commands, with defaults clear of a deny-list of 37 combinations that Chrome, Google Docs, common editors and VS Code for the web use
- Chrome registered the bindings
- a command converts and undoes in a focused box
- a command does nothing (no change, no toast) with focus outside a box, in a sensitive field, or where Ukti is off
- only the focused frame acts
- toggle-dictation can stop a running dictation from anywhere
- Escape still stops dictation, and passes through when not listening
- the floating control and the popup show the bindings as they are now, and the popup links to `chrome://extensions/shortcuts`

**Measured before building.** Adding a `commands` key leaves Chrome's install
warning list unchanged: still the one line, no new permission
(`getPermissionWarningsByManifest`). Headless Chrome does not turn a key press
into a command (a synthetic Alt+Shift+1 never reached `onCommand`), so the
tests call the worker's `handleCommand` with what Chrome would pass. **The
last hop, key to command, is the thing to check by hand.**

**Defaults.** Ctrl+Shift+Space speaks (unchanged, the habit carries over);
Alt+Shift+1 to Bangla; Alt+Shift+2 to English; Alt+Shift+3 undo. Digits
because Docs puts its menus on Alt+Shift+letters and strikethrough on
Alt+Shift+5, Chrome uses Alt+Shift+I, T and A, and Ctrl+Shift+letters are
crowded. These are from what I know of those apps, not measured; nothing here
can reach them. The Alt+Z fallback is gone (word wrap in VS Code for the web).

**Changed.** `manifest.json`: `commands` with bilingual descriptions.
`background.js`: `handleCommand` sends the command to every frame of the tab;
`GET_SHORTCUTS` for the labels. `content.js`: the keydown handler keeps only
Escape; `runCommand` acts only with `document.hasFocus()` and a focused box
Ukti handles; the labels show the live bindings. `shortcuts.js` (new, shared
by popup and setup): shows the bindings, "Not set" when unbound, and a
"Change shortcuts" link. Strings added to `UKTI_EN`. About 48 call sites in
the older tests moved from key presses to the command helper.

**Two more races, found because commands arrive more slowly than key
presses.** Both were in code I wrote last night, and both were caught by
existing tests:
- "Three presses end listening" failed every time after "start then stop".
  When a start learned it had been pressed off, it then waited for its STOP
  to go out while still counting as "starting", and a press in that wait
  only flipped a flag nobody read: the user's "on" was lost. Now the start
  stops counting as starting once it has decided, routes its STOP through the
  shared `stopping` promise, and a token stops an old start from clearing a
  new one's flag. 27 of 27 race results over three runs after.
- The offline notice from task 10 was replaced by "Reconnecting…" 15 ms after
  it appeared (measured by recording every toast), and under load a late
  START reply could cover it with "listening". A restart caused by the
  network no longer announces itself, and the reply announces "listening"
  only if the engine has not. New test; checked it fails without each fix.

**Behaviour change to know about.** After an extension update, pages that
were already open do not get the shortcuts until they are refreshed: the new
service worker cannot reach the old page's script. The on-screen buttons
still work there, and the mic still says "refresh (F5)". The task 3 test now
checks the buttons in that case.

## Mechanical store items

- `author` removed from `manifest.json`: Chrome documents it as an object
  with an email, which would publish an address; the store shows the
  publisher from the developer account anyway.
- `homepage_url`: well formed, left as is; whether `rashadul.me` loads could
  not be checked from here.
- Store listings (both languages) and `store/reviewer-notes.md` updated for
  the new shortcuts; `CHANGELOG.md` has the entry.
- Left alone, as product decisions: everything else in the reviewer notes.

## Mutants

The full run showed two problems in the runner itself: S2 had gone stale
when task 3 rewrote `siteKey()`, and S1 when the hotkey handler changed, and
the runner skipped stale mutants silently. S1 is replaced by H1 and H2
(commands without the focus check, commands ignoring the off switch), S2 is
repointed, 11 now targets the button `isTrusted` check, and stale mutants are
printed. Mutant 12 survived the move, because shortcuts no longer use the
remembered box; the test now also tries the mic button. 19 of 20 killed; the
survivor is still number 3 (`putBack` change), as since task 1.

**Tests.** Suite: 184 tests, 184 pass.

## The build for hand testing

`sh scripts/package.sh` passed: 184 of 184 tests, then
`dist/ukti-1.0.1.zip` built (17 files, 89.5 KB, now including
`shortcuts.js`), unzipped and loaded as an unpacked extension, which started
and reported version 1.0.1. `dist/` is not in git, so the zip was sent
directly. The version was not bumped, since you did not ask for a release.

**What to check on Gemini and WhatsApp, which I cannot reach:**
- Press Alt+Shift+1, Alt+Shift+2, Alt+Shift+3 and Ctrl+Shift+Space in each
  composer: the key-to-command hop is the one thing the tests cannot drive.
- Ctrl+Shift+Z in Google Docs now redoes.
- Converting and undoing in both composers still works (the insertion engine
  is unchanged, but this is the first build that reaches it through commands).
- The popup's "Change shortcuts" link opens `chrome://extensions/shortcuts`.

---

# UI audit, 3 November

The settled decisions (collapsed by default, the arc toward the nearer edge,
labels on hover or focus only, negative margins on collapsed rows, the
separate drag handle, the logo and mark, no resident blur) were not touched.
**I have no argument against any of them**: nothing I measured points the
other way, and the audit found every defect elsewhere.

## How it was measured

- `tests/ui/shoot.js <phase>` screenshots and audits 65 surfaces:
  - the popup on all three tabs (Bengali and English, both colour-scheme preferences, and English at 200%)
  - the setup page at 1280x720, 1366x768 and 1920x1080 (both languages and schemes, plus 1280x720 at 200%)
  - the floating control collapsed, open, with the preview, an info toast, an error toast and the coach mark, each in six theme and page combinations (glass, dark and light on light and dark pages)
- `tests/ui/audit-lib.js`, inside the page:
  - **contrast**: every visible text and icon, against what is actually painted under its centre (so the sliding pill behind a segmented button counts). Semi-transparent layers are composited down to the page, and a gradient is judged by its worst stop.
  - **clipping**: elements that hide overflowing text
  - **window edge**: text running past the edge of the window
  - **overlaps**: interactive elements that overlap
  - **scrollbars**: on the page itself
  - **hit areas**: walking out from the centre with `elementFromPoint`, so an invisible enlarged hit area counts and a neighbour covering one is caught
  - **focus rings**: by tabbing through and reading the computed outline
  - **motion**: under `prefers-reduced-motion`
- `tests/ui/summary.js` and `tests/ui/tokens.js` summarise the report and
  count the design values.
- Screenshots: `docs/ui-audit/before/` and `docs/ui-audit/after/` (65 each,
  same names), proposals in `docs/ui-audit/proposals/`.

**About light and dark.** The popup and setup page are dark only
(`color-scheme: dark`, no light palette), so their light and dark captures are
identical; that is shown, not hidden. The floating control has its own
themes, and those are what light and dark mean for it. A light mode for the
pages is proposal C.

**About fonts.** This headless Linux has only a fallback Bengali font, so
Bengali renders more crudely in the screenshots than on your machine. Layout
measurements hold; glyph shapes do not.

## Contrast

1,211 text and icon checks after the fixes, 1,182 pass. The other 29 are all
the logo mark (white on the tile's `#4aa8ff` end, 2.52:1), which is settled,
and logos are exempt from both WCAG contrast rules.

| Surface | Checks | Lowest before | Failing before | Lowest after | Failing after |
|---|---|---|---|---|---|
| Popup, 3 tabs, both languages | 304 | 3.11 | 72 | 4.62 | 0 |
| Popup at 200% | 76 | 3.11 | 18 | 4.62 | 0 |
| Setup, 3 sizes, both languages | 540 | 3.43 | 72 | 4.63 | 0 (+12 logo) |
| Setup at 200% | 90 | 3.43 | 10 | 4.63 | 0 (+2 logo) |
| Control, collapsed | 12 | 13.37 | 0 | 13.37 | 0 |
| Control, open (labels showing) | 48 | 4.27 | 2 | 5.89 | 0 |
| Control, preview | 54 | 3.76 (large text and icons, need 3) | 0 | 3.76 | 0 |
| Control, info toast | 18 | 13.37 | 0 | 13.37 | 0 |
| Control, error toast | 18 | 6.04 | 0 | 6.04 | 0 |
| Control, coach mark | 36 | 3.37 | 6 | 4.74 | 0 |

One caveat on the "before" column: `docs/ui-audit/before/report.json` was
taken before I fixed one artefact in my own harness (it composited text
below the fold of the zoomed setup page onto white instead of the page's
dark canvas). It reports a 1.16:1 there that never existed; the table leaves
it out and shows the real lowest, 3.43.

## Defects fixed

| What was wrong | Measured | Now | Screenshots |
|---|---|---|---|
| Popup `--faint` grey: section labels, hints, credit | 3.11:1 on the panel (needs 4.5) | `#7e8593`: 4.63 to 5.25 | `popup-main-bn-dark.png`, `popup-look-*` |
| Setup `--faint` grey: closing line, footer, version | 3.43:1 | `#7d8392`: 4.63 to 5.27 | `setup-1280x720-*` |
| White text on the brand gradient (active tab, segmented pill, Open setup) | 3.99:1 at the `#7c6cf0` end | that end `#7263dd` where text sits on it: 4.61 | `popup-*` |
| Coach mark button, white on a lightened chip | 3.37:1 | darker chip: 4.74 | `control-coach-*` |
| Shortcut text in the control's labels, light theme | 4.27:1 (60% opacity) | 70%: passes (worst now 5.89 in that state) | `control-open-light-on-light.png` |
| Header switches (on everywhere, this site) | hit area 42x24 | 54x40, no visible change | `popup-*` |
| Popup tabs | 37 tall | 41 | `popup-*` |
| "Change shortcuts" links, author credit links | 15 to 20 tall | 40+ | `popup-main-*`, `setup-*` |
| Coach mark button | 32 tall | 42 | `control-coach-*` |
| Link focus rings | the browser's thin default, unlike every other control | 2px `--brand2`, like the rest | (focus state, not in the static shots) |
| Popup under reduced motion | 13 transitions and the pane animation still ran | none | |
| Setup under reduced motion | 6 transitions still ran | none | |
| English: "Built byMd Rashadul Islam" (popup and setup footer) | translation dropped the space before the link | "Built by Md Rashadul Islam" | `popup-main-en-*`, `setup-*-en-*` |

Clipping, text past the window edge, overlapping controls and horizontal
scrollbars: **none**, in either language, at 100% or 200%. (A first pass
reported many at 200%; that was my own model of the zoomed popup window,
corrected before the "before" set was taken.) The setup page fits without
scrolling at 1280x720 and scrolls rather than clips at 200%.

**Consistency drift fixed**, picking the value already used most:
- Popup: "Open setup" used `.2s` where the other six feedback transitions use `.22s`; and `.change` and `.unset` (mine, from the shortcuts work) used 12px where the rows beside them use 12.5px.
- Setup: the card border's `.4s` became `.35s`, and the progress bar's `.25s` became `.3s`, the page's common durations.

**Left as found.**
- The control's durations spread over eleven values (`.09s` to `.35s`), but each belongs to a motion you tuned, and the steps between them are 10 to 50 ms. I do not count that as drift worth touching.
- The popup and setup cards differ (20 against 18 px radius), and so does `kbd` (7 against 6). These are different surfaces with no majority between them.

Each fix has a failing test first: run against the code before today,
`tests/ui-audit.test.js` fails 15 of its 30 tests (every popup and setup
surface, the coach mark, the light theme's open labels, and both reduced
motion checks), and the space bug has its own test in `tests/pages.test.js`.

## Tests added

`tests/ui-audit.test.js`, 30 tests on 27 surfaces:
- **Contrast**, apart from the logo.
- **No clipping, no text past the edge, no overlaps, no horizontal scrollbar.**
- **Targets of 40 px or more**, except the packed rows in proposal A.
- **A focus ring on every tab stop.**
- **Nothing moving under reduced motion.**
- **A screenshot compared pixel by pixel with a baseline.** It fails if 1% or more of pixels move. The PNG decoder is in `tests/ui/png.js`, so there's no dependency.
- **Per-platform baselines**, in `tests/ui/baselines/<platform>/`. A platform without baselines writes them on its first run, and `UPDATE_BASELINES=1` refreshes them after an intended change. Screenshots are taken with reduced motion on, so the caret blink and the listening ring cannot make them flaky. Two runs back to back passed.

Suite: 216 tests, 216 pass.

## Proposals, not in the code

Rendered by `tests/ui/mockups.js`, which injects CSS into the real popup and
measures it. Images in `docs/ui-audit/proposals/`, each with a `-now` and a
`-proposed` version.

**A. Every popup control at 40px** (`A-40px-targets-*`). The segmented
buttons are 30 tall and the switch rows 34, packed edge to edge, so no
invisible hit area fits without overlapping a neighbour. Making them 40 tall
clears all 14 remaining small targets, and grows the main tab from 641 to
659 px and the Look tab from 801 to 861 px. The popup is a desktop surface,
so this matters for touch-screen laptops, and it makes proposal B harder.

**B. The main tab inside Chrome's 600 px popup limit**
(`B-fits-600-main-*`). Today the popup scrolls on every tab: main 641 px
(English) or 639 (Bengali), Look 801 or 765. Trimming spacing that repeats
brings the main tab to exactly 600, so the first thing anyone sees has no
scrollbar:
- card padding 13 to 11
- the gaps between cards 10 to 8
- the header padding
- the label margins
- the shortcut list gap 7 to 5
- the bottom padding 14 to 10

The Look tab would still be 769 and would still scroll; fixing that means
moving something (the "which buttons to show" switches are the natural
candidate, to the setup page).

**C. A light mode for the popup and setup page** (`C-light-mode-*`),
following the system setting. The popup works with a palette swap: 0 new
contrast failures on main, 1 on Look. The setup page does not: the mockup
shows 11 failures, because the setup page hard-codes many colours instead of
using its variables. So this is real work, and the mockup shows where.

---

# Motion, 3 November

Feedback motion, added without changing the design. Full write-up with
sources in `MOTION.md`; frames in `docs/motion/`.

**Added:**
- **On the control:** a ripple on every press; a glow on the box where the words landed; a green ring on success; a shake on a refusal; one ring when listening starts; and the mic tilting toward the pointer, with a following highlight (the 3D).
- **In the popup:** a press-in on tabs, segments and swatches; switch thumbs that stretch while held; a pop on the chosen swatch.
- **On the setup page:** a pop on a step's badge when it is completed, and a sheen on a downloading pack.

**The design did not change, measured:** all 27 screenshot baselines from
the UI audit pass unchanged. To make that a strict check, the control's
surfaces are now opened with reduced motion from the start, so no effect is
caught mid-flight. On the first full run, the three "info toast" surfaces had
caught the new success glow (1.37% of pixels); that was the effect, not the
design.

**Found on the way:** the stylesheet's hover scale (`1.09`) and press scale
(`.93`) for the control's buttons have never applied, because
`.bar.on button` out-ranks both. Left alone: reviving them would change the
look you settled. The ripple is now the press feedback.

**Rules kept:**
- every effect is event-driven and ends; idle is still zero, by the performance tests
- transform and opacity only
- no blur
- off under reduced motion, where the toast and colours still carry the meaning
- the shadow root returns to its resting size

**Tests.** `tests/motion.test.js`, 11 tests (9 failed before the code).
Suite: 227 tests, 227 pass.

**For you to judge by hand:** how it feels, the tilt above all. If it wants
to be calmer, it is one number in `tilt()`.

---

# When the control shows, 3 November

**The problem you saw:** the control appeared on YouTube, news sites and
while browsing. Found in the code: it appeared on the first focus in any box
and **nothing ever hid it again**, so one click in YouTube's search box left it
on screen through the video.

**Researched:** Grammarly and LanguageTool rely on per-site off lists;
LanguageTool users ask for "only on a few sites", and the forum shows that
turning it off everywhere to allow a few has side effects. A fixed allow-list
by default would break "any box on any site" (forms, Facebook, email, Docs)
and need a list kept up to date for ever, so it is an option, not the default.

**Built:**
1. **Follows focus.** Hides 2 s after focus leaves the box. Not while
   dictating, while the pointer or keyboard focus is on it, or while the
   preview or welcome card is open.
2. **Smart (default): search boxes stay quiet.**
   - **What counts as a search box:**
     - `type=search/url/email/tel`, or `role=searchbox/combobox`
     - inside a `role=search` area
     - a search hint in the label or placeholder, or a name like `q` or `search_query`
     - this covers YouTube's and Google's search boxes, and WhatsApp's chat search
   - **The control appears there only** when the user types at least two words, at least one of them a dictionary Bangla word, and no more than half of them English-looking. "bangla gaan" brings it; "weather tomorrow london" does not.
   - **Shortcuts work in every box**, quiet or not.
3. **Popup, Look tab: "When it shows":**
   - **Smart**
   - **Every box** (the old behaviour)
   - **Chosen sites** (only where the "this site" switch is on). It starts with 12 chat, AI and email sites.

**Design:** the popup's Look tab gains one row, so its two screenshot
baselines were refreshed on purpose; every other baseline is unchanged.

**Storage:** two new keys, `showMode` and `allowSites` (the second is the
user's own list); `PRIVACY-FACTS.md`, the privacy policy in both languages and
the storage-key test are updated. No `SCHEMA` change: no existing default
moved.

**Also measured, at your request: does Ukti slow page loads?**
- **No measurable slowdown from recent builds.** Medians of 25 reloads, in two rounds: the current build loads like 1.0.1, and like an extension whose content scripts are empty. Any content script adds 20 to 50 ms to the full `load` of a heavy page; first paint is unchanged.
- **With a box focused at load,** Ukti's control setup (about 25 layout passes) happens after the `load` event, never before it. A new test in `tests/perf.test.js` pins that.
- You then confirmed the slowness was your network.

**Tests.** `tests/visibility.test.js`, 19 tests; 11 failed before the change
(the 8 that passed guard what already worked). Suite: 247 tests, 247 pass.

---

# Bug: English back to Bangla came out jumbled, 3 November

**Reported:** after EN turned Bangla into English, pressing অ on that English
gave a jumble or an error; undo worked.

**Cause, reproduced:**
- অ asks `classify()` whether the box holds Banglish (transliterate) or English (translate).
- It called a sentence English only if **not one word** was in the Bangla dictionary. Translator output nearly always has one: "Bangla" itself, "to" (also তো), "boy" (folds to boi, বই).
- So the English was transliterated: "I speak Bangla every day" became "I speak বাংলা every day", and "I want to go home" became "I want তো গো হমে". These are the actual outputs, from `tests/translate.test.js` with a stand-in Translator in the offscreen document.
- With the English-to-Bangla pack missing, no message appeared either, because the translator was never asked.

**Fix (`banglish.js`, `classify()` only):**
- A word in the English list counts as English before the Bangla dictionary is checked.
- A mostly-English sentence may contain one Bangla-looking word, or a fifth of its words.
- Capitalised words in mid-sentence (names such as Rahim, Dhaka) are not counted either way.

**Tests:**
- `tests/translate.test.js`, 3 tests: the two round trips, and the missing pack. All 3 failed before.
- Two new tests in `tests/banglish.test.js`:
  - eight English sentences a translator would write must count as English (failed before)
  - every Banglish sentence in the corpus, 66 of them, must still count as Banglish (passes, a guard)
- Corpus scores unchanged.
- Suite: 252 tests, 252 pass.

**Could not verify from here:** Chrome's real translator. The stand-in
returns fixed sentences; the real one may phrase things differently, which
is why the classify tests use eight varied sentences, not only these two.

---

# Why a different word appears: the split, measured first

**The complaint:** the user says one thing and a different word appears.

## Where our code touches dictated words

The speech service returns **Bangla script directly** (`lang = 'bn-BD'`,
`offscreen.js`). So **our Banglish transliteration is not in the dictation
path at all**; it runs only when someone presses অ on typed Banglish. Between
the speech service and the box, our code does two things to every dictated
segment (`processSegment` in `offscreen.js`):
- the **filler cleaner** (`cleanFillers`, **on by default**)
- the user's **replacement list**

## The split

| Cause | Dictation, Bangla | Dictation, English | Typed Banglish (অ) | Measured | Ours to fix |
|---|---|---|---|---|---|
| 1. Google's recognition mishears | yes | yes | no | not from here | no |
| 2. Our transliteration | **no** | no | yes | 57.7% held-out word accuracy (task 2) | yes |
| 3. Chrome's translation | no | yes | with EN | not from here | no |
| **4. Our filler cleaner** | **yes, by default** | yes | no | **23 of 25 legitimate sentences damaged** | **yes** |
| 5. Replacement rules applied as substrings | yes | yes | no | a rule "কি = কী" damages 8 of 628 corpus words | yes |

## Cause 4, measured

`tests/corpus/fillers.tsv` holds 33 spoken sentences: 25 with a legitimate
use of a pattern the cleaner removes, and 8 with a real filler. Run through
the real `cleanFillers()`:
- **Legitimate uses left intact: 2 of 25.** The patterns have no word boundaries, so they match inside words:
  - "আর কিছু লাগবে" (anything else?) becomes **"ছু লাগবে"**
  - "সে কি বলেছে" becomes **"সে ছে"**
  - "আমি বুঝলাম না" becomes **"আমি ম না"**
  - "আপনি কি বলেন" becomes **"আপনি ন"**
  - "সে আর কিনবে না" becomes **"সে নবে না"**
  - "আমি ইয়েমেনে থাকি" becomes **"আমি মেনে থাকি"**
  - "মনে হচ্ছে যে আজ বৃষ্টি হবে" loses "হচ্ছে যে" and its meaning
- **Real fillers cleaned right: 6 of 8**; the other two leave a space before the punctuation.
- **On the task 2 corpus's own correct Bangla:** 1 of 628 words damaged, "বুঝলাম" to "ম". The corpus is built from Banglish, so it rarely holds these phrases; the targeted set is the better measure.

## Cause 5, measured

A user who writes "কি = কী" (a common spelling preference) turns "কিছু"
into "কীছু", "কিন্তু" into "কীন্তু" and "থাকি" into "থাকী". That is 8 of 628
corpus words.

## Causes 1 and 3, from published work (not verified for Google's own systems)

- Bangla recognition word error rates of about 5 to 11% are reported for
  systems fine-tuned on clean read speech
  ([wav2vec 2.0, 11.27%](https://dspace.aiub.edu/jspui/handle/123456789/2661),
  [Bengali Common Voice](https://arxiv.org/pdf/2206.14053)). I found no
  figure for Google's Web Speech service, and real conversational speech is
  harder than read speech.
- English to Bengali machine translation scores about 50 chrF++ for Google
  on FLORES-200 ([arXiv 2404.13813](https://arxiv.org/pdf/2404.13813)).
  Translation errors only matter in English output mode.

## Which dominates

For dictation into Bangla, the only causes are 1, 4 and 5.
- Cause 4 is on by default, fires on some of the most common words in spoken Bangla, and produces wrong words that are not even words ("ছু", "ম", "ছে").
- I cannot measure cause 1 from here and will not collect dictation to do so.

So the claim I can support: **every time the user says one of these common
phrases, cause 4 alone guarantees a wrong word**, and it is the only cause
that is ours, measurable and fixable today. Cause 1 is real and permanent,
and is what the local learning below is for.

**Order of work, following from this:**
1. fix the filler cleaner
2. apply replacements as whole words
3. build learning on top

---

# Local learning, 3 November

The split came first (section above).

## Fixed: causes 4 and 5, both ours

- **Filler cleaner:**
  - fillers now match whole words only
  - the tag fillers count only at the end of a clause
  - "কি বলে" and "হচ্ছে যে" are dropped, since they are grammar
  - **25 of 25** legitimate sentences intact (was 2), **8 of 8** fillers cleaned (was 6), 0 of 628 corpus words damaged (was 1)
- **Replacements:** applied to whole words, so "কি = কী" no longer touches "কিছু"; phrases of several words still match. This changes how existing manual rules apply, deliberately, since a rule eating the inside of other words is never wanted.

## What counts as "the user corrected a word"

| Signal | Chosen? | Why |
|---|---|---|
| Replacing a word Ukti just wrote | **built** | reliable and narrow: only the box Ukti just wrote into, only for 2 minutes, only edit events on that box, only a swap of 1 to 3 of Ukti's own words |
| Adding a rule by hand | already there | explicit; same store |
| Undo then retype | rejected | people retype whole sentences, so the corrected word cannot be told; it would mean watching typing that is not Ukti's |
| Watching all typing | rejected | that is watching everything the user types |
| A "teach" shortcut on a selected word | rejected | undiscoverable, and a new key |

Ignored on purpose: deletions, insertions, edits outside Ukti's words,
rewrites over 3 words, and a pair already declined on this page.

## The flow

1. The user fixes the word as they normally would.
2. A card asks: "Remember this? Next time X becomes Y". In Bengali: মনে রাখব? পরেরবার X শুনলে Y লিখব।
3. **One click on "Yes, remember"** stores it. Nothing is stored before that.
4. The next dictation applies it.

## Where it lives

- The same local `replacements` list.
- The popup's Words tab, plus a new page, `words.html` (linked from that tab), with every correction editable and deletable.
- Export to a dated JSON file, and import of that or plain "heard = becomes" text: merged by the heard word, with files over 1 MB, over 2,000 rules or with words over 200 characters refused, and nothing changed on a refusal.
- No server, no network call, no permission (the download is an ordinary link).
- `PRIVACY-FACTS.md` and the policy (both languages) now say exactly what is watched and stored.

## Found on the way, two of them real

- **Lexical-style editors (WhatsApp) fire no `input` event when typed in:** they take every keystroke at `beforeinput`. The watcher listens to `beforeinput` and `compositionend` too; without that, learning would never trigger on WhatsApp.
- **Dictation into the Quill-like mimic (the archetype CLAUDE.md gives for Gemini) leaves the box empty.** `insertText()` tries a synthetic paste and checks immediately; this editor accepts the paste and reverts it a tick later. Only `replaceAll()` (conversion) has the async per-strategy check from CLAUDE.md item 1, and the dictation path does not. I did not change the insertion engine, as instructed. The mimic may be stricter than the real Gemini. **Please dictate a sentence into Gemini and see whether it stays.** Recorded as a `todo` test in `tests/learning.test.js`.

## Tests, written first

- `tests/cleaning.test.js`: 5 tests, all failed before.
- `tests/learning.test.js`: 9 tests (5 failed before; the 4 that passed guard the no-offer cases), plus the Gemini-shape todo.
- `tests/corrections-page.test.js`: 8 tests, all failed before.
- The popup's Words tab gained one link, so its two baselines were refreshed.
- Suite: 275 tests, 274 pass, 1 todo.

## Research, not built

In `RESEARCH.md`:
- **Grammars:** ignored by Chrome, and being removed from the specification.
- **`phrases` (contextual biasing):** is the right tool, but needs on-device Bangla, which I found no sign of **(verify)**.
- **On-device models:** none documents Bengali. The Prompt API lists English, Japanese and Spanish **(verify)**.
- **For you to try:** two console lines are in `RESEARCH.md` to check on your machine.

**One flaky test, not identified.**
- **What happened:** the first `scripts/package.sh` run refused to build because one test failed inside its own run of the suite.
- **Reruns pass:** both a direct `npm test` straight after and a second packager run passed with 0 failures.
- **Why it is unknown:** the packager printed only the totals, so I do not know which test it was.
- **Now:** the packager names every failing test, so the next occurrence will say which one.
- **Built:** `dist/ukti-1.0.1.zip`, 19 files, 104.1 KB (now with `words.html` and `words.js`), loaded and started.

---

# Bug: অ after EN gave a re-translation, not the user's words, 3 November

**Reported, with these sentences:**
1. "আচ্ছা দেখি তো এখন ঠিক মতন কাজ করে নাকি" became, with EN, "Well now it works fine".
2. Then অ gave "ভাল এখন এটা ভাল কাজ করে", not the original. Only undo brought the original back.

**Cause:** not a bug in translation. অ translated the English back, and a translation back is never the original wording. Reproduced word for word with a stand-in translator.

**Fix (`content.js`):**
- Ukti remembers its last *translation* in each box (original, result, direction), in page memory only, never stored.
- Pressing the opposite button while the box still holds exactly that result puts the original back, with no call to the translator.
- An edited result is translated as before.
- Banglish to EN to অ returns the Bangla form of what was typed.
- **A hole in my first version, caught by a test before shipping:** Banglish to অ (transliteration) to EN would have handed the Banglish back instead of English. Transliteration is now not reversible that way; EN translates.

**Tests:** 5 new in `tests/translate.test.js`.
- 3 failed before: the reported sentence gave "ভাল এখন এটা ভাল কাজ করে"; Banglish, EN, অ stayed "?আমি ভালো আছি"; and the hole gave "ami bhalo achi".
- 2 passed before as guards: an edited English is translated; English, অ, EN.
- Suite: 280 tests, 279 pass, 1 todo (the Gemini-shape dictation finding).
