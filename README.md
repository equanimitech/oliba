# òliba

Catalan for barn owl. Formerly lull-n-learn; data in `~/.lull-n-learn/` moves to `~/.oliba/` on first run.

Agent-native spaced repetition for Claude Code.

Map a topic, learn it one piece at a time, keep it with spaced repetition. Grounded in [Scott Young's Ultralearning](https://www.scotthyoung.com/blog/2026/04/29/ultralearning-ai/).

Local-first. Anti-guilt.

## Install

1. In a terminal: `claude plugin marketplace add equanimitech/oliba && claude plugin install oliba@oliba`
2. Or inside Claude Code: `/plugin marketplace add equanimitech/oliba`, then `/plugin install oliba@oliba`
3. Needs [Node.js](https://nodejs.org). Restart Claude Code and say yes when it offers the status line.

## How it works

1. **Map.** Run `/oliba:syllabus <topic>`: the agent maps the territory into ordered modules with prerequisites and starter cards, and publishes the map as a study guide.
2. **Learn.** Run `/oliba:teach <topic>` (no map needed). The first time, it asks why you're learning it, which language to teach you in, and which language the field's own terms stay in. Each sitting wins one skill: the agent asks what you think before telling you anything, then probes your answers until you reach the idea yourself. It writes the sitting up as one self-contained HTML lesson with think-first prompts and instant-feedback quizzes, which opens in your browser and can be shared as a single file. Quiz items and corrected misconceptions become cards. `/oliba:teach <topic> ?` brings questions back to the terminal.
3. **Study.** Run `/oliba:study` in a dedicated session. The FSRS algorithm picks due cards. You type your answer from memory. The agent scores it and reschedules. `/oliba:study grill me on <topic>` drills your recorded misconceptions and weak cards: explain it back, then why, what-if and a fresh case.
4. **Ambient cues (optional).** Say yes to the status line and one due card's front appears as a retrieval cue. Answer it in place with `/oliba:study <your answer>`. One cue, never a count.

## Commands

| Command | What it does |
|---|---|
| `/oliba:syllabus <topic>` | Map a topic: modules, prerequisites, starter cards |
| `/oliba:teach <topic>[: <node>]` | One skill per sitting by Socratic questions, written up as an HTML lesson |
| `/oliba:teach <topic> ? [question]` | Socratic follow-up questions in the terminal |
| `/oliba:study [tag \| project \| answer]` | FSRS retrieval session, or score the status-line cue |
| `/oliba:study grill me on <topic>` | Drill recorded misconceptions and weak cards |
| `/oliba:study results [prompt]` | Rate a lesson's cards from saved quiz results by hand (normally automatic) |
| `/oliba:song [add \| <title>]` | File the teacher's recordings; one page per song with a practice player |
| `/oliba:class [<audio>]` | Transcribe a class recording on your Mac; keep what was said as song notes, cards and records |
| `/oliba:config` | Settings and status line setup |

## Songs

For a singer with a teacher. Download the teacher's audio in WhatsApp Web (or AirDrop it) and run `/oliba:song add`: oliba finds the new files in `~/Downloads`, pairs the guide ("com voz") with the backing ("sem voz"), asks which song and key, and copies them next to the song's page in `~/.oliba/songs/<topic>/`. The page switches guide and backing at the same spot, loops a section, slows down without changing pitch, and shows the lyrics large below the player, lit line by line when their timing fits the recording. LRCLIB often holds several timings of one song: pick another from the player bar, nudge the delay, or turn following off. Tell `/oliba:song` where the chorus starts, paste a cifra, or say a song is ready; the repertoire groups songs by status, newest first, with no dates and no counts. Tag songs ("festa", "voz") to filter the repertoire, and move a song between statuses or retag it right on its page: **Salvar** saves it for oliba to apply on your next message, like the front door. A song is never a card.

Lyrics come from [LRCLIB](https://lrclib.net), fetched for your own study and stored only on your machine.

## Classes

Record the class on your phone (with the teacher's OK), AirDrop it to the Mac and run `/oliba:class`. oliba transcribes it on the Mac with [Vibe](https://github.com/thewh1teagle/vibe)'s whisper model (`brew install --cask vibe`, then download large-v3-turbo in Vibe once); a 45-minute class takes about a minute. Claude reads the transcript beside your songs and your map and proposes, one question at a time, a note on a song, a card, or a corrected mistake, in the words said in class. Sung passages are skipped. The recording and its transcript stay in `~/.oliba/classes/`; nothing leaves your machine. The first time, it asks whether the teacher knows the class is recorded, once per topic.

## Status line (optional)

One due card's front shows in the status line as a retrieval cue while Claude works. If nothing is due, it stays quiet. Say yes to the first-run offer, or ask `/oliba:config` to set up the status line later. If you already have a status line, it keeps yours and appends the cue.

No counter, no streak, no debt. The cue is a gift, not a demand.

## Theory

See [THEORY.md](THEORY.md) for how the plugin maps to Scott Young's 9 Ultralearning principles.

## Data

All data lives in `~/.oliba/` as plain JSON. No account, no server, no sync. You own your learning state.

Lessons are files too: `~/.oliba/lessons/<topic>/` holds each lesson, an `index.html` linking them, and the topic's `glossary.html`; `~/.oliba/glossary.html` gathers every topic's terms. `~/.oliba/index.html` is the front door: every topic, its mission, and links to its lessons and study guide (`cli.mjs index --open` rebuilds and opens it). Each lesson carries its own styles and script, so it works offline and can be sent on its own. The page stores nothing and sends nothing. Click **Save my results** at the end of a lesson: it downloads your first attempts as a small JSON file, and oliba picks it up from `~/Downloads` on your next prompt, rates the lesson's cards from it (a miss comes back sooner), and deletes the file. That's it. If your browser won't download, the confirmation offers a `/study` prompt to paste instead.

The front door also groups topics by tag and folds archived ones away. Archive a topic or change its tags there: the page can't write your data, so **Save** downloads a small `oliba-actions-*.json` file that oliba applies (and deletes) on your next message, like lesson results; **Copy command** gives the same change as a command to paste. An archived topic's cards rest, out of study and the cue, until you bring it back; nothing is deleted. `/oliba:study <tag>` studies every topic with that tag.

Override the data directory with `OLIBA_DIR` for testing or custom locations.

## Acknowledgements

The way `/teach` works owes a great deal to **Matt Pocock** and his [`/teach` skill](https://github.com/mattpocock/skills/tree/main/skills/productivity/teach), from his MIT-licensed [skills](https://github.com/mattpocock/skills) collection. Using it on a real learning need showed us what oliba was missing. From him we learned:

- **Mission first.** Ask *why* before teaching anything, and aim every lesson at that goal.
- **Learning records.** Keep what the learner has shown (priors, corrected misconceptions, insights) as evidence-gated records that can be superseded, and use them to pick the next lesson in the zone of proximal development.
- **One lesson, one win.** A short, single-file HTML lesson per skill, with quizzes that give instant feedback in the page.
- **A glossary that is earned.** Terms join only once the learner uses them correctly, with the names to avoid listed beside them.
- **Grilling**, from his separate [`grilling`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling) and [`grill-me`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) skills: relentless questioning as a way to stress-test understanding. oliba's grill mode points it at your recorded misconceptions.

oliba's code, styles and wording are its own, written to fit its spaced-repetition core; the ideas above are his. Thank you, Matt.

Class recordings are transcribed by [Vibe](https://github.com/thewh1teagle/vibe) by thewh1teagle (MIT), through its `sona` CLI, which runs [whisper.cpp](https://github.com/ggml-org/whisper.cpp) by Georgi Gerganov and contributors (MIT) on OpenAI's Whisper large-v3-turbo model, locally.

Song lyrics come from [LRCLIB](https://lrclib.net) by tranxuanthang and its contributors: a free, open lyrics database with an open API. The song player is a native `<audio>` element; the library survey behind it and the planned lesson components is in `docs/research/2026-09-30-lesson-components.md`.

## License

MIT. An [EquanimiTech](https://equanimi.tech) project.
