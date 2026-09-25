---
name: study
description: Run a spaced-repetition study session over due oliba cards, or score the status-line cue. Use when the user runs /study, says "let's study", "quiz me", "answer the cue", types an answer to the status-line card, says "grill me on X", or wants to practice what they've been learning. Accepts a tag or project to filter by (e.g. /study rust, /study code de la route) or an answer to the cue (e.g. /study single ownership).
---

# Study session

An FSRS-driven retrieval session. Retrieval means production: the user answers before seeing anything. The user can stop at any time and stopping is always fine.

If `node` is not found, tell the user in one line to install the Node.js LTS from nodejs.org, then restart Claude Code, and stop.

## Arguments

Resolve `$ARGUMENTS` first. Never guess what they mean yourself:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-resolve "<$ARGUMENTS, shell-quoted>"
```

It checks in a fixed order and prints one `mode`:

| `mode` | Meaning | Do |
|---|---|---|
| `grill` | "grill me on …" | Go to **Grill**. |
| `filter` | A known tag or project topic | Run the session below with `--tag "<tag>"`. |
| `cue` | A cue is showing and the text is the user's answer to it | Go to **Answer the cue**. |
| `ask` | The text is a tag *and* a cue is showing | Ask one `AskUserQuestion`: "Answer the cue" or "Study <tag>". Then follow that row. |
| `results` | Lesson results from the page's save button | Go to **Lesson results**. |
| `plain` | Nothing to filter | Run the session below over every due card. If `unmatched` is set, say in one line that nothing matched it. |

`due --tag` first matches card tags; if no card carries that tag, it matches project topics (case- and accent-insensitive substring) and returns that project's cards. If several projects match, it returns `{ "ambiguous": true, "projects": [{ "id", "topic" }] }` instead of cards: ask which one with `AskUserQuestion` (one option per topic), then use `--tag project:<id>` for the rest of the session.

## Answer the cue

One exchange, no ceremony. The status-line card is `cardId`; the user's answer is `answer`.

1. Fetch the card: `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" current-cue`
2. Compare `answer` to the card's `back` and pick a rating (`again`, `hard`, `good`, `easy`, as in the loop below).
3. Rate it and clear the cue so the status line picks a fresh card next time:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" rate <cardId> <rating>
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" clear-cue
   ```

4. Respond in **one line**: what they got right or missed, and when it comes back (from the updated `fsrs.due`). Example: "Got ownership but missed reference validity. Back in 3 days." Do not show the front again, do not start a session, and do not mention how many cards are due. Back to work.

## Lesson results

A lesson's save button hands its quiz answers to FSRS: a miss rates the quiz's card `again`, a hit rates it `good`. Only the learner's first attempt at each quiz counts.

- `args` holds results (`<projectId> <lesson.html> q1:✗ q2:✓ …`, the copied prompt): run
  `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" results-import <args, each shell-quoted>`
- `args` is empty: use the newest download, `ls -t ~/Downloads/oliba-results-*.json | head -1`, and run
  `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" results-import --file "<that path>"`. On success the CLI deletes the file. If there is no file, say in one line to click the save button at the end of the lesson and paste the prompt it copies.

It prints `{ rated, skipped }`. Cards already reviewed since the answers are skipped, so importing twice is harmless. Reply in **one line**, no counts, e.g. "Saved. The ones you missed come back sooner." If nothing was rated: "Already saved." Don't start a session.

## Grill

The Socratic drill: attack the weakest points until they hold. Not an FSRS session: nothing is rated, and answers are never scored aloud.

*Grilling is learned from Matt Pocock's `grilling` skill: https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling (MIT). Here it is aimed at recorded misconceptions (Ultralearning's Drill principle).*

1. Get the targets. `target` is `<project>` or `<project>: <node>`; pass the part before `:`:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" grill-targets "<project part of target>"
   ```

   `{ ambiguous: true, projects }`: ask which one with `AskUserQuestion`, then run it again with that topic. A failure (no project matches): say so in one line and stop. With a node part, keep only the records and cards whose `node` / `node:<id>` tag matches that node's title in `project-get`.

2. If `misconceptions` and `weakCards` are both empty: "Nothing weak to grill on **<topic>** right now." and stop.

3. Lock the status line: `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-lock`

4. Take targets one at a time, open misconceptions first, then weak cards (their `front` says what the idea is). For each, climb this ladder, one question per turn, waiting for a typed answer. Never `AskUserQuestion`, never options, never show the card's back or the record's text first.
   - **Explain back.** "Explain <idea> in your own words, as you'd put it to <someone from the mission>." (the Feynman move)
   - **Why.** Ask why each claim in their answer holds, until it rests on something they understand or they hit the gap.
   - **What if.** Change one fact of the case and ask what follows.
   - **Transfer.** A fresh case from the mission's world that needs the same idea.

   A rung they clear: move up. A rung they miss: probe once with a counter-example and let them repair it; reveal only what they couldn't reach, then ask the rung again with a new case. Say plainly what holds and what doesn't; no scores, no tallies.

5. Every gap found leaves exactly one record and one card:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" record <projectId> --kind misconception --text "<the wrong model>" --evidence "<how it was corrected>" \
     [--node <nodeId>] --front "<contrast question, in language>" --back "<right model, and why the wrong one fails>"
   ```

   When a target misconception now holds through the transfer rung, record the fix and mark the old one:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" record <projectId> --kind insight --text "<the right model>" --evidence "<their transfer answer>" --supersedes <misconceptionId>
   ```

6. Speak `language` throughout; keep domain terms in `termLanguage` with their gloss, as `/teach` does.

7. Stop when the targets run out or the user stops. Unlock (`study-unlock`) and close in one line, e.g. "Good grilling." No summary, no count of gaps or targets.

## Start

Lock the status line cue so it stays quiet during the study session:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-lock
```

## Loop

1. Fetch due cards **without answers**:

   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" due --limit 10 --hide-back [--tag "<tag>"]

   The `--hide-back` flag strips the `back` field so you cannot see -- or leak -- the answer before the user does. Pass `--tag` only in `filter` mode.

2. If the list is empty: say "Nothing is due right now." and stop. Do NOT say when the next card is due, how many cards exist, or suggest coming back later.
3. For each card, one at a time:
   a. Show ONLY the front, phrased as the question it is. Never reveal the back first. Never say how many cards are in the batch or remain. Do NOT use `AskUserQuestion` with answer options -- the user must type their answer freely with no choices to pick from.
   b. Wait for the user's typed answer.
   c. **After** the user answers, reveal the back:

      node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" reveal <cardId>

      Compare their answer to the revealed back. Give one or two sentences of feedback: what they got, what they missed. If the response has a `ref` field (a URL to the study guide section), mention it after feedback: "See the study guide: <ref>" -- this lets the user look up context if they want to go deeper. Don't repeat the ref on cards rated `easy`.
   d. Choose a rating from the comparison:
      - `again`: they blanked or got it wrong
      - `hard`: partially right, a significant gap
      - `good`: right, perhaps imprecise at the edges
      - `easy`: right, instant, complete
   e. Apply it:

      node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" rate <cardId> <rating>

      The command prints the updated card; its `fsrs.due` is the next review date.
   f. Mention the next review conversationally ("this one comes back in about 3 days"), then move to the next card. A card rated `again` may reappear later in this same session via a fresh `due` call; that is intended.
4. If the user says "skip", move on without calling `rate`. The card stays due, unscored. Never comment on skips.
5. When the batch is done or the user stops: unlock the status line cue and close warmly in one line, e.g. "Good session." NO summary counts, NO "X of Y correct", NO streaks, NO "see you tomorrow".

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-unlock
   ```

## Post-session: project node suggestion

After the review session ends (batch done or user stops), check if any cards rated `again` or `hard` belong to a project. Look at those cards' tags for entries matching `project:<id>` and `node:<id>`.

If found, load the project:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-get <projectId>
```

Find the node the weak card belongs to.

**If the node has a `readTrace`:** The learner already studied this node. Mention the gap if one exists:

> "You worked through **<node title>** earlier. The gap was around **<gap text>**. `/teach <topic>: <node title>` to revisit."

Use the first gap from `readTrace.gaps`. If there are no gaps, just suggest a revisit:

> "**<node title>** might be worth another pass. `/teach <topic>: <node title>` when ready."

**If the node has NO `readTrace`:** The learner went straight to cards. Suggest learning it first:

> "You haven't been taught **<node title>** yet. `/teach <topic>: <node title>` to learn it before reviewing."

Do not push. Do not repeat if the user has already heard this in this session. One line, one time.

## Anti-guilt rules (hard constraints)

- Never show how many cards are due, remaining, or overdue.
- Never mention missed days, review debt, or how long since the last session.
- Stopping mid-session is always fine; don't remark on it.
- This plugin is grounded in Scott Young's Ultralearning; if the user asks about the method, point them to the plugin's THEORY.md.
