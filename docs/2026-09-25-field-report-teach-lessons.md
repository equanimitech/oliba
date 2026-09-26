---
tag: brief
status: draft
date: 2026-09-25
relates_to: docs/teach-inspired-upgrades-pitch.md (reopens three of its "Out" items)
evidence: /Users/rafa/Developer/themia/docs/learning/modules/ (a /teach workspace, lesson 1)
---

# Brief: one short HTML lesson beat the deep-lesson map

**Verdict:** On a real learning need, a `/teach` lesson worked where `/deep-lesson` didn't. The lesson was short, single-file and interactive, and tied to a mission. Rafa's words: "I really like this approach." Three things the teach pitch cut should come back in: per-lesson files, in-browser quizzes, and one shareable file.

## Field case

- **Need:** Rafa (not a lawyer) must learn six French legal domains so he can run discovery calls and pitch insurers this week.
- **`/deep-lesson` run** (workflow `wf_0e50e1e2-1c8`, 10 agents, ~1.44M tokens):
  - Stayed on topic. That's progress on the 2026-09-10 incident, when it hallucinated off-topic.
  - Read "maybe a single one?" (one project for all six modules) as "one module", and mapped rupture brutale only.
  - Map and cards were **never persisted** (`projects.json` and `cards.json` unchanged). The return value is the only output.
- **`/teach` lesson 1** (~10 min, one HTML file):
  - Mission first ("discovery calls + Partnership pitches"), asked as 2 questions.
  - Then one skill: explain the claim, compute the damages formula, pick the right Mom-Test opener.
  - Instant-feedback quizzes (options of equal length, no formatting tells) and two numeric exercises.
  - A primary source, a "ask me anything" line, and a glossary that grows per lesson.
  - A learning record that picks lesson 2 from the zone of proximal development.
  - Rafa then asked to **share the HTML by itself**. It needed its CSS/JS inlined to work alone.

## What made it work

| Ingredient | Why it mattered |
|---|---|
| Mission before content | Every section ended in "use it on a call". The map had nodes, not a goal. |
| One skill per lesson | ~10 min, one win. The map offered 13 nodes at once. |
| Retrieval with instant feedback | A quiz and a calculation gave feedback in the browser. That builds storage strength, not fluency. |
| Applied last step | The final quiz was a real decision: which question to open a call with. |
| Single file | Shareable, printable, offline, and outlives the session. |

## Proposal for lull-n-learn

Revise the teach pitch's **Out** list:

1. **Per-lesson artifacts: bring back.** `/lesson` renders one self-contained HTML per node (inline CSS/JS), numbered `0001-…`. The project artifact becomes the index. The deck (FSRS) stays the long-term memory; lessons are the first encounter.
2. **In-browser quizzes: bring back, no sync.** Quizzes give immediate feedback only. Don't sync artifact results to FSRS (still out). Each quiz item also becomes a card, so retrieval continues in `/study`.
3. **Shared stylesheet: keep it at build time only.** One `lull.css` + `quiz.js` in the plugin, inlined into each file at render. You get one look and still ship a single file.

Keep from the existing pitch: `project.mission`, learning records, misconception → card.

## Fixes surfaced by the run

- **Persist step missing or skipped:** the workflow returned map + cards, and nothing wrote them. After persisting, `/deep-lesson` must check that `project-get` returns the new project.
- **Scope parsing:** a vague reply like "a single one?" should go back to an `AskUserQuestion` ("one project for all six, or one module?"), not be resolved by Calibrate.
- **Cost vs value:** 1.44M tokens for 13 nodes that never landed, against about 30k tokens for a lesson Rafa used and shared. Consider a `/lesson`-first path: mission, then one lesson, with the map built lazily.

## Open question

Should `/teach` itself become a lull-n-learn skill (workspace = project folder), or should lull only borrow its lesson renderer? Decide before shaping.
