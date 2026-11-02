# Chrome Web Store submission checklist

Work down the list. Items marked **you** need a decision or an account
action that cannot be done from the repository.

## The package

- [ ] Version bumped in `manifest.json` and the setup page footer
      (`RELEASING.md` steps 1 to 3).
- [ ] `sh scripts/package.sh` (or `node scripts/package.js`) builds
      `dist/ukti-X.Y.Z.zip` with the tests passing and the load check green.
- [ ] Zip loaded by hand once as an unpacked extension (`RELEASING.md` step 6).

## Store listing tab

- [ ] Name, summary and description from `listing-en.md` (and `listing-bn.md`
      for the Bengali locale of the listing).
- [ ] Replace `[privacy policy URL]` in both listings with the real URL.
- [ ] Icon: 128x128, `icons/icon128.png` (the packager checks its size).
- [ ] **you:** at least one screenshot, 1280x800 or 640x400. Suggested: a chat
      box with Bangla text just dictated and the control beside it; the অ button
      turning Banglish into Bangla; the popup. Screenshots must show the real
      product; do not use the synthetic test pages.
- [ ] **you, optional:** small promo tile 440x280.
- [ ] Category: Productivity. Languages: English, Bengali.

## Privacy practices tab

- [ ] **Single purpose:** "Lets the user write in any text box by speaking
      Bangla, with optional on-device translation to English and conversion of
      typed Banglish to Bangla script."
- [ ] **Permission justifications:**
  - `storage`: "Saves the user's settings, the sites where the user turned
    Ukti off, and the user's own word corrections, on the user's computer."
  - `offscreen`: "Runs speech recognition and on-device translation in an
    offscreen document, because a service worker cannot use the microphone."
    (Reason `USER_MEDIA`, as in `background.js`.)
  - **Host access (from the content script on all http and https pages):**
    "The voice typing control must be able to appear in any text box on any
    site the user chooses to type in. The script reads only the focused text
    box, and only when the user dictates into it or presses one of its
    buttons, plus field attributes to skip password and payment fields."
- [ ] **Remote code:** No. Every script is in the package; nothing is
      fetched or evaluated from elsewhere (`tests/privacy.test.js` checks).
- [ ] **you: Data usage.** The form asks what user data the extension
      collects or transmits. Ukti's own code transmits nothing, but dictation
      means Chrome sends audio to Google through the Web Speech API. My
      reading: declare that the extension handles "personal communications"
      and "website content" only locally, that it does not sell or transfer
      data, and describe the speech path in the policy, which it does. This
      is a judgement call about how the store reads a Chrome API's own
      network use; if in doubt, disclose more, not less.
- [ ] Tick the three certifications (no selling, no unrelated use, no
      creditworthiness use). All true for Ukti.
- [ ] **Privacy policy URL:** host `store/privacy-policy.html` somewhere
      public and stable (your site, or GitHub Pages), and paste the URL.

## Account tab

- [ ] **you:** a contact email on the developer account, verified.
- [ ] **you:** developer account registration fee paid, if not already.

## Before pressing submit

- [ ] The listing, the policy, the README and the setup page all say the same
      thing about where speech goes. (They do as of this commit; re-check if
      any of them changed.)
- [ ] No claim anywhere that speech stays on the computer. The README once
      said so; `tests/strings.test.js` now fails if such a sentence returns.
- [ ] `store/reviewer-notes.md` read, and anything it flags dealt with.
