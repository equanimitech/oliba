---
tag: pitch
appetite: medium
status: draft
source: usage audit in equanimitech/.claude/attently/oliba-command-usage.md; Rafa's decisions 2026-10-27
slice_id: A
---

# Pitch: three plain verbs

**Bet:** Rename the loop to `/oliba:map`, `/oliba:learn`, `/oliba:review`, stop map from writing cards, and cut `/oliba:class`, in a few days.

**Why it matters:** The owner can't tell teach from study, about 270 starter cards never got one review, and class has 0 uses. Plain verbs make the loop explain itself to a newcomer before the HN post.

---

## Boundaries

**JBTD:** As a learner opening a topic, I want each command's name to say what happens, so I start the right one without the README. Baseline today: `teach` (18 sessions) and `study` (4) read alike; `syllabus` wrote 489 starter cards, and Herdr, Construction, Rupture brutale and Teoria musical have 0 reviewed.

**Out:**
- Song. It leaves oliba in its own pitch (`2026-10-27-song-leaves-oliba.md`).
- Deleting, archiving or retagging the existing starter cards.
- FSRS, the wait band, the status-line cue.
- Folding grill into learn, or any new mode.

## Elements

- **Rename the three skills** (`skills/syllabus`, `skills/teach`, `skills/study`). Folders, frontmatter and every cross-reference: README (18), THEORY (12), the skills, `lib/session-start.mjs:37`, `lib/statusline.mjs:6`. The name is the cue (BCT 7.1, prompts and cues): map = see the territory, learn = something new, review = keep what you have.
- **Aliases for one minor version.** Thin `syllabus`, `teach`, `study` skills that say "Renamed: run `/oliba:map`" and carry no trigger phrases, so they never compete with the new names. Removed in 0.19.
- **Map without cards** (`workflows/syllabus-map.js:112`, `skills/syllabus/SKILL.md:90`). Map mode drops `starterCards` from its schema; deepen mode keeps cards for learn. The closing line says "N nodes", not "N nodes, M cards". Fewer piles is reduction (PDP) and keeps the anti-guilt promise.
- **Cut class.** `skills/class`, `lib/classes.mjs` and its test, `class-consent`/`class-add` (`lib/cli.mjs:1376`), the README "Classes" section. `~/.oliba/classes/` data is left alone (it's empty).

## Risks

**Rabbit holes:**
- Renaming internal names (`syllabus-map` workflow, `lesson-save`, `projectSlug`). Leave them; only user-facing names move.
- `teach` may read a node's starter cards to pick what to deepen. Check before cutting them from the map.

**Off-sides:** A one-off cleanup of the ~270 unstudied starter cards will be tempting. Separate decision, separate commit.

**Domain knowledge:**
- Confirm a renamed plugin skill plus a thin alias show as two entries in the `/` menu, and that the alias's description stops it auto-triggering.
- `/oliba:review <answer>` must still answer the cue, as `/oliba:study <answer>` did.

## Acceptance

1. `/oliba:map <topic>` saves a project with nodes and 0 cards.
2. `/oliba:learn` and `/oliba:review` behave as teach and study did, grill and cue answer included.
3. `/oliba:teach`, `/oliba:syllabus`, `/oliba:study` each reply with one line naming the new command.
4. No `class` skill, CLI command or README section remains.
5. `grep -rE '/oliba:(syllabus|teach|study)'` finds hits only in the alias skills.
6. `node --test lib/*.test.mjs` and `claude plugin test .` pass; version 0.18.0.

---

_Drafted by Claude (scribe)._
