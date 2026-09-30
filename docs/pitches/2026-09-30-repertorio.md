---
tag: pitch
appetite: medium
status: draft
source: user seed (songs from the teacher over WhatsApp, a Spotify playlist, a friend on guitar); docs/research/2026-09-30-lesson-components.md; ~/.oliba project "Teoria musical para cantores"; user decisions 2026-09-30 (below); first real files: "Flor de Lis" (Djavan), guide and backing, Bb
supersedes: []
slice_id: B
---

# Pitch -- Repertório: the teacher's recordings, one page per song

**Bet:** A song becomes oliba's first typed resource: Claude files the teacher's audio and the song's facts as JSON, the CLI renders one local page per song with a player that loops a section, slows down without changing pitch and switches guide/backing. Ready for next week's class.

**Why it matters:** Practice today starts by scrolling a WhatsApp thread for the right audio. With one page per song, it starts at the hard bar, in the learner's key. The same shape carries a guitarist's cifra later, and the type registry is the seam lessons can move onto.

---

## Boundaries

**JBTD:** As a singer with a class next week, when I sit down to practise, I want each song's guide and backing tracks, key, lyrics and the teacher's notes on one page, so that I rehearse the hard section instead of hunting for files. Baseline today: audio lives only in WhatsApp chats, the playlist on Spotify, the notes in my head.

**Tiers:** must-have: typed song resource, song page with the player, repertoire index, intake from Downloads, lyrics from LRCLIB. should-have: iCloud inbox folder, tuner overlay via the catalog, sections saved from the page, `/song fetch <contact>` (below). nice-to-have: lyric line highlight in time with the player (with an offset knob), cards tied to a song, chord boxes for guitar.

**Decisions after drafting (2026-09-30):**
1. **Key lives on each version, not on the song.** The teacher sometimes re-sends a song in a new key. The song keeps `originalKey`; each version carries its own `key`.
2. **The teacher sends audio files, not voice notes.** They arrive as `.m4a`, or as MP3 named `.mpeg` from WhatsApp Web; Chrome plays both directly. No conversion.
3. **Intake is WhatsApp Web / Desktop on the Mac.** Downloads land in `~/Downloads`; `cli.mjs inbox` lists audio there (`m4a mp3 mpeg mp4 aac ogg opus wav`) not yet claimed by a song. AirDrop is the same path. Suffixes name the role ("sem voz", "instrumental", "playback", "karaoke", "no vocals" → base; "com voz", "guia", "with vocals" → guia), and files whose names match loosely (edit distance ≤ 2) and whose durations match (±0.5 s, `afinfo`) are proposed as one song. The originals stay in Downloads: the CLI copies, and the copy's `source` claims the file. The iCloud `config.inbox` stays a should-have.
4. **Lyrics are a must-have, via [LRCLIB](https://lrclib.net)** (free, open, no key). Adding a song, or `song-lyrics <songId>`, searches `/api/search?track_name=&artist_name=` and keeps the hit whose duration is closest to the teacher's audio (±3 s), storing plain lyrics, synced lyrics (LRC) when present, and the LRCLIB id. No match or no network: one line, and the song still saves. Lyrics are fetched for personal study and stored locally.

**Out:**
- FSRS on songs. A song is a skill you keep, not a fact you recall: no due songs, no run-through counts, no "last sung" anywhere (anti-guilt, `THEORY.md:95`).
- WhatsApp automation and Spotify audio. No personal WhatsApp API; Spotify gives a link and metadata. The link renders as `<a>`; nothing is embedded or fetched.
- Scraping lyrics or cifra from Letras, Cifra Club or any site without an open API. The learner pastes a cifra (`song-set --cifra`); lyrics come only from LRCLIB.
- A background or polling WhatsApp scraper. Nothing watches the teacher's chat on its own.
- Waveforms. `fetch` of a local file is blocked on `file://` (research §0), so wavesurfer can't decode; a plain `<audio>` loads a sibling file (verified below).
- Moving lessons onto the resource registry this cycle.
- A song as a project kind, or a `songs.json` aggregate (rejected; element 1).
- Audio conversion. Files play as they arrive, or the page says which one doesn't.
- Moving or deleting the learner's downloads. Intake copies.

## Elements

- **Typed resource, minimal registry** (`lib/resources.mjs`, new). `project.resources: [{ id, type: 'song', ... }]` beside `project.lessons`. The registry is one object literal, `TYPES.song = { required, dir, render, review: 'none' }`: schema, page template, the `<oliba-*>` tags it uses, review mode. Review mode belongs to the type because the type decides what the page hands back and what the CLI does with it (lesson: quiz results → FSRS, `lib/results.mjs:27`; song: nothing). Song fields: `title, artist, spotify, originalKey, sections: [{ name, start, end }], lyrics, syncedLyrics, lrclibId, cifra, notes, versions: [{ kind: 'guia' | 'base' | 'original', file, key, duration, source }], status: 'working' | 'repertoire' | 'retired'`. Transposition is derived at render, never stored. Rejected: a project kind (every command from `project-create` to `index` forks on kind, and the singer's songs share one mission with her theory map, project `2a2619ef`); a separate aggregate (songs have no life outside a project). ponytail: one entry makes this a named object, not a plugin system; it earns its name when `lesson` moves in.

- **CLI: `song-add`, `song-set`, `song-version`** (`lib/cli.mjs`, beside `lesson-save`, `lib/cli.mjs:540`). `song-add <projectId> < song.json` validates `required`, copies the named audio into `~/.oliba/songs/<project-slug>/<song-slug>/` (pattern `lessonDir`, `lib/cli.mjs:668`), renders page and repertoire index, rebuilds the home index with a "Repertório" link (`writeHomeIndex`, `lib/cli.mjs:699`). Claude fills fields; it never writes song HTML, so the `lesson-write` bans stay untouched.

- **Song page and index** via `TYPES.song.render` and `renderPage` (`lib/cli.mjs:640`). Header: title, artist, "Tom original", each version's key with its semitone difference ("Guia · Bb (−2 st)"), Spotify link. Then the player, sections as loop buttons, lyrics or cifra in `<pre>`, the teacher's notes. Relative `src="guia.m4a"` is a type rule: the page sits next to its audio. The index groups songs under "Em trabalho / Repertório / Guardadas", no dates or counts, like `writeLessonIndex` (`lib/cli.mjs:679`).

- **`<oliba-player>`** (`components/player.js`, ~100 lines, no library). One `<audio>` per version; native `preservesPitch` slows without changing pitch; A and B marks loop on `timeupdate`; the toggle swaps elements at the same `currentTime`; rate 0.5–1.0; a visible clock so the learner can say "refrão em 0:42". Verified 2026-09-30, headless Chrome, `file://`: a sibling `.wav` loads, seeks, `preservesPitch` present, `playbackRate` 0.75 sticks. A catalog entry if `2026-09-30-lesson-components.md` has landed (its `lib/components.mjs` inlines bundles per tag); otherwise inlined by the song template like `sound.js` today. No hard dependency. Behavioral lens: BCT 12.5 *adding objects to the environment* and 8.7 *graded tasks*: one click to the file, then loop and slow the hard bar and bring the rate back to 1.0. Invisible lever: no nudge, no cue.

- **Intake and `/song` skill** (`skills/song/SKILL.md`, `cli.mjs inbox`). WhatsApp Web / Desktop on the Mac (or AirDrop from the phone) → `~/Downloads`, the folder the results hook already watches (`lib/results.mjs:13`). `inbox` lists audio (`m4a mp3 mpeg mp4 aac ogg opus wav`) newer than 14 days and not yet claimed by a song, with each file's role guessed from its suffix and loose-name + duration groups; `config.inbox` (an iCloud folder) is a should-have (`readConfig`, `lib/store.mjs:165`). `/song add` asks one question per file (which song, guide or backing) and calls `song-add`/`song-version`. `/song <title>` opens the page; `/song` the index. Tuner overlay: `<oliba-tuner note="<starting note>">` in the header once the catalog ships.

- **Should-have, not built: `/song fetch <contact>`.** A user-started, supervised skill that drives the learner's already logged-in WhatsApp Web (Claude in Chrome or cmux-cua computer use) to open the teacher's chat and download new audio files into `~/Downloads`; the inbox flow above takes over from there. Risks: it breaks whenever WhatsApp changes its web page, and WhatsApp's terms forbid automated access (low volume, but a nonzero risk to the learner's account).

## Risks

**Rabbit holes:**
- Containers. The teacher's files arrive as `.m4a`, or as MP3 with a `.mpeg` extension from WhatsApp Web (first real pair, 2026-09-30). The extension doesn't decide playability; check the page plays each one, and if one fails the page says so in one line.
- Brave. The headless probe hung in Brave (a headless quirk, not a media result). Hand-check once.
- Section editing. Marks typed to Claude in v1. A "save section" button downloading `oliba-song-*.json` for the hook is one regex away (`RESULTS_FILE`, `lib/results.mjs:15`); out until typed marks hurt.
- Player polish. Buttons and a clock in `oliba.css` tokens. No waveform, no shortcuts, no pitch shifting.

**Off-sides:**
- Cards on a song ("qual o tom de X na sua voz?"): ordinary cards tagged `song:<id>`. Real recall, fits FSRS. Next slice.
- Guitar: `cifra` as `<pre>` now; svguitar chord boxes when the friend is real. `~/.oliba/songs` is plain HTML plus audio, so a friend without Claude Code can receive the folder as is.
- Lessons as `type: 'lesson'`; results import per type.

**Domain knowledge:**
- Does the teacher re-send a song in a new key? Yes: `key` belongs on the version (decision 1).
- Synced lyrics are timed to a commercial recording. The teacher's version of "Flor de Lis" runs 223 s against LRCLIB hits of 222–228 s, so the highlight may line up; an offset knob covers the rest.
- Song pages are not standalone: the HTML needs its audio beside it. Fine for a local folder; say so in the footer.

## Acceptance

1. `node lib/cli.mjs song-add <projectId> < song.json` writes `~/.oliba/songs/<project-slug>/<song-slug>/index.html` next to the moved audio; `project-get` shows the resource with `type: "song"`; a missing required field fails in one line.
2. From `file://`, the page plays guide and backing from the same position, loops between two marks, and plays at 0.75 with pitch unchanged, in Chrome and Brave.
3. The page shows both keys and the semitone difference, the sections, lyrics or cifra, and the notes. No dates, no counts on page or index.
4. `node lib/cli.mjs inbox` lists WhatsApp downloads from `~/Downloads` (`.m4a`, `.mpeg`), groups "flor de lis - sem voz" with "flor de liz - com voz" as base and guia; `/song add` files them with one question per group, and the originals stay in Downloads.
4b. Adding a song fetches its lyrics from LRCLIB and shows them next to the player; offline or no match, it says so in one line and the song saves.
5. `~/.oliba/index.html` links "Repertório" for the music project; the index groups songs by status only.
6. The learner's three current songs, guide and backing each, open from their own page before next class.
7. `lesson-write` and its tests unchanged; `node --test lib` passes; version bumped (the plugin cache keys on version).

---

_Drafted by Claude (scribe). Appetite `medium`: registry, CLI, page, player, intake. Class-ready slice: elements 1–4 with hand-typed file paths in the first two days, then intake and the skill. Override with `--appetite=<size>`._
