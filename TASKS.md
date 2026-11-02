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


## 8. Research what Ukti should become, then build only what earns its place

The first seven tasks are about making what exists correct. This one is about
what to add. Do the research before writing any code.

**Research brief.** Use web search. Find out:

- What Bengali speakers actually complain about when they try to type Bangla.
  Search in both English and Bengali. Forums, Reddit, Chrome Web Store reviews
  of Avro, Ridmik, Google Input Tools, and any Bangla voice typing extension.
  Reviews of competitors are the most honest feature list you will find.
- What the existing Bangla input tools do and do not do, and where Ukti is
  genuinely different. Ukti's difference today is that it is voice first and
  works inside any box on any site, with on-device translation.
- Which Chrome extension APIs would let Ukti do something it cannot do now.
  Check what is actually shipping, not what is proposed, and check the minimum
  Chrome version each needs. The manifest currently requires 138.
- Which of Chrome's on-device model APIs are available and stable, and whether
  any of them would improve transliteration, punctuation or correction without
  a network call.

**The bar a feature has to clear.** Propose nothing that fails all of these:

1. It solves a problem a real user has stated, not one you imagined.
2. It works without adding a permission and without a network call. A feature
   that would reintroduce `host_permissions` is not worth it, whatever it does.
3. It does not make the floating control more complicated to look at. The
   control was already redesigned once because it had grown too tall and too
   busy. Anything new either hides inside the popup or earns its place on the
   bar by being used constantly.
4. Someone who installed Ukti to speak Bangla into a text box would still
   understand the extension after the feature exists.

**How to report.** Write `RESEARCH.md` with what you found, each claim carrying
the source you found it in. Then list the candidate features in a table: what it
does, the evidence that someone wants it, what it costs to build, what it risks.
Rank them. Say which ones you recommend and which you recommend against, and why.

**Then build.** Start with the single highest-ranked feature, build it properly
with tests, and report. Do not build the whole list. A half-finished feature is
worse than an absent one, and five mediocre features are worse than one good
one. If you run out of time or budget, having one feature done well and the rest
written up as a plan is the better outcome.

Some directions worth checking during the research, not a list to implement:
spoken punctuation while dictating, Bijoy to Unicode conversion, Bengali versus
English numerals, growing the correction dictionary from what the user undoes,
remembering the preferred output language per site, and graceful behaviour when
Google's speech service rate-limits a long session.
