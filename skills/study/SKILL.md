---
name: study
description: Run a spaced-repetition study session over due lull-n-learn cards. Use when the user runs /study, says "let's study", "quiz me", or wants to practice what they've been learning. Accepts an optional tag argument to filter by theme (e.g. /study rust, /study project:abc).
---

# Study session

An FSRS-driven retrieval session. Retrieval means production: the user answers before seeing anything. The user can stop at any time and stopping is always fine.

## Arguments

`$ARGUMENTS` may contain a tag or a project name to filter by (e.g. `rust`, `project:abc`, `cooking`, `code de la route`). If present, pass it whole as `--tag "<argument>"` to the `due` command. If empty, fetch all due cards.

`due --tag` first matches card tags; if no card carries that tag, it matches project topics (case- and accent-insensitive substring) and returns that project's cards. If several projects match, it returns `{ "ambiguous": true, "projects": [{ "id", "topic" }] }` instead of cards: ask which one with `AskUserQuestion` (one option per topic), then use `--tag project:<id>` for the rest of the session.

## Start

Lock the status line cue so it stays quiet during the study session:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-lock
```

## Loop

1. Fetch due cards **without answers**:

   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" due --limit 10 --hide-back [--tag "<tag>"]

   The `--hide-back` flag strips the `back` field so you cannot see -- or leak -- the answer before the user does. If `$ARGUMENTS` is non-empty, pass it as `--tag`.

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

> "You read **<node title>** earlier. The gap was around **<gap text>**. `/read <topic>: <node title>` to revisit."

Use the first gap from `readTrace.gaps`. If there are no gaps, just suggest the re-read:

> "**<node title>** might be worth a re-read. `/read <topic>: <node title>` when ready."

**If the node has NO `readTrace`:** The learner hasn't studied this node yet — they went straight to cards. Suggest reading first:

> "You haven't read through **<node title>** yet. `/read <topic>: <node title>` to learn it before reviewing."

**If the node has un-deepened neighbors** (nodes whose prerequisites include this one, with status `mapped`): Fall back to the existing suggestion:

> "You're working through **<node>**. **<neighbor>** builds on it. `/deep-lesson` when ready."

Do not push. Do not repeat if the user has already heard this in this session. One line, one time. Prefer the `/read` suggestion over the `/deep-lesson` suggestion when both apply.

## Anti-guilt rules (hard constraints)

- Never show how many cards are due, remaining, or overdue.
- Never mention missed days, review debt, or how long since the last session.
- Stopping mid-session is always fine; don't remark on it.
- This plugin is grounded in Scott Young's Ultralearning; if the user asks about the method, point them to the plugin's THEORY.md.
