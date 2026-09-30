---
tag: pitch
appetite: small
status: draft
source: user seed (record the singing class, pt-BR, project "Teoria musical para cantores" 2a2619ef); docs/pitches/2026-09-30-repertorio.md; skills/teach, skills/study; lib/import-results.mjs; probe of Vibe's sona CLI, 2026-09-30
supersedes: []
hard_dependency: feat/repertorio merged (lib/inbox.mjs, `songs`, `song-get`, `song-set --notes`, sections)
slice_id: C
---

# Pitch -- Aula gravada: one class recording becomes song notes and cards

**Bet:** `/class` takes the Voice Memo of a singing class from `~/Downloads`, transcribes it on the Mac with the whisper model already on disk, and Claude proposes song notes, cards and records from what the teacher said, one question per item. Nothing leaves the machine.

**Why it matters:** The teacher's corrections evaporate between classes. A recording puts them on the page the learner practises from and in the cards `/study` shows.

**Sketch:**

```
phone (Voice Memos) --AirDrop--> ~/Downloads/Aula 30 set.m4a
      /class  ->  inbox (>= 10 min = class)  ->  class-add: sona -> transcript.txt -> project.sources
      Claude reads transcript + nodes + songs  ->  one question per item:
          song note -> song-set --notes     card -> add --tags node:    correction -> record
      "proximo /teach: Transposicao"
```

---

## Boundaries

**JBTD:** As a singer who just left class, when I AirDrop the recording to the Mac, I want the teacher's notes on each song and the terms they used to land in oliba so that next week's practice starts from what they said. Baseline today: the phone records, nobody listens back, notes stay in my head.

**Tiers:** must-have: local transcription, `/class` propose-and-confirm for song notes and cards, consent asked once, class files kept out of `/song add`. should-have: misconception and insight records, vocabulary prompt from node titles, the "next `/teach`" hint. nice-to-have: whisper.cpp timestamps, chunking past 45 min.

**Out:**
- Cloud transcription. The teacher's voice would go to a third party they never agreed to; oliba is local-first (`THEORY.md`).
- Sharing, exporting or playing the class: no class page, no `type: 'class'` resource.
- Diarization. Sung and played passages are skipped, not attributed.
- New syllabus nodes. The transcript joins `project.sources`; `/teach` reads it. Re-mapping is `/syllabus`'s job.
- Reading Voice Memos' folder: macOS denies it (`Operation not permitted`, verified). Share → AirDrop → Downloads.
- Counts, dates as progress, "you haven't recorded", streaks.

## Elements

- **`cli.mjs class-add <projectId> <audio>`** (`lib/classes.mjs`, new; beside `song-add`). Runs `sona transcribe <model> <audio> -l pt`: the whisper.cpp CLI inside Vibe (`/Applications/vibe.app/Contents/MacOS/sona`) on `ggml-large-v3-turbo.bin` (1.6 GB, already in Vibe's Application Support). Probe today: 6 s pt-BR `.m4a`, 1.2 s wall with model load, Metal, one wrong word ("terças em" → "terça e"). Copies the audio and writes `transcript.txt` under `~/.oliba/classes/<project-slug>/<date>-<slug>/`, appends the path to `project.sources` (`lib/cli.mjs:325`). `config.transcriber = { cmd, model }` overrides; tool missing → one line: `brew install --cask vibe`. Rejected: whisper.cpp via brew (same engine, `-oj` timestamps, one install, same model file: the upgrade path); mlx-whisper (pip, Python env, a second 1.5 GB download, no gain at 45 min); macOS Speech (Swift shim, on-device pt-BR weaker over piano). ponytail: no timestamps; notes cite what they said, not when.

- **Inbox knows a class** (`scanInbox`, `lib/inbox.mjs`). A file of 10 min or more gets `kind: 'class'`; `/song add` shows it as "parece uma aula → `/class`" and never proposes it as a song. Same 14-day window; the copy's `source` claims the download.

- **`/class` skill** (`skills/class/SKILL.md`; English names like `/song`). `inbox` → pick a file → `class-add` → read the transcript beside `project-get` (nodes) and `songs` → one `AskUserQuestion` per item, in `language`: a song note ("Flor de Lis: 'não respira antes do refrão'?") → `song-set --notes` with old notes plus the new line; a section they named → `song-set` sections; a fact they taught → `add --front --back --tags project:<id>,node:<nodeId>,class:<date>` when a node title matches (Vocalizes, Transposição, Tons e semitons); a correction of the learner → `record --kind misconception`, their words as evidence; close with "próximo `/teach`: Transposição, a professora falou disso hoje". Rules: repeated syllables, lyric lines and looping fragments are singing, skip them; never invent a key or a time; keep their wording. Lens: BCT 2.7 *feedback on outcome of behaviour*, given by the teacher, kept by the tool; each confirmation is one light retrieval pass. Invisible: no cue, no nudge.

- **Consent, once.** Before the first `class-add` in a project: "Sua professora sabe que a aula é gravada e fica só no seu Mac?" "Sim" writes `project.classConsent: true`, never asked again; "Ainda não" stops in one line, nothing transcribed.

## Risks

**Rabbit holes:**
- Long audio. 45 min untested. Time the first real class on day 1; past 10 min wall, split with `ffmpeg -f segment -segment_time 600` and join. Not before.
- Singing and piano. Whisper loops over music. The skill skips loops; if over half the transcript is noise, try `--vad-model` with silero once (a 2 MB download), then stop. No audio cleanup.
- Portuguese terms. `--prompt` built from node titles ("vocalize, tessitura, semitom, bemol, transposição"); one class to tune, then leave it.

**Off-sides:** a class page with the Repertório player; diarization (Vibe's sortformer model is on disk); auto-transcribe from the Downloads hook: the 5 s `UserPromptSubmit` timeout (`hooks/hooks.json`) can't host it, and a silent 45-min job is a surprise.

**Domain knowledge:** does a phone in a bag catch the teacher over the piano? Do they talk while playing? The first class decides how much the learner fills in by hand.

## Acceptance

1. `class-add` on a real class of 30 min or more writes `transcript.txt` beside a copy of the audio under `~/.oliba/classes/…`, appends the path to `project.sources`, makes no network request.
2. Without sona or the model: one install line, non-zero exit, no partial folder.
3. `inbox` marks a 10-min-plus file `kind: 'class'`; `/song add` never proposes it as a song.
4. `/class` asks consent once per project; "Ainda não" transcribes nothing.
5. From one real class: one note or more on a song's page with old notes intact, one card or more tagged `project:` and `node:`, each confirmed by one question; none from a sung passage.
6. No count of classes, no "last class", no streak anywhere.
7. `node --test lib` green; version bumped; README credits Vibe and whisper.cpp.

---

_Drafted by Claude (scribe). Appetite `small`: one command, one inbox rule, one skill, one real class to prove it. Override with `--appetite=<size>`._
