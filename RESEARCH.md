# What Ukti should become: research

Task 8, research half only. No feature was built, as asked.

## How this was done, and its limits

- Web search, in English and Bengali, on 3 November 2026.
- **Primary pages could not be opened.** This session's network policy
  blocked `developer.chrome.com` and `developer.mozilla.org`, so every claim
  about Chrome APIs below comes from search-result summaries of those pages,
  not from reading them. Each is marked **(verify)**. Allowing those two hosts
  in the environment's network settings would let a later session check them.
- **Little real complaint text was reachable.** Store review pages are not
  indexed in any depth, and aggregators had synced almost no review bodies.
  Where the evidence that users want something is thin, the table says so
  rather than inventing demand.
- Two findings come from measuring Ukti itself tonight, not from the web;
  they are marked **(measured)**.

## What the sources say

### Competitors

- **Avro for Chrome** is the most reviewed Bengali input extension; reviews
  are short and positive, praising that it works anywhere including
  Chromebooks, and that it works offline. Its last update was October 2024 and
  its own release notes mention people wondering whether the project was
  alive. Sources: [Chrome Web Store listing](https://chrome.google.com/webstore/detail/avro-অভ্র-for-chrome/lhkaiconcchjcnnikjdphljgfpjelpnj),
  [Extension Auditor](https://extensionauditor.com/scan/avro-for-chrome-lhkaiconcchjcnnikjdphljgfpjelpnj),
  [Wikipedia](https://en.wikipedia.org/wiki/Avro_Keyboard).
- **Google Input Tools** for Chrome is still listed (version 11.4.0.0,
  updated September 2025, about 4.0 stars from about 5,500 ratings), covers
  Bengali, and does not work in the address bar, the Web Store or inside other
  extensions. Users report it failing on particular web apps. Sources:
  [Chrome Web Store](https://chromewebstore.google.com/detail/mclkkofklkfljcocdinagocijmpgbhab?hl=zh-HK),
  [Google](https://www.google.com/intl/en-GB/inputtools/chrome/),
  [Typst forum](https://forum.typst.app/t/google-input-tool-extension-not-work-on-web-app/7941),
  [Orion feedback](https://orionfeedback.org/d/3110-google-input-tools-extension-not-working).
- **Ridmik** (mobile) is well regarded; its changelog shows a fixed bug where
  English words were turned into Bangla on backspace. Sources:
  [App Store](https://apps.apple.com/us/app/-/id1475531051),
  [APKMirror](https://www.apkmirror.com/apk/ridmik-labs/ridmik-keyboard/ridmik-keyboard-5-4-0-release/).
- **Bangla voice typing in the browser exists but is small.** "Unicode Bijoy
  Converter + Bangla Voice Typing" has about 587 users and 3 ratings, and
  combines the two things this research keeps returning to. Desh Keyboard's
  site offers voice typing "only on Google Chrome". Sources:
  [Chrome Web Store](https://chromewebstore.google.com/detail/jgdfkemkjajfkmnlammodkogachmoiba),
  [ExtScope](https://extscope.org/extension/jgdfkemkjajfkmnlammodkogachmoiba),
  [Desh Keyboard](https://www.deshkeyboard.com/bangla-typing).

**Where Ukti is different:** none of these is voice first, inside any box,
with on-device translation and a Banglish fallback in one control. The
nearest, the Bijoy converter with voice typing, is tiny.

### Problems people state

- **Punctuation by voice may not exist for Bengali.** Google's Gboard help says
  spoken punctuation "might not be available in all languages", and nothing
  found confirms it for Bengali. A Bengali-language search for voice typing
  writing "দাঁড়ি" or "কমা" as words found no direct answer. Sources:
  [Gboard help](https://support.google.com/gboard/answer/2781851),
  [Google Docs help thread](https://support.google.com/docs/thread/161917538/voice-typing-punctuation-commands-not-working?hl=en).
  A commercial Bengali dictation app advertises automatic Bengali
  punctuation, which suggests the gap is felt:
  [Soniox](https://soniox.com/soniox-app/for/teachers-voice-type-student-reports-in-bengali).
- **Bijoy is still in use.** Converter vendors say government offices and
  printing houses in Bangladesh still use Bijoy (SutonnyMJ) while the web is
  Unicode, so text has to move between the two. No government source was
  found, so treat this as indicative. Sources:
  [bangladatetoday](https://www.bangladatetoday.com/bijoy-to-unicode-avro-guide.php),
  [Peerlist project](https://peerlist.io/noorfatiima502/project/unicode-to-bijoy-converter),
  [Rising BD converter](https://www.risingbd.com/bangla-converter/),
  [Jugantor converter](https://jugantor.com/bn-converter).
- **Long dictation stops in Chrome.** A 2015 W3C list thread reports
  continuous recognition stopping after about a minute without an error,
  called a Chrome implementation issue; a later write-up puts it near two
  minutes and recommends restarting in `onend`, which Ukti already does.
  Sources: [W3C public-speech-api, May 2015](https://lists.w3.org/Archives/Public/public-speech-api/2015May/0000.html),
  [reply](https://lists.w3.org/Archives/Public/public-speech-api/2015May/0001.html),
  [Volcengine write-up](https://www.volcengine.com/article/2888825).
- **Broken Bangla rendering and input in browsers** recurs (Avro's extension
  was partly built to fix fonts; a Microsoft Q&A user could not type Bangla in
  the address bar with Avro or Bijoy). Sources:
  [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/4174073/problem-with-unicode-typing),
  [Wikimedia bug](https://phabricator.wikimedia.org/T38217).
- **(measured)** Ukti itself takes Ctrl+Shift+Z, B, E and Space from every
  page, which breaks redo in web editors and Chrome's bookmarks-bar shortcut.
  No user has said this yet because Ukti has no users yet; they would.

### Chrome APIs

- **On-device speech recognition** is specified: `SpeechRecognition.processLocally`,
  `SpeechRecognition.available()` (which reports "downloadable",
  "downloading" or "unavailable" for on-device languages) and
  `SpeechRecognition.install()` for language packs. MDN marks it
  experimental; a Google and Mozilla presentation from November 2025 calls it
  a proposal from TPAC 2024. Which Chrome version ships it, and whether Bangla
  is among its languages, was not found. **(verify)** Sources:
  [MDN processLocally](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally),
  [MDN available()](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/available_static),
  [MDN install()](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/install_static),
  [presentation](https://docs.google.com/presentation/d/1zRSgSCJ32FtvwtxbVaStyxt6ZERlKL8obApqwBHRWGU/htmlpresent).
- **Built-in AI:** the Language Detector API is stable from Chrome 138; the
  Prompt API is stable from Chrome 138 for extensions only; the Proofreader
  API was in an origin trial as of a September 2025 snapshot. **(verify)**
  Source: [Chrome built-in AI APIs](https://developer.chrome.com/docs/ai/built-in-apis).
- **`chrome.commands`:** at most four suggested shortcuts, more can be added
  by the user at `chrome://extensions/shortcuts`, every shortcut needs Ctrl or
  Alt, and Chrome's own reserved shortcuts always win. Whether it needs a
  permission was not in the summaries; to my knowledge it needs none, but
  **(verify)**. Source: [Commands API](https://developer.chrome.com/docs/extensions/reference/api/commands).

## Candidate features

The bar from TASKS.md: (1) a stated user problem, (2) no new permission and no
network call, (3) no busier control, (4) still understandable.

| # | Feature | What it does | Evidence someone wants it | Cost | Risk | Passes the bar |
|---|---|---|---|---|---|---|
| 1 | Shortcuts through `chrome.commands` | Hotkeys declared in the manifest, rebindable, and no longer swallowed on every page | **(measured)** redo and Ctrl+Shift+B taken over on every site; a store review risk | Low to medium: worker routes the command to the tab | Users who learnt the current keys; four suggested shortcuts at most (Ukti has four plus Alt+Z) | Yes, if no permission is needed **(verify)** |
| 2 | On-device speech, when Chrome offers Bangla | Use `processLocally` when `available()` says Bangla can run locally, else today's path | The single biggest privacy caveat in the policy is "your voice goes to Google"; on-device input is what Avro reviewers praise | Medium: a check, a setting, a pack install from the setup page | Experimental API; Bangla may not be offered at all | Yes; may remove a network path rather than add one |
| 3 | Spoken punctuation | Say দাঁড়ি, প্রশ্নবোধক and so on while dictating and get । ? | Gboard's own help says punctuation may be missing for some languages; a paid product sells it for Bengali | Low: a word list applied in the offscreen pipeline, like the filler cleaner | **High false positives**: কমা also means "reduce". Needs a two-word form or a pause rule, designed with native speakers | Yes, as a popup setting, off by default |
| 4 | Bengali or English numerals | Turn ১২৩ into 123 or back, as a setting | None found | Low | Low | Yes, popup only |
| 5 | Bijoy to Unicode | Convert pasted Bijoy text in a box to Unicode | Vendors say offices and printers still use Bijoy; a small competitor bundles exactly this | Medium: a mapping table plus reordering rules, and a test corpus | Scope: it is not voice typing, and a new button would break bar 3 | Only as a hotkey or popup tool; weakest on bar 4 |
| 6 | Learn corrections from undo | When the user undoes and retypes, offer to add a word fix | None found | Medium | Stores more user text, and learns from mistakes as readily as from fixes | Weak on bar 1 |
| 7 | Remember output language per site | English on one site, Bangla on another | None found | Low | Hidden state that surprises | Weak on bar 1 |
| 8 | Prompt API to tidy Banglish or add punctuation | Gemini Nano rewrites the converted text | None for Bengali specifically | High | Model size and hardware demands, unknown Bengali quality, and a model that rewrites what the user said | Fails bar 4, risky on 1 |
| 9 | Language Detector instead of the English heuristics | Ask Chrome whether a word is English | Indirect: the corpus shows the heuristics cap at about half of held-out English words | Low to test | Banglish is Bengali in Latin letters; a detector may call it English, or anything | Worth a spike, not a feature |
| 10 | Better behaviour when rate-limited | Already exists | Thread above | None | None | Already done; task 10 verified it |

## Recommendation

**Build first: #1, shortcuts through `chrome.commands`.** It is the only item
here with measured harm today, it removes a store-review risk, it makes the
keys visible and rebindable, and it changes nothing on the control. Check
first that it needs no permission, and plan the move: Alt+Z and the four
Ctrl+Shift keys are five, one over the suggested limit, so one becomes a
user-assigned shortcut.

**Then a spike on #2.** On your machine, run
`SpeechRecognition.available({ langs: ['bn-BD'], processLocally: true })` in
the offscreen document. If it says anything other than "unavailable", this
is the feature most worth building, because it would let the privacy policy
say "your voice stays on your computer" for people who choose it.

**Then #3, carefully,** off by default and designed with native speakers
for the words that are also ordinary words.

**Recommended against for now:** #6 and #7 (no evidence of demand, and they
add hidden state), #8 (heavy, uncertain for Bengali, and rewrites the user's
words). **#5** has real demand but is a different product; if built, it
belongs in the popup or behind a hotkey, never on the bar.
