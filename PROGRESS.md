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
