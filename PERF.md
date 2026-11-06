# Performance

Ukti injects a content script into every frame of every page. This file
records what that costs, measured, and the budget the test suite holds it to.

Measured 2026-11-03, Chromium 153 headless on the cloud test machine, with
`node tests/perf.js`. Absolute times depend on the machine; the zeros and the
ratios are what matter. The budget is enforced by `tests/perf.test.js`.

## Measured

| Measure | Before tonight | Now | How |
|---|---|---|---|
| `banglish.js` parse + execute, median of 15 cold loads | 1.2 ms | **0.5 ms** | fresh page per run, unique source so no code cache |
| `content.js` parse + execute, median | 1.6 ms | 1.6 ms | same |
| Heap per ordinary frame (20 iframes) | 259.6 KB | **235.9 KB** | `Runtime.getHeapUsage` after two GCs, with and without the extension |
| ...of which Chrome's isolated world | 178.6 KB | 178.6 KB | same, with both scripts emptied |
| ...of which Ukti | 81 KB | **57 KB** | the difference |
| Heap per tiny frame (1x1 tracking pixel) | 259.6 KB | **192.0 KB** (Ukti 13 KB) | 21 pixel frames |
| Messages to the service worker on page load | 1 per frame (11 for a page with 10 iframes) | **0** | listener in the worker counting |
| Idle, control never shown, 3 s | 0 script, 0 layouts, 0 style recalcs, 0 mutations | same | `Performance.getMetrics` deltas, MutationObserver on the document and the shadow root |
| Idle, control shown and left, 3 s | same zeros | same | same |
| Shadow DOM size | 49 elements | 49 | counted after the control is built |
| Heavy page, 16,008 elements: focus to control | 104 ms wall, 3.3 ms script | same | `ScriptDuration` delta around the click |
| Heavy page idle, 3 s | zeros | zeros | as above |

Task-time deltas over 3 idle seconds were 2 to 5 ms with or without the
extension (3.43 ms on a plain browser), so the idle zeros are real and the
small task time is Chrome's own.

CLAUDE.md quoted 56 shadow DOM nodes. This count is 49 elements
(`querySelectorAll('*')` in the shadow root, so text nodes and the root are not
counted); the method, not the control, accounts for the difference.

## What changed

1. **Settings are read from `chrome.storage` directly.** `loadSettings()` used
   to send `GET_SETTINGS` to the service worker, so every frame of every page
   woke the worker on load, before the user had done anything. Content
   scripts can read storage themselves. Now 0 messages on load.
2. **The Banglish engine is built on first use.** `banglish.js` wraps its body
   in `build()`, run the first time `convert` or `classify` is called. Every
   frame still parses the file, but only a frame where someone presses অ or
   EN builds the dictionary. Corpus scores unchanged (`npm run corpus`).
3. **Frames too small to hold a text box skip setup.** A sub-frame under
   60x24 at load sets up nothing but a `resize` listener, and sets itself up
   if it grows. Tested both ways: tiny frames cost less, and a frame that
   starts at 1x1 and grows to 500x200 gets the control.

## The budget

Held by `tests/perf.test.js`. A change that breaks one of these should either
be fixed or come with a reason to move the line.

| Rule | Limit | Why this number |
|---|---|---|
| Idle, never shown and shown | 0 layouts, 0 style recalcs, 0 mutations, at most 1 ms script per 3 s | an idle extension must cost nothing; 1 ms absorbs timer noise |
| Messages to the worker on load | 0 | waking a worker per frame is pure waste |
| Shadow DOM | at most 55 elements | room for one more button, not for creep |
| Parse + execute, both scripts | median under 8 ms | about 3x today's 2.1 ms, for slower machines |
| Heap per ordinary frame | at most 250 KB | Chrome's 179 KB floor plus 71 KB for Ukti (57 today) |
| Tiny frame | at least 20 KB below an ordinary one | the skip must keep working |
| Heavy page, focus to control | under 25 ms of script | about 7x today's 3.3 ms |

## Not measured

- **A real heavy site.** A cloud session cannot fetch one, so "heavy" is a
  synthetic page of 16,000 elements (`tests/pages/heavy.html`). A saved copy
  of a real page would be a better test; I had none to use.
- **A slow machine.** These numbers come from a fast cloud host.
- **The cost of the isolated world itself** (179 KB per frame) is Chrome's.
  The only way to avoid it is not to inject: `activeTab` plus injection on
  demand, which PRIVACY-FACTS.md discusses for the install warning. It would
  fix both at once, at the cost of the control appearing by itself.
