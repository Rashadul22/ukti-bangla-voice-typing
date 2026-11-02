# উক্তি (Ukti)

Speak Bangla into any text box in Chrome. Free, no account, nothing sent to a server.

Millions of Bangla speakers can speak the language fluently but cannot type its
script. Ukti is for them. Press the mic, say what you mean, and the words land in
whatever box you were already using: a chat, a search bar, a form, an AI prompt.

## What it does

- **Speak to type.** Your speech goes into the box in Bangla script.
- **Or in English.** The same speech can land translated, for sites and people
  that expect English.
- **Banglish to Bangla.** Text typed the roman way (`ami banglay kotha boli`)
  becomes `আমি বাংলায় কথা বলি`.
- **Undo.** One button puts back what was there before.

## How it is built

- Manifest V3. Two permissions only, `storage` and `offscreen`. No host
  permissions, so the install dialog does not ask to read your data on every
  site.
- Translation runs through Chrome's on-device Translator API. The language packs
  download once and the text never leaves the machine.
- Speech recognition uses the Web Speech API.
- The floating control lives in a shadow root, so no page style can reach it and
  it cannot reach any page style.
- Transliteration is a phonetic engine plus a dictionary for the words phonetics
  gets wrong, since the roman alphabet cannot tell শ from স, or থ from ঠ.

## Requirements

Chrome 138 or newer, on desktop.

## Installing from source

1. Download or clone this folder.
2. Open `chrome://extensions`, turn on Developer mode.
3. Click **Load unpacked** and pick the folder.
4. The setup page opens. Allow the microphone and download both language packs.
5. Press F5 on any tab that was already open before you installed.

## Notes

Google's free voice service has a limit, so after a long stretch of speech it can
stop responding. Press the mic to stop and start again and it clears. Speaking a
paragraph at a time makes it rarer.

Some editors refuse an edit they did not originate. Ukti tries three different
ways in and checks which one the editor kept. If none of them work it leaves your
text exactly as it was and says so, rather than writing the sentence in twice.

## Licence

MIT. See `LICENSE`.

## Author

Md Rashadul Islam (মোঃ রাশাদুল ইসলাম)
