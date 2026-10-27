# òliba

Catalan for barn owl.

Agent-native spaced repetition for Claude Code.

Map a topic, learn it one piece at a time, keep it with spaced repetition. Grounded in [Scott Young's Ultralearning](https://www.scotthyoung.com/blog/2026/04/29/ultralearning-ai/).

Local-first. Anti-guilt.

## Requirements

- [Claude Code](https://claude.com/claude-code).
- [Node.js](https://nodejs.org) 18 or newer. The current LTS is best.
- macOS or Linux. The hooks run in a POSIX shell. Windows is untested; WSL should work.

## Install

1. In a terminal: `claude plugin marketplace add https://github.com/equanimitech/oliba.git && claude plugin install oliba@oliba`
2. Or inside Claude Code: `/plugin marketplace add https://github.com/equanimitech/oliba.git`, then `/plugin install oliba@oliba`
3. Restart Claude Code.

## How it works

1. **Map.** Run `/oliba:map <topic>`: the agent maps the territory into ordered modules with prerequisites, and publishes the map as a study guide.
2. **Learn.** Run `/oliba:learn <topic>` (no map needed). The first time, it asks why you're learning it, which language to teach you in, and which language the field's own terms stay in. Each sitting wins one skill: the agent asks what you think before telling you anything, then probes your answers until you reach the idea yourself. It writes the sitting up as one self-contained HTML lesson with think-first prompts and instant-feedback quizzes, which opens in your browser and can be shared as a single file. Quiz items and corrected misconceptions become cards. `/oliba:learn <topic> ?` brings questions back to the terminal.
3. **Review.** Run `/oliba:review` in a dedicated session. The FSRS algorithm picks due cards. You type your answer from memory. The agent scores it and reschedules. `/oliba:review grill me on <topic>` drills your recorded misconceptions and weak cards: explain it back, then why, what-if and a fresh case.
4. **While Claude works.** The wait band offers one due card above the prompt (below). One card, never a count.

## Commands

| Command | What it does |
|---|---|
| `/oliba:map <topic>` | See a whole topic first: modules and prerequisites, no cards |
| `/oliba:learn <topic>[: <node>]` | Learn something new: one skill per sitting by Socratic questions, written up as an HTML lesson |
| `/oliba:learn <topic> ? [question]` | Socratic follow-up questions in the terminal |
| `/oliba:review [tag \| project]` | Keep what you have: FSRS retrieval session |
| `/oliba:review grill me on <topic>` | Drill recorded misconceptions and weak cards |
| `/oliba:review results [prompt]` | Rate a lesson's cards from saved quiz results by hand (normally automatic) |
| `/oliba:config` | Wait band topics; archive and tag topics |

Practice pages for songs moved to their own plugin, [bemtevi](https://github.com/equanimitech/bemtevi), which copies the songs you filed here on its first session; `~/.oliba/songs` stays until you delete it.

## Wait band

While Claude works on your prompt, one due card can sit above the prompt. Type your answer, reveal the back, then rate yourself: `1` missed, `2` shaky, `3` got it. When you typed something, Claude names a grade with a short reason, but never pre-selects it; you pick with a number. Press ctrl+x tab (or click the band) to reach it, Esc to go back to the prompt. Skip passes the card for the rest of the session, unscored. Snooze hides the whole band for an hour, the session, or until 04:00 tomorrow; say "wake the band" to end it early. One card per turn; the band leaves when the turn ends (unless you are mid-card) and returns on the next turn, and goes quiet once you rate or skip. If nothing is due, you never see it.

To draw cards only from some topics, set `waitTopics` in `/config` to tags or projects, comma-separated (`italiano, code-de-la-route`). Each turn picks one at random and falls back to the others. Empty means whatever is due first.

The band needs a Claude Code build that loads hooks modules (mods): the terminal and the desktop app's Code tab. On the mobile app it shows Reveal only, with no field to type in.

No counter, no streak, no debt. The card is a gift, not a demand.

Upgrading from 0.18 or earlier: oliba no longer draws a status line. On the first session after the upgrade it gives you back the status line you had before (with a backup of `settings.json` beside it), and the topics you had chosen for the old cue become `waitTopics`.

## Theory

See [THEORY.md](THEORY.md) for how the plugin maps to Scott Young's 9 Ultralearning principles.

## Data

All data lives in `~/.oliba/` as plain JSON. No account, no server, no sync. You own your learning state.

Lessons are files too: `~/.oliba/lessons/<topic>/` holds each lesson, an `index.html` linking them, and the topic's `glossary.html`; `~/.oliba/glossary.html` gathers every topic's terms. `~/.oliba/index.html` is the front door: every topic, its mission, and links to its lessons and study guide (`cli.mjs index --open` rebuilds and opens it). Each lesson carries its own styles and script, so it works offline and can be sent on its own. The page stores nothing and sends nothing. Click **Save my results** at the end of a lesson: it downloads your first attempts as a small JSON file, and oliba picks it up from `~/Downloads` on your next prompt, rates the lesson's cards from it (a miss comes back sooner), and deletes the file. That's it. If your browser won't download, the confirmation offers a `/review` prompt to paste instead.

The front door also groups topics by tag and folds archived ones away. To archive a topic or retag it, ask in the conversation ("archive Chess", "tag Teoria musical as voz"). An archived topic's cards rest, out of review and the wait band, until you bring it back; nothing is deleted. `/oliba:review <tag>` studies every topic with that tag. After an upgrade oliba re-renders every page once, at session start; `cli.mjs index --all` does it on demand.

Override the data directory with `OLIBA_DIR` for testing or custom locations.

Coming from lull-n-learn? Data in `~/.lull-n-learn/` moves to `~/.oliba/` on first run.

## Acknowledgements

The way `/learn` works owes a great deal to **Matt Pocock** and his [`/teach` skill](https://github.com/mattpocock/skills/tree/main/skills/productivity/teach), from his MIT-licensed [skills](https://github.com/mattpocock/skills) collection. Using it on a real learning need showed us what oliba was missing. From him we learned:

- **Mission first.** Ask *why* before teaching anything, and aim every lesson at that goal.
- **Learning records.** Keep what the learner has shown (priors, corrected misconceptions, insights) as evidence-gated records that can be superseded, and use them to pick the next lesson in the zone of proximal development.
- **One lesson, one win.** A short, single-file HTML lesson per skill, with quizzes that give instant feedback in the page.
- **A glossary that is earned.** Terms join only once the learner uses them correctly, with the names to avoid listed beside them.
- **Grilling**, from his separate [`grilling`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling) and [`grill-me`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) skills: relentless questioning as a way to stress-test understanding. oliba's grill mode points it at your recorded misconceptions.

oliba's code, styles and wording are its own, written to fit its spaced-repetition core; the ideas above are his. Thank you, Matt.

## Development

No dependencies, no build step. Run the tests with:

```sh
node --test lib/*.test.mjs
```

The wait band is `hooks/wait-band.tsx`; check and test it with `claude plugin validate .` and `claude plugin test .`.

Set `OLIBA_DIR` to a scratch folder to try the CLI without touching your own data.

## License

MIT. An [EquanimiTech](https://equanimi.tech) project.
