# Overnight progress

## Read this first

(Summary is written at the end of the night. If this line is still here, the
run stopped early; the sections below are complete for every task listed.)

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
