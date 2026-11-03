# What to add next: feature research, 3 November

Research only. Nothing here is built. It builds on `RESEARCH.md` (task 8)
and keeps the same bar: a real user problem, **no new permission, no network
call, nothing leaves the machine**, no busier control, and still easy to
understand.

## How this was done, and its limits

Web searches on current voice typing products and Chrome's APIs. Most
"best dictation extension" pages are SEO lists of little value. Product
pages and official docs were weighted above them. `developer.chrome.com`
could not be opened from this session (the network blocks it), so the
status of Chrome's built-in AI APIs comes from search snippets of that site
and from MDN. Treat those rows as "check before building".

## What the market does now

- **Spoken punctuation and line breaks are standard** in the English tools:
  Voicemate (updated March 2026) responds to "full stop", "new line" and
  "new paragraph"
  ([Voicemate](https://chromeboard.com/extension/voicemate-voice-to-text-goifpingamemmccpmcmkkkhaggjageog));
  VoiceType lists voice punctuation, custom voice commands and custom names
  as its key features
  ([VoiceType](https://chromewebstore.google.com/detail/ilnfjioebpepmbmgkaccfhllddmmppng)).
  Some tools also undo the last phrase by voice
  ([Voice Control Pro](https://voicecontrol.pro/blog/voice-to-text-chrome/)).
- **The leading paid product, Wispr Flow,** sells four things: a personal
  dictionary that learns when you type over a mistake (Ukti now does this,
  locally), **snippets** (say a trigger phrase, get a saved block of text),
  a **command mode** to edit by voice, and tone per app
  ([Wispr Flow docs](https://docs.wisprflow.ai/articles/5096240724-navigating-the-wispr-flow-app-desktop-ios-and-android),
  [eesel overview](https://eesel.ai/blog/wispr-flow-overview)). Its
  dictionary syncs through its servers; Ukti's would not.
- **On-device speech recognition** is now in the Web Speech API:
  `processLocally`, `SpeechRecognition.available()` and `install()`
  ([MDN, available](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/available_static),
  [MDN, install](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/install_static)).
  No source says which languages Chrome offers on the device. Whether
  Bangla is one of them can only be learnt by calling `available()` on a
  real machine.
- **Chrome's Prompt API (Gemini Nano)** lists English, Japanese, Spanish,
  German and French; Bengali is not named
  ([Chrome docs, via search](https://developer.chrome.com/docs/ai/prompt-api)).
  Proofreader, Writer and Rewriter appear to still be in trials
  ([Chrome built-in AI](https://developer.chrome.com/docs/ai/built-in-apis)).
  So no "AI tidy-up" for Bangla yet.

## Candidates, best first

| # | Feature | What the user gets | Cost | Risk | Bar |
|---|---|---|---|---|---|
| 1 | **Spoken punctuation and new line** | Say "দাঁড়ি", "প্রশ্নবোধক", "নতুন লাইন" and get । ? or a line break. Chrome's Bangla recognition gives almost no punctuation, so today every sentence runs into the next. | Low: a word list in the offscreen pipeline, next to the filler cleaner, with a test corpus like `fillers.tsv` | কমা also means "reduce". Only safe forms (a command said on its own, or at the end of a sentence, or a two-word form such as "কমা দাও"), designed with native speakers. Off by default. | Passes |
| 2 | **Voice snippets** | Say "আমার ঠিকানা" alone and the saved address goes in. Phone number, email signature, a standard reply. | Low: the same local list and page as the word fixes, matched only when the whole sentence is the trigger | A trigger said in a real sentence must not fire; matching the whole utterance only avoids that | Passes |
| 3 | **On-device recognition, if Chrome offers Bangla** | The voice never leaves the computer. This would remove the one big privacy caveat. | Medium, *if* available: a check, a setup step to install the pack, a fallback | Experimental API; Bangla may simply not be offered. Needs a 2-minute test on your machine first (below). | Passes; removes a network path |
| 4 | **Voice commands for editing** | "মুছে দাও" removes the last sentence Ukti wrote, "পাঠাও" sends. | Low for undo (the undo stack already exists), low for send (auto-submit exists) | Same false-trigger risk as #1; whole-utterance only | Passes |
| 5 | **Bangla or English digits** | ১২৩ or 123, as a setting | Low | Low | Passes, popup only |
| 6 | **Start and stop sounds** | A soft tone when listening starts and stops, for anyone not looking at the screen, and for screen reader users | Low: Web Audio, generated locally, no files | Some find sounds annoying: a setting, off by default | Passes |
| 7 | **Session history, in memory only** | The last ten sentences in the preview, to copy again if a box lost them. Gone when the tab closes. | Low to medium | Keeps dictated text around longer; must never touch storage, and the privacy test must check that | Passes, with care |
| 8 | **Banglish as you type (Avro style)** | Type "ami bhalo achi" and each word becomes Bangla on space, in any box | High: per-word handling inside every kind of editor, which is exactly the insertion engine's hard part | Breaks editors in subtle ways; the engine is on the do-not-regress list | Strong demand, but a project of its own |
| 9 | Speak English, get Bangla | English speech translated into Bangla on the device | Low to medium: the Translator already does en to bn | No evidence anyone asked | Weak on demand |
| 10 | Right-click "convert to Bangla" | Convert selected text from the menu | Needs the `contextMenus` permission | Breaks the no-new-permission rule | **Fails** |
| 11 | AI tidy-up of Bangla | Gemini Nano fixes grammar | High | Bengali not supported by the Prompt API (as listed), heavy model, rewrites the user's words | **Fails for now** |

## Recommendation

1. **Build #1 and #4 together** as "voice commands": a short, fixed list,
   off by default, whole-utterance or end-of-sentence only, with a test
   corpus of real sentences that must **not** trigger. This is the biggest
   everyday gap compared with every English tool, and it is cheap.
2. **Then #2, snippets.** It reuses the word-fix list and page, so it costs
   little and matches Wispr Flow's most-praised feature without a server.
3. **Run the #3 spike on your machine** before any work: open the offscreen
   document's console and run
   `SpeechRecognition.available({ langs: ['bn-BD'], processLocally: true })`.
   If it answers anything other than `"unavailable"`, this becomes the top
   item, because "your voice stays on your computer" is the strongest
   promise Ukti could make.
4. **Quick wins any time:** #5 digits and #6 sounds.
5. **Not now:** #8 is worth a separate plan of its own; #10 and #11 break the
   rules or do not support Bangla.

## Not verified from here

How often people would use each feature; no user data exists. Whether
Chrome offers Bangla on-device recognition. The Chrome AI API status, from
search snippets only, because `developer.chrome.com` is blocked in this session.
