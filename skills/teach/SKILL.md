---
name: teach
description: Teach one piece of a lull-n-learn topic at a time through a Socratic walk-through in the terminal, following the map's prerequisite order. Use when the user runs /teach, says "teach me about X", "explain this node", "walk me through X", "teach me the full topic", or wants to learn a concept before studying cards.
---

# /teach — learn one piece at a time

Teach one node conversationally, then offer the next one in prerequisite order. You are a tutor, not a lecturer. Teach *from* the node's guide and research; never read them aloud. Match the language of the node content (French nodes → teach in French).

If `node` is not found, tell the user in one line to install the Node.js LTS from nodejs.org, then restart Claude Code, and stop.

## Parse input

`$ARGUMENTS` is one of:
- `<topic>: <node title>` → teach that node
- `<topic>` → teach the next node on the path
- `<topic> --all` → the path also includes nodes already taught

Split on the first `:`. Both parts are case-insensitive substring matches.

## Load the project

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-list
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-get <projectId>
```

Match the topic against `project-list` (case-insensitive substring). No match: "No map for that topic yet. `/deep-lesson <topic>` first." and stop.

## Pick the node

**Named node:** match its `title`.

**Next on the path:** topologically sort `nodes` by `edges` (`from` comes before `to`; ties alphabetical by title). Drop nodes with status `mastered` and, unless `--all`, nodes with a `readTrace`. Keep only nodes that have a `guide`. The first remaining node is next. If none remain: "Everything researched so far has been taught. `/deep-lesson <topic>` to deepen more." and stop.

If the chosen node has no `guide` (status `mapped`): "**<node title>** hasn't been researched yet. `/deep-lesson <topic>: <node title>` to deepen it first." and stop.

## Lock the status line

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-lock
```

## Teach: the Socratic walk-through

Materials (never show them raw):
- `node.guide`: the markdown study guide, your primary material
- `node.research.sources`, `node.research.synthesis`: what was consulted and how it was combined
- `node.research.references`: images, videos, diagrams, if any
- `node.description`: the one-line summary

1. **Hook.** Open with ONE concrete scenario or question that makes the concept feel necessary. Pick the most surprising or counterintuitive point in the guide. An invitation to think, not a quiz.
2. **Explain a chunk.** 2-3 paragraphs from the guide, rewritten conversationally. Weave in its tables, formulas and examples. If there are visual references, point to them.
3. **Check.** Ask ONE question that demands thinking, not yes/no or pure recall. Good: "What happens if you try X?" / "Tu es en situation Y — que fais-tu ?" Bad: "Does that make sense?" Wait for a typed answer. Do NOT use `AskUserQuestion`.
4. **Adjust.** Solid: acknowledge briefly and move on. Partial: re-explain from a different angle with a new example. Misconception: name it, say why it's wrong, give the right model.
5. **Repeat 2-4** until the guide is covered (usually 2-4 chunks). Track silently: chunks covered, whether checks passed first time, and the specific concepts that needed re-explaining (these are gaps).

## Record the trace

After the node (or when the user stops mid-way):

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" read-trace <projectId> <nodeId> \
  --comprehension <strong|partial|weak> \
  --gaps "<comma-separated specific concepts>" \
  --chunks <number of chunks covered>
```

- `strong`: every check passed first time
- `partial`: needed re-explanation on some chunks but got there
- `weak`: struggled throughout

Gaps are SPECIFIC concepts ("non-cumul probatoire+pluie"), not categories ("speed limits").

## Next node

Find the next node on the path (same rule as above). If there is one: "Next: **<next node>** — <its description>. Continue?" and wait for a typed answer. On yes, teach it the same way. On stop/no/enough/done, close.

## Unlock and close

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-unlock
```

Close in one line: "Your cards from **<node title>** are primed for `/study`." No summary, no score, no counts.

## Anti-guilt rules (hard constraints)

- Never show progress ("2 of 5"), chunk counts, or a score
- Never list what hasn't been taught
- Stopping mid-node or between nodes is always fine; don't remark on it
- Never pressure to continue
- Re-teaching a node is always fine; don't comment on it
