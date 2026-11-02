# Task list

Work through these in order. After each one, report what you measured before
starting the next.

## Tasks, in priority order

1. **Put a real regression suite in the repo.** A `tests/` directory, Playwright
   driving a locally served set of mimic pages, and `npm test` running it. Cover
   convert and undo in all five editor archetypes, a real clipboard paste with
   the extension loaded, per-site off versus global off, the settings migration,
   and the popup and setup pages in both languages. Report pass counts.

2. **Build a Banglish corpus and measure against it.** `tests/corpus/` with
   Banglish words and sentences plus their expected Bangla, and a separate list
   of English words that must pass through untouched. Run it, report the pass
   rate as a number, then raise it by extending the dictionary and the rules.
   Do not change `normalise()` to collapse consonant repeats: that turned
   "bollo" (বললো) into "বলো" and changed the meaning.

3. **Audit `content.js` for lifecycle bugs.** Listener cleanup, element
   references held after the node leaves the DOM, the undo stack growing without
   a bound, what happens when the service worker is terminated mid-dictation and
   the content script sends into a dead port, and behaviour inside iframes
   (the manifest sets `all_frames: true`).

4. **Audit the dictation flow for races.** Rapid start and stop of the
   microphone, two tabs dictating at once, the offscreen document being torn
   down while a result is in flight.

5. **Write the Chrome Web Store submission material.** A privacy policy page
   (the extension stores nothing off the machine; speech goes to Google's Web
   Speech service as the Web Speech API requires, and translation runs on-device
   through Chrome's Translator API), a store description in English and Bengali,
   and a submission checklist. Put them in `store/`.

6. **Accessibility.** The floating control should be fully keyboard operable,
   with correct `aria-label`s, visible focus, a sane tab order, and respect for
   `prefers-reduced-motion`.

7. **Read the whole thing as a store reviewer would** and list anything that
   would draw a rejection.

