# Privacy facts

What Ukti does with what it can see, established from the code (file and
line) and checked by tests where a test can check it. The privacy policy in
`store/` is written from this file, not from the README. If the code changes,
change this file first and the policy second.

Line numbers are as of the commit that added this file.

## Speech

- **Where the audio goes.** `offscreen.js:470-472` creates a Web Speech
  `SpeechRecognition` with `lang = 'bn-BD'` (`offscreen.js:9`). Chrome sends the
  audio to Google's speech service to be transcribed; this is Chrome's
  documented behaviour for the Web Speech API, not something Ukti controls.
  It cannot be observed from a cloud test session, which has no microphone
  and no route to Google.
- **Continuous, not per utterance.** `continuous = true` (`offscreen.js:471`),
  and when the service ends a session Ukti opens a new one
  (`scheduleRestart`, `offscreen.js:373`). So for as long as the microphone
  button is red, audio is flowing to Google, silences included. It stops when
  the user presses stop, presses Escape, turns Ukti off for the site or
  everywhere, closes the tab, or navigates away (the last three fixed and
  tested in task 3, `tests/lifecycle.test.js`).
- **The second microphone stream.** `offscreen.js:232` opens a second stream
  only to measure loudness for the animated button. It goes into a local
  `AnalyserNode`; only a number between 0 and 1 leaves it
  (`emit('LEVEL')`, `offscreen.js:258`). It is never recorded or sent.
- **Nothing is retained locally.** No audio is written anywhere. Transcripts
  pass through memory as messages between the offscreen document, the service
  worker and the page. `tests/privacy.test.js` dictates a sentence and checks
  it is in neither `chrome.storage` nor the page console afterwards.
- **Retention on Google's side** is governed by Google, not by Ukti, and is
  not something this project can verify.

## Translation

- `Translator.availability` then `Translator.create` (`offscreen.js:114`,
  `offscreen.js:119`). Chrome's Translator API runs the model on the device.
- **When a pack is missing** the pair reports `downloadable` and `create()`
  throws `NotAllowedError` without a user click; Ukti reports "the language
  pack is needed, open Setup" and, in English output mode, inserts the Bangla
  instead (`processSegment`). There is no fallback to any online translator.
- **The pack download itself** is a network transfer, made by Chrome from
  Google when the user presses Download on the setup page. It carries the
  model to the machine; it does not carry the user's text.
- Translators are released after two idle minutes (`scheduleRelease`,
  `offscreen.js:95`).

## Banglish conversion

Entirely inside `banglish.js`: rules and a dictionary. No API, no network.

## What Ukti's own code sends

Nothing. `tests/privacy.test.js` checks every code file for `fetch`,
`XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `importScripts`
and remote `src`, and checks the pages load nothing from outside the
extension. The only external links are the author's name on the popup and
setup page, which load nothing until clicked.

Since 1.1.0 Chrome enforces this for Ukti's own pages (popup, setup,
corrections page, offscreen document): the manifest's content security
policy has `connect-src 'none'`, so a network request from them is refused
by the browser, not just absent from the code (`tests/security2.test.js`
makes one and sees it refused). The content script runs under each page's
own policy, so for it the code check above still is the guarantee.

## chrome.storage.local, every key

All stored by Chrome on the user's machine. `tests/privacy.test.js` fails if a
key outside this list appears.

| Key | Holds | User content? |
|---|---|---|
| `outputMode` | `bangla` or `english` | no |
| `cleanFillers` | on or off | no |
| `autoSubmit` | on or off | no |
| `uiSize`, `theme`, `layout`, `barCorner`, `showHints` | look of the control | no |
| `buttons` | which buttons show | no |
| `barPos` | where the control was dragged to | no |
| `uiLang` | `bn` or `en` | no |
| `enabled` | the master switch | no |
| `disabledSites` | hostnames where the user turned Ukti off | **yes, a list of sites the user chose** |
| `replacements` | the user's own "heard = becomes" word fixes | **yes, typed by the user** |
| `showMode` | when the control appears: smart, every box, or chosen sites only | no |
| `allowSites` | in "chosen sites only" mode, the sites the user chose (starts with a list of chat, AI and email sites) | **yes, a list of sites the user chose** |
| `useCount` | how many times a button was used, so the labels can retire | no, a number |
| `uses` | how many times dictation was started, so the popup can ask for a store rating once after real use | no, a number |
| `rateDone` | the rating request was answered (either way) and will not appear again | no |
| `voiceCommands`, `mixedEnglish`, `sounds` | on or off | no |
| `digits` | `asis`, `bn` or `en` | no |
| `recogLang` | `bn-BD` or `bn-IN`, the accent Chrome's recogniser is asked for | no |
| `snippets` | the user's own "say this = put this" texts | **yes, typed by the user** |
| `coachDone`, `setupDone`, `micGranted` | first-run flags | no |
| `schema` | settings version, for migration | no |

Defaults are in `background.js:58` (`getSettings`). Written from
`popup.js`, `setup.js:56`, `setup.js:139`, `background.js:97` and the guarded
`save()` in `content.js`.

## Learning from corrections

- **What is watched:** after Ukti writes dictated words into a box, it listens to that one box's edit events (`input`, `beforeinput`, `compositionend`) for two minutes, and compares the box's text with what it wrote (`watchInsert`, `checkCorrection` in `content.js`). No other box, page or keystroke is watched.
- **What counts as a correction:** one to three of Ukti's own words replaced by others. A deletion, an insertion, the user's own words, or a larger rewrite is ignored.
- **What is stored:** nothing, unless the user presses "yes" on the offer. Then one `{from, to}` pair is added to `replacements`, the same local list as the user's own word fixes, visible and editable in the popup and on the corrections page (`words.html`). "No" is remembered only in the page's memory, for that page.
- **Export:** writes the list to a file the user saves wherever they choose (`words.js`). Import reads a file the user picks, refuses anything over 1 MB, over 2,000 rules or with a word over 200 characters, and merges by the heard word.
- **Nothing is sent anywhere.** `tests/privacy.test.js` covers `words.js` as well.

## The try-it box and "tell a friend"

- **The try-it box** on the setup page (step 3) uses the same path as any
  page: the worker starts the same offscreen recognizer for that tab. What
  is said shows in the box and is never stored; closing the page stops the
  microphone (`tests/growth.test.js`).
- **"Tell a friend"** writes a fixed sentence to the clipboard when pressed.
  It contains no user text and sends nothing (the test checks the page
  makes no request).

## Dictated or converted text that outlives the moment

- **The undo stack** (`pushUndo`, `content.js:791`) holds a copy of the box's
  text before each change, at most 20 entries (`content.js:794`), in the page's
  memory. It is gone when the page closes. It is never written anywhere.
- **The preview panel** shows the words while dictating and is emptied when
  dictation stops (`hidePreview` calls `resetPreview`, `content.js:578-585`;
  checked in `tests/privacy.test.js`).
- **The console.** Nothing. No file calls `console.*` (checked).

## What the page script can read

- **The install dialog says** "Read and change all your data on all
  websites". Measured with Chrome's own `getPermissionWarningsByManifest`,
  pinned in `tests/privacy.test.js`. The content script's `matches` cause it,
  not a permission: with the content script removed the list is empty.
- **What it does read:** the focused box's text when the user dictates into
  it or presses a button (`existingText`, `content.js:360`; dictation spacing
  at `content.js:1991`); the box's `type`, `autocomplete`, `name` and `id` to
  recognise sensitive fields (`content.js:121`); the box's position on screen;
  and the hostname, which the top frame tells the popup (`content.js:1951`).
- **What it could read and does not need to:** everything else on every page.
  The access is that wide because the control has to appear in any box on any
  site without the user doing anything first.

## Could the access be narrowed

Yes, at a cost to the product, so this is a recommendation and not a change:

- **`activeTab` plus `scripting`, injected on demand.** The install dialog
  would show no site warning at all. The cost: the control would no longer
  appear by itself when the user clicks into a box. The user would first press
  the toolbar icon or a keyboard shortcut on each tab. For a tool whose whole
  point is "click in a box and speak", that is a real loss, and it is the
  author's call.
- **Fewer frames.** `all_frames: true` puts the script in every iframe,
  including ads. It does not change the warning, but it changes how much runs.
  Task 9 looks at skipping frames too small to hold a text box.
- **`exclude_matches`** for banking and payment domains would not change the
  warning either, and no list would be complete; the per-field filter is the
  better defence. Task 11 tests that filter.

## Why it is free

The heavy work is Chrome's: speech recognition is the Web Speech API, and
translation is Chrome's on-device Translator. Ukti has no server, so it costs
its author nothing to run, and there is nothing to charge for or to pay for
with data.
