# Motion

Feedback motion added on 3 November without changing the design: every
surface at rest is pixel-identical to before (all 27 screenshot baselines in
`tests/ui-audit.test.js` pass unchanged), and the layout is untouched.

## What the research says

- **Motion must have a purpose.** Apple: "Add motion purposefully,
  supporting the experience without overshadowing it. Don't add motion for
  the sake of adding motion", and make motion optional
  ([HIG, Motion](https://developer.apple.com/design/human-interface-guidelines/motion.md)).
  Feedback should sit near what it is about
  ([HIG, Feedback](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/feedback.json)).
- **Short.** Acknowledge an action within about 100 ms; state changes take
  200 to 400 ms; past about 400 ms reads as sluggish. These figures are widely
  attributed to Nielsen Norman Group's response-time thresholds, but I found
  them only in secondary sources ([Fronteers](https://www.fronteers.nl/en/blog/2024/12/microanimations),
  [Cieden](https://cieden.com/book/sub-atomic/microinteractions/designing-neat-microinteractions)).
  Material's ports agree on ease-out ("decelerate") curves for things that
  enter, and 200 to 500 ms durations
  ([frust-material tokens](https://docs.rs/frust-material/0.6.2/src/frust_material/tokens/motion.rs.html)).
- **Transform and opacity only.** They run on the compositor thread; in
  web.dev's measurement a `top`/`left` animation dropped about 50% of frames
  and the `transform` version about 1%
  ([web.dev, high-performance animations](https://web.dev/articles/animations-guide),
  [animations and performance](https://web.dev/articles/animations-and-performance)).
- **Respect reduced motion, and leave a static cue.** WCAG 2.3.3 covers
  motion caused by interaction and names `prefers-reduced-motion` (C39) and
  its script check (SCR40) as techniques; motion can make people with
  vestibular disorders dizzy or nauseous
  ([W3C Understanding 2.3.3](https://w3c.github.io/wcag/understanding/animation-from-interactions)).
- **Errors shake, successes pulse.** A short shake of 4 to 6 px, two or three
  times, in about 300 to 400 ms, paired with a static cue; a pulse or tick for
  success ([UXmag, Stripe Checkout example](https://uxmag.com/articles/designing-interface-animations-the-book-excerpt),
  [UXPin](https://www.uxpin.com/studio/blog/error-feedback-best-practices-mobile-forms/)).
  These numbers come from design writing, not research; they are starting
  points.

## What Ukti had, and the gaps

Already there: the rows fan out from the mic on a spring; the mic's halo
follows the voice level, with a slow ring while listening; words rise into
the preview; toasts rise in; a caret and a dots loader.

Missing: **feedback**. A press gave no acknowledgement at all: the hover and
press scales in the stylesheet never applied, because `.bar.on button` beats
both on specificity. That has been true all along, and I left it alone,
since reviving them would change the look you settled on. A refusal moved
nothing, a success moved nothing, and nothing showed *where* the words went.

## What was added

| Effect | Where | Purpose | Motion | Under reduced motion |
|---|---|---|---|---|
| Ripple from the press point | every button on the control | the press was received | 460 ms, scale and fade, ease-out | not created |
| Glow on the box | the box text was written into (dictation, conversion, undo) | where the words went | 750 ms, fade in and out | not created; the toast says it |
| Green ring | the button that succeeded (or the mic, for a shortcut) | it worked | 520 ms, scale 1 to 1.5 and fade | not created; the toast says it |
| Shake | the button whose action was refused (or the mic) | that did not happen | 320 ms, 5 px, damped | off; the red toast says it |
| One red ring | the mic, the moment listening starts | the state changed | 600 ms | not created; the mic turns red |
| Tilt and highlight (the 3D) | the mic, while hovered | depth, and that it is the thing to press | follows the pointer, at most 8 degrees, perspective 240 px | no tilt |
| Press-in | popup tabs, segments, theme swatches | the press was received | 120 ms, scale .96 | instant |
| Stretching thumb | popup switches, while held | the switch is being pressed | 200 ms | instant |
| Swatch pop | the chosen theme | it is chosen | 360 ms, once | off |
| Badge pop | setup, a step just completed | the step is done | 420 ms, once (not on page load) | off |
| Sheen | setup, a pack downloading | it is still working | 1.1 s loop, only while downloading | off |

Each effect on the control is a short-lived fixed element over its target in
the shadow root, removed when its animation ends (with a timeout behind it).
The buttons' own transforms and contents are never touched, so the effects
cannot fight `paintMic()` or the spring layout.

## Considered and rejected

- **Anything that runs at idle**, such as a breathing mic when not
  listening, or an ambient shimmer. The performance budget requires zero work
  at idle, and Apple's guidance argues against attention-pulling ambient
  motion.
- **Blur in the effects.** Your rule: blur only on the open preview.
- **Parallax, 3D flips of panels, confetti.** No purpose a user needs, and
  each is the "motion for its own sake" the research warns against.
- **Reviving the dead hover and press scales.** They would change how the
  control looks when touched, which you settled.
- **A sliding pill under the popup tabs.** It would add an element whose
  resting render has to match the current tab exactly; the press-in gives
  the feedback without that risk.

## How it is held

- `tests/motion.test.js`, 11 tests. Before the code: 9 failed, and the 2
  that passed are guards that nothing moves when it should not. They check:
  - each effect appears, and is gone afterwards
  - the glow lands on the box, within 4 px
  - the tilt stays within 8 degrees, and is level again when the pointer leaves
  - reduced motion turns every effect off
  - the shadow root returns to its resting element count
  - the popup presses in and its switch thumb stretches, the setup badge pops, and nothing moves under reduced motion
- `tests/ui-audit.test.js`: the 27 at-rest baselines, unchanged.
- `tests/perf.test.js`: idle still 0 script, 0 layouts, 0 style recalcs and
  0 mutations; shadow DOM still under 55 at rest.
- `docs/motion/*.png`: frames of each effect mid-flight (`node
  tests/ui/motion-frames.js`).

## Not verified from here

How it feels. Timing that reads well in a test can feel wrong in the hand,
and the 3D tilt in particular is a matter of taste: it is one number
(`* 16` in `tilt()`, giving at most 8 degrees) if it wants to be calmer.
