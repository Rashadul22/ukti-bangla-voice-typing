# উক্তি (Ukti)

Speak Bangla into any text box in Chrome. Free, no account, no tracking.

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

## Where your words go

Being straight about this matters more than sounding good.

**Speech recognition goes to Google.** Ukti uses the Web Speech API, which is how
Chrome offers free speech recognition, and Chrome sends the audio to Google's
servers to be transcribed. This is Chrome's behaviour, not something Ukti adds,
and it is the same thing that happens when you press the microphone in Google
Search. There is no on-device alternative in Chrome today that recognises
Bangla. If that is not acceptable for something you are about to dictate, type
it instead.

**Translation does not leave the machine.** It runs through Chrome's Translator
API, which downloads the language packs once and then works on-device.

**Banglish conversion does not leave the machine.** It is a dictionary and a set
of rules inside the extension.

**Ukti itself sends nothing anywhere.** It has no server, no analytics, no
account, and no network permission of its own. Your settings and your custom
word replacements are stored by Chrome on your own computer.

**Password fields are skipped.** Password, OTP, PIN, CVV and card number fields
are excluded, so the control does not appear on them.

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

Md Rashadul Islam (মোঃ রাশেদুল ইসলাম)
