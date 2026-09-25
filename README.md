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
| `/oliba:study results [prompt]` | Rate a lesson's cards from its saved quiz results |
| `/oliba:config` | Settings and status line setup |

## Status line (optional)

One due card's front shows in the status line as a retrieval cue while Claude works. If nothing is due, it stays quiet. Say yes to the first-run offer, or ask `/oliba:config` to set up the status line later. If you already have a status line, it keeps yours and appends the cue.

No counter, no streak, no debt. The cue is a gift, not a demand.

## Theory

See [THEORY.md](THEORY.md) for how the plugin maps to Scott Young's 9 Ultralearning principles.

## Data

All data lives in `~/.oliba/` as plain JSON. No account, no server, no sync. You own your learning state.

Lessons are files too: `~/.oliba/lessons/<topic>/` holds each lesson, an `index.html` linking them, and the topic's `glossary.html`; `~/.oliba/glossary.html` gathers every topic's terms. Each lesson carries its own styles and script, so it works offline and can be sent on its own. The page stores nothing and sends nothing. The button at the end downloads your first attempts as a small JSON file and copies an `/oliba:study results …` prompt that carries them. Run `/oliba:study results` (or paste the prompt) and the lesson's cards are rated from them; the downloaded file is then deleted.

Override the data directory with `OLIBA_DIR` for testing or custom locations.

## Acknowledgements

The way `/teach` works owes a great deal to **Matt Pocock** and his [`/teach` skill](https://github.com/mattpocock/skills/tree/main/skills/productivity/teach), from his MIT-licensed [skills](https://github.com/mattpocock/skills) collection. Using it on a real learning need showed us what oliba was missing. From him we learned:

- **Mission first.** Ask *why* before teaching anything, and aim every lesson at that goal.
- **Learning records.** Keep what the learner has shown (priors, corrected misconceptions, insights) as evidence-gated records that can be superseded, and use them to pick the next lesson in the zone of proximal development.
- **One lesson, one win.** A short, single-file HTML lesson per skill, with quizzes that give instant feedback in the page.
- **A glossary that is earned.** Terms join only once the learner uses them correctly, with the names to avoid listed beside them.
- **Grilling**, from his separate [`grilling`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling) and [`grill-me`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) skills: relentless questioning as a way to stress-test understanding. oliba's grill mode points it at your recorded misconceptions.

oliba's code, styles and wording are its own, written to fit its spaced-repetition core; the ideas above are his. Thank you, Matt.

## License

MIT. An [EquanimiTech](https://equanimi.tech) project.
