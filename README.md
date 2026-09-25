# Lull & Learn

Agent-native spaced repetition for Claude Code.

Cards extracted from your real work sessions, reviewed on your schedule, grounded in [Scott Young's Ultralearning](https://www.scotthyoung.com/blog/2026/04/29/ultralearning-ai/).

Local-first. Anti-guilt. Zero-config.

## Install

1. In a terminal: `claude plugin marketplace add equanimitech/claude-plugins && claude plugin install lull-n-learn@equanimitech`
2. Or inside Claude Code: `/plugin marketplace add equanimitech/claude-plugins`, then `/plugin install lull-n-learn@equanimitech`
3. Needs [Node.js](https://nodejs.org). Restart Claude Code and say yes when it offers the status line.

## How it works

1. **Deep lesson.** Run `/deep-lesson <topic>`: the agent maps the territory, generates starter cards at every node, then deepens one section at a time with richer cards and a study guide.
2. **Work normally.** When a session taught you something, run `/harvest`: the agent mines the conversation for learning moments and files card candidates into a sift queue.
3. **Sift.** Run `/sift` to promote harvested candidates to your deck, edit them, or dismiss them. You never keep a card you didn't choose.
4. **Study.** Run `/study` in a dedicated session. The FSRS algorithm picks due cards. You type your answer from memory. The agent scores it and reschedules.
5. **Ambient cues (optional).** Say yes to the status line and one due card's front appears as a retrieval cue. One cue, never a count.

## Commands

| Command | What it does |
|---|---|
| `/deep-lesson <topic>` | Metalearning engine: map a topic, deepen nodes, generate cards and study guide |
| `/study` | FSRS-driven retrieval session |
| `/sift` | Triage harvested card candidates |
| `/card "front" "back"` | Create a card manually |
| `/harvest` | Mine the current session for card candidates |

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
