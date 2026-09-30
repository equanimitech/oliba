# Lesson components: libraries, catalog, build (research, 2026-09-30)

**Question.** Which proven libraries should back a catalog of `<oliba-*>` custom elements, which Claude composes in lesson markup while vetted, prebuilt scripts do the work? And how do we build and ship them?

**Answer in one line.** Use **esbuild** to prebuild one **classic IIFE bundle per custom element**, commit the output, and have `renderPage` inline only the bundles whose tags appear in the lesson. Back the elements with **smplr** (piano, fed embedded Opus samples), **pitchy** (tuner), **abcjs** (staff), **cm-chessboard + chess.js** (chess), and native MathML. A small `catalog.json` lists the tags. Claude reads it through `cli.mjs components`, and `lesson-write` validates lessons against the same file.

Method: `gh api repos/…` for stars, license and activity; `npm view` for versions; local esbuild IIFE bundles for sizes (min / gzip, measured 2026-09-30); `curl -I` for CORS headers; and a **file:// probe page run in headless Chrome 150 and Brave 1.96** through playwright-core. Anything marked "verified" was run. Anything marked ⚠ is unverified or inferred.

---

## 0. The file:// ground rules (verified)

This constraint shapes every choice below, so it comes first. Results are the same in Chrome and Brave:

| Capability from a `file://` lesson | Result | Consequence |
|---|---|---|
| Inline `<script>` (classic) | ✅ | This is how quiz.js ships today |
| External classic `<script src="./x.js">` | ✅ | A shared-assets folder is possible (see §4) |
| External `<script type="module" src>` | ❌ blocked | **Bundles must be IIFE, not ESM** |
| `import('./x.js')` (dynamic import of a file) | ❌ | **No code-splitting or lazy chunks.** This rules out Vite/Astro default output |
| `import(blobURL)` | ✅ | |
| `fetch`/XHR of a local file | ❌ | No `decodeAudioData(fetch('piano.ogg'))`, and no cm-chessboard sprite XHR |
| `fetch('data:audio/ogg;base64,…')` + `decodeAudioData` (Ogg Opus) | ✅ | **Inlined samples work** |
| `fetch` of remote https with `Access-Control-Allow-Origin: *` | ✅ | GitHub Pages sample hosts send it (checked smpldsnds, gleitz, tonejs) |
| `isSecureContext` | `true` | Mic via getUserMedia is allowed (current sound.js relies on this) |
| Cache API, localStorage, customElements | ✅ | |
| `audioWorklet.addModule(blob:)` | ❌ | **smplr's `Reverb` (blob worklet) fails on file://** |
| `audioWorklet.addModule('data:text/javascript,…')` | ✅ | Workaround if we ever need a worklet |

⚠ Not probed: whether Chrome persists mic permission for file:// across reloads, and whether Brave's Web Audio "farbling" (tiny multiplicative noise in Standard shields) affects pitch detection. It should be negligible, but test once by hand.

---

## 1. Libraries per need

### 1a. Realistic instrument playback

**Recommendation: smplr `SplendidGrandPiano`, fed a custom `storage` that serves embedded Opus bytes.** Verified end to end on file://: a custom `Storage` intercepted all 6 sample URLs, and the piano rendered audio (peak 0.064) with zero network. It pitch-shifts from the nearest loaded sample (`fallback: "nearest"` is the piano default), so a sparse set covers every key.

| Library | Repo / license | Activity | Size (IIFE min / gz) | Offline / file:// |
|---|---|---|---|---|
| **smplr** 1.1.0 | [danigb/smplr](https://github.com/danigb/smplr), MIT (npm/README; the GH API reports none) | 325★, pushed 2026-09-28 | **64 / 21 KB** (piano+Sampler+Soundfont) | Samples load from `smpldsnds.github.io` by default. `storage: { fetch(url) }` swaps the source: **verified embedded**. `CacheStorage` helper exists. `Reverb` fails on file:// (blob worklet) |
| Tone.js 15.1.22 | [Tonejs/Tone.js](https://github.com/Tonejs/Tone.js), MIT | 14.7k★, very active | 231 / 59 KB (Sampler only); 340 / 80 KB (full) | `Sampler` repitches from the nearest sample and accepts `AudioBuffer`s or data URLs. Better if we need a transport, effects or synths. 3.5× smplr's size |
| WebAudioFont | [surikov/webaudiofont](https://github.com/surikov/webaudiofont), **GPL-3.0** | 990★, npm stale since 2022 | n/a | Instruments are JS files with embedded data (file://-friendly), **but GPL is incompatible with shipping inside MIT oliba** |
| soundfont-player | danigb/soundfont-player | **archived** (superseded by smplr) | | skip |

**Sample sets.**

| Set | License | Full size | Notes |
|---|---|---|---|
| **Splendid Grand Piano** (Akai Steinway, via smplr) | **Public domain** ([sfzinstruments](https://github.com/sfzinstruments/SplendidGrandPiano)) | 226 ogg, **19.9 MB** (5 velocity layers); one layer ≈ 2.3–5 MB | Default in smplr. No attribution burden. ⚠ smplr's file names use a C3 = MIDI 60 octave label (for example `PP C3.ogg` for note 60), so map by recorded URL rather than by name |
| Salamander Grand (Yamaha C5, Tone.js demo set) | **CC-BY 3.0** (Alexander Holm; `Tonejs/audio/salamander/README`) | 30 mp3 in minor thirds, 1 velocity, **2.0 MB** | Needs attribution in the lesson/README |
| FluidR3_GM (gleitz) | CC-BY 3.0 | `acoustic_grand_piano-mp3.js` = 2.6 MB | Already base64 inside JS (MIDI.js format) |
| MusyngKite (gleitz) | **CC-BY-SA 3.0** | 2.3 MB piano | Share-alike: avoid embedding |

**Can a reduced set be inlined? Yes, cheaply.** I re-encoded Salamander C4, D♯4, F♯4 and A4 to **mono Opus 40 kb/s, 2.5 s with a fade**: **~15 KB each** (from 60–80 KB mp3). A voice range C2–C6 in minor thirds is 17 samples ≈ 255 KB, or **~340 KB as base64**. A full A0–C8 range is ≈ 600 KB base64. Decoding a data-URL Opus buffer is verified in Chrome and Brave. Pipeline: a maintainer-only `ffmpeg` script, with the committed `.ogg` files imported through esbuild's `base64` loader. Use Splendid (public domain) and pick the MF/Mf layer.

**Why this fixes "sounds ugly".** The current engine is a triangle-wave oscillator. A sampled Steinway with a natural decay is the entire difference, and at 21 KB gz of code the cost is small.

### 1b. Pitch detection for voice + tuner UI

**Recommendation: pitchy (McLeod Pitch Method) + our own canvas UI with two parts: a cents needle plus a scrolling pitch trace against the target note's band.** The homegrown YIN is not the real weakness. The problem is the one-shot readout. A live trace with smoothing (median of the last ~5 frames, drop frames with clarity < 0.9, hold the last note ~300 ms) is what makes "Acima: lá♯2 (+67 ¢)" understandable.

| Library | Repo / license | Activity | Size | Notes |
|---|---|---|---|---|
| **pitchy** 4.1.0 | [ianprime0509/pitchy](https://github.com/ianprime0509/pitchy), MIT (npm 4.1.0) / 0BSD (repo main) | 137★, last release 2024-01 (small and done) | **8 / 3 KB** | Returns `[hz, clarity]`, built for tuners, ESM-only (fine through esbuild). Used by the prior art below |
| pitchfinder | [peterkhayes/pitchfinder](https://github.com/peterkhayes/pitchfinder), **GPL-3** ("GNU v3" in package.json) | 504★ | 7 / 3 KB | YIN/AMDF/MPM. **GPL: avoid** |
| aubiojs | [qiuxiang/aubiojs](https://github.com/qiuxiang/aubiojs), MIT wrapper over **GPL-3 aubio** | 174★, 2023 | 427 KB unpacked (wasm) | ⚠ GPL inherited from aubio. Heavier. Skip |
| ml5 / CREPE | ml5 1.x **dropped pitch detection** (no module in [ml5-next-gen/src](https://github.com/ml5js/ml5-next-gen)). [marl/crepe](https://github.com/marl/crepe) is Python | | TF.js + remote weights (MBs) | Overkill, and needs the network |

**Tuner UIs worth borrowing (learn, credit, don't copy):**
- [kunukn/singing-experience](https://github.com/kunukn/singing-experience) (0BSD, 7★, active 2026-09, live at syng.fun). Nearly our exact stack (**pitchy + tone + abcjs**): pitch detector with history chart, DO-RE-MI game, piano that shows where your voice lands. It is the best proof that this combination works.
- [qiuxiang/tuner](https://github.com/qiuxiang/tuner) (MIT, 381★): a classic needle meter plus frequency bars, in small vanilla files (`meter.js`, `tuner.js`).
- [cwilso/PitchDetect](https://github.com/cwilso/PitchDetect) (MIT, 1.4k★): the canonical autocorrelation demo. Useful only as a reference.

### 1c. Staff notation

**Recommendation: abcjs, render-only.** Claude writes **ABC notation as the element's text content** (compact and very LLM-fluent: `X:1\nK:C\nCDEF GABc|`). It renders to SVG with **no font files and no network**. For playback, route through our smplr engine instead of abcjs's synth, which fetches soundfonts from `paulrosen.github.io` (found in the bundle).

| Library | Repo / license | Activity | Size (IIFE min / gz) | Offline / LLM fit |
|---|---|---|---|---|
| **abcjs** 6.7.1 | [paulrosen/abcjs](https://github.com/paulrosen/abcjs), MIT (npm + LICENSE) | 2.4k★, released 2026-09 | **507 / 149 KB** | Pure SVG glyphs, offline. ABC input is short. Biggest single bundle, so inline it only when used |
| VexFlow 5.0.0 | [vexflow/vexflow](https://github.com/vexflow/vexflow), MIT | 4.4k★ (0xfe) + 241★ (new org), 2025-03 release | full 1106/675; `vexflow/bravura` 715/379; `vexflow/core` 333/89 | `core` **fetches fonts from cdn.jsdelivr.net** (`Font.HOST_URL`), so offline needs the heavier entries. Imperative JS API (EasyScore helps), which is worse for declarative markup |
| OpenSheetMusicDisplay 2.1.3 | [OSMD](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay), BSD-3 | 2k★, active | 1296 / 340 KB | Needs **MusicXML**: verbose and error-prone for an LLM to hand-write |
| Verovio 6.3.0 | [rism-digital/verovio](https://github.com/rism-digital/verovio), **LGPL-3** | 936★, active | ~7 MB wasm module | Engraving quality is top, but far too heavy per lesson |

### 1d. Piano keyboard / fretboard display

**Recommendation: hand-roll an SVG `<oliba-keys>` (~80 lines), reusing sound.js's existing solfège parser.** The libraries are stale or React-bound, and a keyboard is 7 rects + 5 rects per octave. Tonal (MIT, 29/10 KB) is worth adding only when chords and scales need computing. It does **not** parse pt-BR solfège (`dó`), so keep `olibaParseNote`.

| Option | License / activity | Verdict |
|---|---|---|
| [g200kg/webaudio-controls](https://github.com/g200kg/webaudio-controls) `<webaudio-keyboard>` | Apache-2.0, 372★, 2025-10 | Prior art for keyboard *as a custom element*. It is a controller, not a display |
| [stuartmemo/qwerty-hancock](https://github.com/stuartmemo/qwerty-hancock) | MIT, 275★ | Old API; ok to read |
| kevinsqi/react-piano | MIT, 318★, 2023 | React: no |
| **Guitar later:** [omnibrain/svguitar](https://github.com/omnibrain/svguitar) | MIT, 823★, active 2026-09, 162/66 KB | Chord *boxes*. Good fit when guitar lands |
| [moonwave99/fretboard.js](https://github.com/moonwave99/fretboard.js) | ISC (npm), 107★, stale 2022-11 | Full fretboard/scales. Read it, likely hand-roll |

### 1e. Chess

**Recommendation: cm-chessboard + chess.js.** Both are permissive and tiny. cm-chessboard's sprite XHR fails on file://, **but** with `assetsCache: true` it skips the XHR when a `#cm-chessboard-sprite` div already exists (read in `ChessboardView.cacheSpriteToDiv`). The wrapper pre-inserts the 23 KB `standard.svg` inline, so there is no fetch and no fork.

| Library | Repo / license | Activity | Size (IIFE min / gz) | Notes |
|---|---|---|---|---|
| **cm-chessboard** 8.15.1 | [shaack/cm-chessboard](https://github.com/shaack/cm-chessboard), MIT | 305★, released 2026-09 | **33 / 8 KB** + 23 KB sprite + 12 KB css | SVG board, arrows/markers extensions, accessibility extension |
| **chess.js** 1.4.0 | [jhlywa/chess.js](https://github.com/jhlywa/chess.js), BSD-2 | 4.4k★, 2026-08 | **35 / 12 KB** | Legality, SAN/PGN/FEN. Needed for "play the Sicilian move" exercises |
| chessground 10.4.1 | [lichess-org/chessground](https://github.com/lichess-org/chessground), **GPL-3** | 1.4k★, very active | 32 / 11 KB; pieces as data-URI CSS (offline-friendly) | Best UX (Lichess), but **GPL, so it can't ship inside MIT oliba** without relicensing |

### 1f. General (brief)

- **Math: native MathML Core** (Chrome/Brave since 109). This is rung 4: zero bytes, and Claude can write `<math>` directly. It also passes the lesson validator (no `src`). If LaTeX input is wanted, use [Temml](https://github.com/ronkok/Temml) (MIT, 351★, LaTeX→MathML, no fonts). KaTeX (MIT, 20k★, 261/74 KB **+ 1.1 MB fonts**) is only worth it for print-perfect glyphs.
- **Diagrams: skip Mermaid.** It measures **5.2 MB min / 1.5 MB gz** as a single IIFE (v12 lazy-loads diagram chunks, which also breaks on file://). Keep Claude-authored inline SVG, as the validator already asks.
- **Flashcard-ish:** `<details>` + existing quiz.js already cover it. If a component is ever needed, `<oliba-flip>` is ~20 lines of CSS. No library.

---

## 2. Prior art: component catalogs for LLM generative UI

**Lesson to steal: one catalog drives three things. It generates the prompt, it validates the output, and it maps to renderers. The model may only name catalog entries (an allow-list), never code.** That is exactly oliba's trust boundary.

| Project | License / ★ | Shape | What to take |
|---|---|---|---|
| [vercel-labs/json-render](https://github.com/vercel-labs/json-render) | Apache-2.0, 18.4k | `defineCatalog({components:{Name:{props: zod, description}}})`; the LLM emits JSON limited to the catalog. Renderers for React/Vue/Svelte/… | **Catalog → prompt generation** (`catalog.prompt()`-style), and a per-component `description` written *for the model* |
| [a2ui-project/a2ui](https://github.com/a2ui-project/a2ui) (Google) | Apache-2.0, 16.6k, v0.9 | Declarative JSON, flat list with id refs, client-side "catalog of trusted, pre-approved components"; Lit renderer exists | "**Safe like data, expressive like code**", our boundary in one line. A flat list suits incremental generation |
| [thesysdev/openui](https://github.com/thesysdev/openui) | MIT, 9.9k | "OpenUI Lang", a compact streaming language (claims up to 67% fewer tokens than JSON); prompt generated from the component library | Compact syntax beats JSON for tokens. **HTML custom elements are already a compact, streaming, LLM-native syntax** |
| [modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps) (MCP Apps) | 2.9k | UI resources served by MCP servers, rendered in sandboxed iframes | Relevant only if oliba ever renders inside Claude's own UI |
| [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest) | BSD-3, 505★, schema 2.1.0 | Standard JSON for tags, attributes, slots, events; `@custom-elements-manifest/analyzer` generates it from JSDoc | **The machine-readable format to align with** (see §4) |

Our twist: the "UI language" is plain HTML (`<oliba-tuner note="lá3">`), which Claude writes natively. There is no JSON layer, no renderer mapping, and the markup degrades to readable content without JS.

---

## 3. Build tooling verdict

**Recommendation: plain esbuild.** One ~30-line `scripts/build-components.mjs`:

```js
await esbuild.build({
  entryPoints: ['components/*.js'], bundle: true, minify: true,
  format: 'iife', outdir: 'assets/components',
  loader: { '.ogg': 'base64', '.svg': 'text', '.css': 'text' },
});
```

This covers multi-entry IIFE in one call, and samples and sprites become strings with no plugin. It is dev-only: add a `package.json` with devDependencies. The plugin itself stays zero-dependency Node, the output is committed, and users never build.

| | esbuild | Vite lib mode (+ singlefile) | Astro |
|---|---|---|---|
| Multi-entry IIFE | ✅ native | ❌ **throws** "Multiple entry points are not supported when output formats include umd or iife" (`packages/vite/src/node/build.ts`), so it needs one build per component | n/a |
| Fits "lessons built at runtime by cli.mjs" | ✅ bundles are just strings for `renderPage` | ✅ with a loop | ❌ Astro renders pages at **build time**, so each lesson would need a build on the user's machine |
| file:// safe output | ✅ IIFE, no chunks | ⚠ must force `inlineDynamicImports` | ❌ island scripts are `type=module` chunks (verified blocked on file://) |
| vite-plugin-singlefile | | Solves "inline an app's index.html", which `renderPage` already does. Not needed | |
| Dev playground | `esbuild --servedir` or open a test HTML | Better HMR | Best docs-site story |
| Deps / config | 1 binary, ~0 config | Rolldown + config | Framework |

**Biggest risk: committed bundles drift from their sources and deps.** Someone edits `components/tuner.js` and forgets to rebuild, or a dependency bump silently changes behavior. Mitigation: a test or CI step that runs `pnpm build && git diff --exit-code assets/components`, plus the version bump rule from memory (the plugin cache keys on version). A secondary risk is **per-lesson weight**: abcjs alone adds ~507 KB to any lesson with a staff. That is fine for a local file, but it is why selective inlining matters.

---

## 4. Packaging and discovery

**Recommendation: autonomous custom elements, light DOM, attribute- and text-content-driven, one IIFE per tag plus a tiny shared runtime.**

Why custom elements:
- **Trust boundary holds.** Claude writes `<oliba-board fen="…">`, which is data. The vetted bundle is the only code. The existing `<script>` ban in `lesson-write` stays.
- **Native** (rung 4). No framework and no runtime beyond what the tag needs. `customElements` is verified on file://.
- **Progressive enhancement.** Content is the fallback: `<oliba-score>` holds the ABC text, `<oliba-board>` can hold a FEN caption, and `<oliba-play>` wraps a button label. Without JS the lesson still reads.
- **Light DOM, not shadow DOM,** so `oliba.css` tokens, dark mode and print apply without `::part` plumbing.
- **One shared `AudioContext`** (runtime singleton, resumed on first gesture). Results bubble as `CustomEvent('oliba:result', {detail})` so quiz.js can feed FSRS: a sung note becomes a first-attempt result.

Alternatives considered: `data-*` attribute enhancers (today's sound.js style) work, but are harder to validate and to document as a catalog. Framework components (React/Lit) add runtime weight and a JSON/JSX layer Claude doesn't need. iframes break the single-file lesson.

**Selective inlining.** `renderPage` scans the body for `<oliba-([a-z-]+)`, inlines `assets/components/runtime.js` plus each matched `<tag>.js`, and skips the rest. A chess lesson never pays for abcjs or piano samples.
⚠ Alternative: a shared `~/.oliba/lessons/_components/*.js` loaded by classic `<script src>` (verified to work on file://). Lessons get smaller, but they stop being standalone (can't be attached or moved) and suffer version skew. Keep inlining unless lesson size becomes a real complaint.

**Discovery: `assets/components/catalog.json`, a CEM-compatible subset, hand-written:**

```json
{ "schemaVersion": "2.1.0", "modules": [{ "declarations": [{
  "tagName": "oliba-tuner",
  "description": "Live tuner: the learner sings; shows needle + pitch trace against the target. Use after a note is taught by ear.",
  "attributes": [
    { "name": "note", "type": { "text": "string" }, "description": "Target, solfège or letter + octave: lá3, A3" },
    { "name": "tolerance", "type": { "text": "number" }, "default": "25", "description": "Cents counted as in tune" },
    { "name": "any-octave", "type": { "text": "boolean" } }
  ],
  "x-example": "<oliba-tuner note=\"lá3\" any-octave></oliba-tuner>"
}]}]}
```

- **Claude reads it** through `cli.mjs components`, which prints the compact form (tag · when to use · attributes · one example). The /teach SKILL.md says to run it before writing a lesson with interaction. That is the json-render "catalog → prompt" idea, generated rather than hand-copied into the skill.
- **`lesson-write` validates against it.** It rejects unknown `oliba-*` tags and unknown or missing-required attributes, so bad markup fails at write time instead of silently in the browser. That is A2UI's allow-list.
- Adopt `@custom-elements-manifest/analyzer` (generating from JSDoc) only once there are more than ~6 components. Until then, a hand-written file is smaller than the tool.

**Proposed v1 catalog, tiered:**
- **Must-have:** `oliba-play` (smplr piano; notes, tempo, `together`), `oliba-tuner` (pitchy + needle/trace), `oliba-score` (abcjs, ABC as content, optional play), `oliba-board` (cm-chessboard + chess.js; `fen`, `moves`, `orientation`, `interactive`).
- **Should-have:** `oliba-keys` (SVG keyboard highlighting notes, with played or sung notes lighting up). Math via native `<math>` needs no component.
- **Nice-to-have:** `oliba-chord` / fretboard (svguitar) when guitar arrives. `oliba-flip`.

**Attribution** (per the "learn, never copy" rule): credit kunukn/singing-experience, qiuxiang/tuner, json-render, A2UI and OpenUI as inspirations in the README. Credit the sample set too (Splendid: public domain, courtesy note; Salamander would *require* CC-BY attribution).

---

## Open questions / flags

1. ⚠ In my quick test, smplr `Sampler({ buffers: { 60: AudioBuffer } })` rendered **silence** in an OfflineAudioContext, while `SplendidGrandPiano` with a custom `storage` worked. The cause is uninvestigated (maybe scheduler timing in offline render). Prefer the storage route.
2. ⚠ Mic permission persistence on file:// and the effect of Brave farbling on pitch: test by hand once.
3. Licensing: Tone.js/Salamander would add CC-BY attribution duties. chessground, pitchfinder, WebAudioFont and aubio are GPL and **excluded** while oliba is MIT.
4. The sample-name octave convention in smplr's Splendid set (`C3` for MIDI 60) needs a mapping. Generate the embed list by recording the URLs smplr requests (as the probe did), not by filename.
