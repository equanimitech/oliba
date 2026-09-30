---
tag: pitch
appetite: medium
status: draft
source: docs/research/2026-09-30-lesson-components.md; branch feat/lesson-sound (55902bb); user feedback on the singing check
supersedes: []
slice_id: A
---

# Pitch -- Lesson components: `<oliba-play>`, `<oliba-tuner>` and the catalog

**Bet:** Replace the hand-rolled synth and one-shot pitch readout with a catalog of `<oliba-*>` custom elements, prebuilt from proven libraries, that Claude composes in lesson markup and never scripts. First slice: a sampled piano, a live tuner, and the plumbing that makes the catalog real.

**Why it matters:** The singing learner gets a piano that sounds like one and a tuner that moves while they sing. Every later widget (staff, chess, the Repertório player) is one more catalog entry, not one more script Claude might get wrong.

---

## Boundaries

**JBTD:** As a singer learning theory in pt-BR, when a lesson asks me to sing a *lá3*, I want to hear a real piano and watch my pitch land on the note so that I can correct while singing. Baseline today (`feat/lesson-sound`): a triangle wave plays, the page listens 1.5 s, then prints "✗ Acima: lá♯2 (+67 ¢)" once. Ugly sound, no way to adjust.

**Out:**
- `<oliba-score>` (abcjs), `<oliba-board>` (chess), `<oliba-keys>`: next slices, once this catalog proves out.
- A player with loop and speed: Repertório's component. This pitch leaves the seam, not the player.
- The typed-resource registry Repertório is exploring. Catalog, validation and inlining live in a shared helper so any page template can use them; that is the seam, and it stops there.
- GPL libraries (chessground, pitchfinder, aubio, WebAudioFont) and CC-BY sample sets that need attribution. MIT/BSD/0BSD/public domain only.
- Tone.js, shadow DOM, a shared `_components/` folder, the CEM analyzer.
- Any tally in the page: attempts, accuracy, streaks. The tuner shows where the voice is now, nothing about how often it was right.

## Elements

- **Build and bundles.** Add a dev-only `package.json` with `esbuild`; `scripts/build-components.mjs` bundles `components/{runtime,play,tuner}.js` as classic IIFEs into `assets/components/`, committed, `.ogg` through the `base64` loader. A test rebuilds and fails on `git diff --exit-code assets/components`, so bundles can't drift from sources. Users never build; the plugin stays zero-dependency Node.

- **Catalog and shared helper.** `assets/components/catalog.json` (CEM-2.1 subset, hand-written: tag, description for the model, attributes, one example). `lib/components.mjs` exports `tagsIn(body)`, `validate(body)` and `scripts(body)`. `renderPage` inlines `runtime.js` plus one bundle per tag found (`lib/cli.mjs:635`); `lesson-write` calls `validate` next to the existing `<script>` and resource bans (`lib/cli.mjs:713-721`); `cli.mjs components` prints the compact form Claude reads before writing a lesson. Same JSON drives prompt, validation and rendering.

- **`<oliba-play notes="dó4 mi4 sol4" tempo="90" together>`.** smplr `SplendidGrandPiano` fed a custom `storage` that serves embedded Opus bytes: Splendid Grand (public domain), MF layer, C2 to C6 in minor thirds, mono 40 kb/s, about 340 KB base64. Light DOM; the element's text is the button label, so the lesson still reads without JS. One `AudioContext` in `runtime.js`, resumed on the first gesture. Keeps `olibaParseNote`/`olibaNearest` from `assets/sound.js` (pt-BR solfège; tonal can't parse `dó`).

- **`<oliba-tuner note="lá3" tolerance="25" any-octave>`.** pitchy for `[hz, clarity]`, our own canvas: a cents needle and a scrolling trace against the target band, smoothed (median of the last 5 frames, drop clarity < 0.9, hold the last note 300 ms). Runs until the learner stops it. Reuses `olibaMicProblem` and the pt/fr/en strings from `sound.js`. The lens is BCT 2.6 *biofeedback*: continuous, neutral, in the moment, which is what a one-shot verdict can't give. Not a quiz: no `<details>`, no card, no result saved. `quiz.js` ignores clicks that come from inside an `oliba-*` element (`assets/quiz.js:54`).

- **Skill, index, version.** Cherry-pick `55902bb` (the global `~/.oliba/index.html`, `cli.mjs index --open`) onto main first; it is independent and done. Drop the rest of `feat/lesson-sound`: the triangle synth, the YIN detector, `data-play`/`fieldset.sing`. Replace the Sound section of `skills/teach/SKILL.md` with "run `cli.mjs components`; use only its tags, exactly as shown". Bump to 0.12.0 (the plugin cache keys on version). Credit smplr, pitchy, kunukn/singing-experience, qiuxiang/tuner and json-render in the README.

## Risks

**Rabbit holes:**
- smplr's `Sampler({buffers})` rendered silence in the probe. Use the `SplendidGrandPiano` + `storage` route that worked. If it fails on a real page, time-box 1 h, then fall back to `decodeAudioData` and a 40-line nearest-sample scheduler.
- Splendid's file names put C3 at MIDI 60. Build the embed list from the URLs smplr requests, not from names.
- Tuner polish. Needle plus trace, in `oliba.css` tokens. No spectrogram, no piano roll, no animation beyond the trace.
- pitchy thresholds on a voice. Start at clarity 0.9; adjust by singing, not by reading papers.

**Fat cut:**
- Tone.js (3.5x smplr) and its Salamander set (CC-BY).
- A `CustomEvent('oliba:result')` feeding FSRS. Singing isn't a card.
- Generating `catalog.json` from JSDoc. Worth it past ~6 tags; we have 2.

**Domain knowledge:**
- Brave's Web Audio farbling may jitter pitch by a hair; test once by hand in Brave and Chrome.
- Chrome may not persist mic permission across reloads on `file://`; the tuner must cope with re-asking.

## Acceptance

1. `node lib/cli.mjs components` prints both tags with attributes and one example each, read from `catalog.json`.
2. `lesson-write` refuses `<oliba-nope>`, `<oliba-tuner>` without `note`, and `notes="H4"`; accepts the catalog examples.
3. A lesson with only `<oliba-play>` carries `runtime.js` and `play.js` and not `tuner.js`; a lesson with neither carries no component script. `play.js` is under 450 KB, `tuner.js` under 30 KB.
4. Opened from `file://` in Chrome with the network off, `<oliba-play notes="dó4 mi4 sol4">` plays sampled piano; DevTools shows no request leaving the page.
5. `<oliba-tuner note="lá3">` moves the needle and trace while the user sings, reads in tune within tolerance, and names the mic failure in one line in the page language when it fails.
6. `node --test` is green, including the bundle-drift check.
7. The rendered page contains no attempt count, accuracy or streak.
8. `skills/teach/SKILL.md` documents no `data-play` or `fieldset.sing`; `plugin.json` says 0.12.0; `~/.oliba/index.html` builds on main.

---

_Drafted by Claude (scribe). Appetite `medium`: two elements plus build, catalog and validation plumbing. Override with `--appetite=<size>`._
