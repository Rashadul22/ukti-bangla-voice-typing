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
