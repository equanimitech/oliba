# Lull & Learn

Agent-native spaced repetition for Claude Code.

Map a topic, learn it one piece at a time, keep it with spaced repetition. Grounded in [Scott Young's Ultralearning](https://www.scotthyoung.com/blog/2026/04/29/ultralearning-ai/).

Local-first. Anti-guilt.

## Install

1. In a terminal: `claude plugin marketplace add equanimitech/claude-plugins && claude plugin install lull-n-learn@equanimitech`
2. Or inside Claude Code: `/plugin marketplace add equanimitech/claude-plugins`, then `/plugin install lull-n-learn@equanimitech`
3. Needs [Node.js](https://nodejs.org). Restart Claude Code and say yes when it offers the status line.

## How it works

1. **Map.** Run `/syllabus <topic>`: the agent maps the territory into ordered modules with prerequisites and starter cards, and publishes the map as a study guide.
2. **Learn.** Run `/teach <topic>`: the agent teaches the next piece on the map through a Socratic walk-through, researching it only when you reach it.
3. **Study.** Run `/study` in a dedicated session. The FSRS algorithm picks due cards. You type your answer from memory. The agent scores it and reschedules.
4. **Ambient cues (optional).** Say yes to the status line and one due card's front appears as a retrieval cue. Answer it in place with `/study <your answer>`. One cue, never a count.

## Commands

| Command | What it does |
|---|---|
| `/syllabus <topic>` | Map a topic: modules, prerequisites, starter cards |
| `/teach <topic>[: <node>]` | Learn one piece at a time, in prerequisite order |
| `/study [tag \| project \| answer]` | FSRS retrieval session, or score the status-line cue |
| `/config` | Settings and status line setup |

## Status line (optional)

One due card's front shows in the status line as a retrieval cue while Claude works. If nothing is due, it stays quiet. Say yes to the first-run offer, or ask `/config` to set up the status line later. If you already have a status line, it keeps yours and appends the cue.

No counter, no streak, no debt. The cue is a gift, not a demand.

## Theory

See [THEORY.md](THEORY.md) for how the plugin maps to Scott Young's 9 Ultralearning principles.

## Data

All data lives in `~/.lull-n-learn/` as plain JSON. No account, no server, no sync. You own your learning state.

Override the data directory with `LULL_N_LEARN_DIR` for testing or custom locations.

## License

MIT. An [EquanimiTech](https://equanimi.tech) project.
