# Teaching Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/read` and `/lesson` skills that teach deepened nodes conversationally, bridging the gap between `/deep-lesson` (mapping) and `/study` (retrieval).

**Architecture:** Two new skills (`/read`, `/lesson`) consume project node data already produced by `/deep-lesson`. A new `read-trace` CLI subcommand persists comprehension signals per node. The existing `due` command gains trace-aware sorting so `/study` prioritizes recently-read and weak-comprehension cards. The deep-lesson workflow adds reference fetching to produce richer material.

**Tech Stack:** Node.js (ESM, `node:test`), pure JS CLI, SKILL.md files for Claude Code plugin skills.

**Spec:** `docs/teaching-surface-design.md`

## Global Constraints

- Plugin version must be bumped in `.claude-plugin/plugin.json` (cache-busting — changes are invisible without a version bump)
- All CLI commands print JSON to stdout; errors to stderr, exit code 1
- Data lives in `~/.lull-n-learn/` as plain JSON; `LULL_N_LEARN_DIR` env var overrides for tests
- Tests use `node:test` with `node:assert/strict`; run via `node --test lib/*.test.mjs`
- Anti-guilt: never show counts, streaks, debt, or "you missed X" messaging in any skill
- Skills reference CLI via `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" <subcommand>`
- Functional style; pure functions preferred; SOLID principles

---

### Task 1: `read-trace` CLI subcommand + tests

**Files:**
- Modify: `lib/cli.mjs:284-468` (add `cmdReadTrace` function and register it in dispatch table)
- Modify: `lib/cli.test.mjs` (add read-trace test block)

**Interfaces:**
- Consumes: `readProjects()`, `writeProjects()` from `store.mjs`; `parseArgs` from `node:util`
- Produces: `read-trace` subcommand — `node cli.mjs read-trace <projectId> <nodeId> --comprehension strong|partial|weak --gaps "gap1,gap2" --chunks 4` → prints updated project JSON to stdout

- [ ] **Step 1: Write the failing tests**

Add to `lib/cli.test.mjs`, after the existing project tests (around line 317):

```js
// --- Read trace commands ---

test('read-trace sets readTrace on a node', () => {
  const project = run('project-create', '--topic', 'test');
  const updated = {
    ...project,
    nodes: [{ id: 'n1', title: 'basics', description: 'desc', status: 'deepened', cardIds: [], research: null, guide: 'some guide' }],
    edges: [],
  };
  runWithStdin(JSON.stringify(updated), 'project-update', project.id);
  const result = run('read-trace', project.id, 'n1', '--comprehension', 'partial', '--gaps', 'gap one,gap two', '--chunks', '3');
  const node = result.nodes.find((n) => n.id === 'n1');
  assert.ok(node.readTrace);
  assert.equal(node.readTrace.comprehension, 'partial');
  assert.deepEqual(node.readTrace.gaps, ['gap one', 'gap two']);
  assert.equal(node.readTrace.chunks, 3);
  assert.ok(node.readTrace.readAt);
});

test('read-trace works with no gaps', () => {
  const project = run('project-create', '--topic', 'test');
  const updated = {
    ...project,
    nodes: [{ id: 'n1', title: 'basics', description: 'desc', status: 'deepened', cardIds: [], research: null, guide: 'guide' }],
    edges: [],
  };
  runWithStdin(JSON.stringify(updated), 'project-update', project.id);
  const result = run('read-trace', project.id, 'n1', '--comprehension', 'strong', '--chunks', '2');
  assert.deepEqual(result.nodes[0].readTrace.gaps, []);
  assert.equal(result.nodes[0].readTrace.comprehension, 'strong');
});

test('read-trace overwrites existing trace', () => {
  const project = run('project-create', '--topic', 'test');
  const updated = {
    ...project,
    nodes: [{ id: 'n1', title: 'basics', description: 'desc', status: 'deepened', cardIds: [], research: null, guide: 'guide' }],
    edges: [],
  };
  runWithStdin(JSON.stringify(updated), 'project-update', project.id);
  run('read-trace', project.id, 'n1', '--comprehension', 'weak', '--gaps', 'first gap', '--chunks', '4');
  const result = run('read-trace', project.id, 'n1', '--comprehension', 'strong', '--chunks', '3');
  assert.equal(result.nodes[0].readTrace.comprehension, 'strong');
  assert.deepEqual(result.nodes[0].readTrace.gaps, []);
  assert.equal(result.nodes[0].readTrace.chunks, 3);
});

test('read-trace rejects unknown project', () => {
  assert.throws(() => run('read-trace', 'nonexistent', 'n1', '--comprehension', 'strong', '--chunks', '1'));
});

test('read-trace rejects unknown node', () => {
  const project = run('project-create', '--topic', 'test');
  const updated = { ...project, nodes: [{ id: 'n1', title: 'a', description: 'a', status: 'deepened', cardIds: [], research: null }], edges: [] };
  runWithStdin(JSON.stringify(updated), 'project-update', project.id);
  assert.throws(() => run('read-trace', project.id, 'n-wrong', '--comprehension', 'strong', '--chunks', '1'));
});

test('read-trace rejects invalid comprehension value', () => {
  const project = run('project-create', '--topic', 'test');
  const updated = { ...project, nodes: [{ id: 'n1', title: 'a', description: 'a', status: 'deepened', cardIds: [], research: null }], edges: [] };
  runWithStdin(JSON.stringify(updated), 'project-update', project.id);
  assert.throws(() => run('read-trace', project.id, 'n1', '--comprehension', 'excellent', '--chunks', '1'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test lib/cli.test.mjs 2>&1 | grep -E 'read-trace|FAIL|PASS'`
Expected: All 6 new tests FAIL (command not recognized)

- [ ] **Step 3: Implement `cmdReadTrace`**

Add to `lib/cli.mjs`, before the `// --- Cue command ---` section (around line 387):

```js
// --- Read trace command ---

const VALID_COMPREHENSION = ['strong', 'partial', 'weak'];

/** @param {string[]} argv */
function cmdReadTrace(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      comprehension: { type: 'string' },
      gaps: { type: 'string' },
      chunks: { type: 'string' },
    },
    allowPositionals: true,
  });
  const [projectId, nodeId] = positionals;
  if (!projectId || !nodeId || !values.comprehension || !values.chunks) {
    fail('usage: read-trace <projectId> <nodeId> --comprehension strong|partial|weak --chunks <n>');
  }
  if (!VALID_COMPREHENSION.includes(values.comprehension)) {
    fail(`--comprehension must be one of: ${VALID_COMPREHENSION.join(', ')}`);
  }
  const chunks = Number(values.chunks);
  if (!Number.isFinite(chunks) || chunks < 1) {
    fail('--chunks must be a positive integer');
  }
  const projects = readProjects();
  const project = projects[projectId];
  if (!project) fail(`no project with id ${projectId}`);
  const node = project.nodes.find((/** @type {any} */ n) => n.id === nodeId);
  if (!node) fail(`no node with id ${nodeId} in project ${projectId}`);
  node.readTrace = {
    readAt: new Date().toISOString(),
    chunks,
    comprehension: values.comprehension,
    gaps: values.gaps ? values.gaps.split(',').map((/** @type {string} */ g) => g.trim()).filter(Boolean) : [],
  };
  writeProjects(projects);
  computeNodeStatuses(project, readCards());
  out(project);
}
```

Register in the dispatch table — add `'read-trace': cmdReadTrace,` to the `commands` object after `'project-add-cards'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test lib/cli.test.mjs 2>&1 | grep -E 'read-trace|FAIL|PASS'`
Expected: All 6 new tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/cli.mjs lib/cli.test.mjs
git commit -m "feat(cli): add read-trace subcommand for teaching surface"
```

---

### Task 2: Trace-aware `due` sorting + tests

**Files:**
- Modify: `lib/cli.mjs:86-141` (update `dueCards` function and `cmdDue`)
- Modify: `lib/cli.test.mjs` (add trace-aware due tests)

**Interfaces:**
- Consumes: `readProjects()` from `store.mjs`; `readCards()` already used by `cmdDue`; `read-trace` subcommand from Task 1
- Produces: Modified `due` command — cards from recently-read or weak-comprehension nodes sort to front of due batch

- [ ] **Step 1: Write the failing tests**

Add to `lib/cli.test.mjs`:

```js
// --- Trace-aware due sorting ---

test('due sorts recently-read node cards before others', () => {
  const project = run('project-create', '--topic', 'trace-test');
  const card1 = run('add', '--front', 'old card', '--back', 'a', '--tags', `project:${project.id},node:n1`);
  const card2 = run('add', '--front', 'new card', '--back', 'b', '--tags', `project:${project.id},node:n2`);

  const updated = {
    ...project,
    nodes: [
      { id: 'n1', title: 'old', description: 'd', status: 'deepened', cardIds: [card1.id], research: null, guide: 'g' },
      { id: 'n2', title: 'new', description: 'd', status: 'deepened', cardIds: [card2.id], research: null, guide: 'g' },
    ],
    edges: [],
  };
  runWithStdin(JSON.stringify(updated), 'project-update', project.id);

  run('read-trace', project.id, 'n2', '--comprehension', 'strong', '--chunks', '2');

  const due = run('due');
  assert.ok(due.length >= 2);
  assert.equal(due[0].id, card2.id, 'recently-read card should come first');
});

test('due sorts weak-comprehension cards before strong', () => {
  const project = run('project-create', '--topic', 'weak-test');
  const cardStrong = run('add', '--front', 'strong card', '--back', 'a', '--tags', `project:${project.id},node:ns`);
  const cardWeak = run('add', '--front', 'weak card', '--back', 'b', '--tags', `project:${project.id},node:nw`);

  const updated = {
    ...project,
    nodes: [
      { id: 'ns', title: 'strong', description: 'd', status: 'deepened', cardIds: [cardStrong.id], research: null, guide: 'g' },
      { id: 'nw', title: 'weak', description: 'd', status: 'deepened', cardIds: [cardWeak.id], research: null, guide: 'g' },
    ],
    edges: [],
  };
  runWithStdin(JSON.stringify(updated), 'project-update', project.id);

  run('read-trace', project.id, 'ns', '--comprehension', 'strong', '--chunks', '2');
  run('read-trace', project.id, 'nw', '--comprehension', 'weak', '--gaps', 'some gap', '--chunks', '3');

  const due = run('due');
  assert.ok(due.length >= 2);
  assert.equal(due[0].id, cardWeak.id, 'weak-comprehension card should come first');
});

test('due sorts gap-matched cards to front', () => {
  const project = run('project-create', '--topic', 'gap-test');
  const cardMatch = run('add', '--front', 'non-cumul rule explained', '--back', 'a', '--tags', `project:${project.id},node:n1`);
  const cardNoMatch = run('add', '--front', 'unrelated question', '--back', 'b', '--tags', `project:${project.id},node:n1`);

  const updated = {
    ...project,
    nodes: [
      { id: 'n1', title: 'speed', description: 'd', status: 'deepened', cardIds: [cardMatch.id, cardNoMatch.id], research: null, guide: 'g' },
    ],
    edges: [],
  };
  runWithStdin(JSON.stringify(updated), 'project-update', project.id);

  run('read-trace', project.id, 'n1', '--comprehension', 'partial', '--gaps', 'non-cumul', '--chunks', '3');

  const due = run('due');
  assert.ok(due.length >= 2);
  assert.equal(due[0].id, cardMatch.id, 'gap-matched card should come first');
});

test('due without traces still works normally', () => {
  run('add', '--front', 'q1', '--back', 'a1');
  run('add', '--front', 'q2', '--back', 'a2');
  const due = run('due');
  assert.equal(due.length, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test lib/cli.test.mjs 2>&1 | grep -E 'trace-aware|gap-matched|FAIL|PASS'`
Expected: The first 3 new tests FAIL (sorting not yet trace-aware); the 4th passes

- [ ] **Step 3: Implement trace-aware sorting in `cmdDue`**

Replace the `dueCards` function (lines 86-89) and update `cmdDue` (lines 120-141):

```js
const TRACE_RECENT_MS = 48 * 60 * 60 * 1000;

/**
 * Build a lookup from card tags to the node's readTrace.
 * @param {Record<string, any>} projects
 * @returns {Map<string, { nodeId: string, trace: any }>}
 */
const buildNodeTraceIndex = (projects) => {
  /** @type {Map<string, { nodeId: string, trace: any }>} */
  const index = new Map();
  for (const project of Object.values(projects)) {
    for (const node of (project.nodes || [])) {
      if (!node.readTrace) continue;
      const key = `project:${project.id}|node:${node.id}`;
      index.set(key, { nodeId: node.id, trace: node.readTrace });
    }
  }
  return index;
};

/**
 * Compute a trace-aware sort score for a card. Lower = higher priority.
 * @param {Card} card
 * @param {Map<string, { nodeId: string, trace: any }>} traceIndex
 * @param {Date} now
 * @returns {number}
 */
const traceBoost = (card, traceIndex, now) => {
  const projectTag = card.tags.find((t) => t.startsWith('project:'));
  const nodeTag = card.tags.find((t) => t.startsWith('node:'));
  if (!projectTag || !nodeTag) return 0;

  const key = `${projectTag}|${nodeTag}`;
  const entry = traceIndex.get(key);
  if (!entry) return 0;

  const { trace } = entry;
  let boost = 0;

  const age = now.getTime() - new Date(trace.readAt).getTime();
  if (age < TRACE_RECENT_MS) boost += 4;

  if (trace.comprehension === 'weak') boost += 2;
  else if (trace.comprehension === 'partial') boost += 1;

  if (trace.gaps && trace.gaps.length > 0) {
    const text = `${card.front} ${card.back}`.toLowerCase();
    const hasGapMatch = trace.gaps.some((/** @type {string} */ g) => text.includes(g.toLowerCase()));
    if (hasGapMatch) boost += 4;
  }

  return boost;
};

/**
 * @param {Record<string, Card>} cards
 * @param {Date} [now]
 * @returns {Card[]}
 */
const dueCards = (cards, now = new Date()) =>
  Object.values(cards)
    .filter((card) => new Date(card.fsrs.due) <= now)
    .sort((a, b) => a.fsrs.due.localeCompare(b.fsrs.due));
```

Then update `cmdDue` to apply trace boost:

```js
/** @param {string[]} argv */
function cmdDue(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      limit: { type: 'string' },
      'hide-back': { type: 'boolean' },
      tag: { type: 'string' },
    },
  });
  const limit = values.limit ? Number(values.limit) : Infinity;
  const now = new Date();
  let cards = dueCards(readCards(), now);
  if (values.tag) {
    const filter = values.tag;
    cards = cards.filter((c) => c.tags.some((t) => t === filter || t.startsWith(`${filter}:`)));
  }

  const projects = readProjects();
  const traceIndex = buildNodeTraceIndex(projects);
  if (traceIndex.size > 0) {
    cards.sort((a, b) => {
      const boostA = traceBoost(a, traceIndex, now);
      const boostB = traceBoost(b, traceIndex, now);
      if (boostA !== boostB) return boostB - boostA;
      return a.fsrs.due.localeCompare(b.fsrs.due);
    });
  }

  cards = cards.slice(0, limit);
  if (values['hide-back']) {
    out(cards.map(({ back, ...rest }) => rest));
  } else {
    out(cards);
  }
}
```

- [ ] **Step 4: Run the full test suite**

Run: `node --test lib/cli.test.mjs`
Expected: All tests PASS (both new trace-aware tests and existing tests)

- [ ] **Step 5: Commit**

```bash
git add lib/cli.mjs lib/cli.test.mjs
git commit -m "feat(cli): trace-aware due sorting for teaching surface"
```

---

### Task 3: `/read` skill

**Files:**
- Create: `skills/read/SKILL.md`

**Interfaces:**
- Consumes: `project-list`, `project-get`, `read-trace`, `study-lock`, `study-unlock` CLI subcommands
- Produces: `/read` slash command — Socratic per-node teaching skill

- [ ] **Step 1: Create the skill file**

Create `skills/read/SKILL.md`:

```markdown
---
name: read
description: Teach a deepened node from a lull-n-learn project conversationally via Socratic walk-through. Use when the user runs /read, says "teach me about X", "explain this node", "walk me through X", or wants to learn a concept before studying cards.
---

# /read — Socratic teaching for one node

Teach a single deepened node conversationally. You are a tutor, not a lecturer. Use the node's guide and research as source material — teach from them, don't read them aloud. Match the language of the node content (French nodes → teach in French).

## Parse input

`$ARGUMENTS` follows one of these patterns:
- `<topic>: <node title>` → teach one specific node
- `<topic>` → pick the best unread deepened node (most prerequisite dependencies met, highest learning value)

Split on `:` to separate topic from node title. Both are case-insensitive substring matches.

## Load the project

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-list
```

Find the project whose topic matches (case-insensitive substring). If no match: "No project found for that topic. Run `/deep-lesson <topic>` first." and stop.

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-get <projectId>
```

## Find the node

If a node title was provided: find it by case-insensitive substring match on the node's `title` field.

If no node title: find the best unread deepened node:
1. Collect nodes with status `deepened`, `learning`, or `mastered` that have a `guide` field
2. Prefer nodes without a `readTrace` (unread)
3. Among those, prefer nodes whose prerequisite nodes (from `edges`) are already deepened/learning/mastered
4. Pick the first one. If all deepened nodes have been read, pick the one with the weakest `readTrace.comprehension`.

## Guards

- If the node status is `unmapped` or `mapped`: "**<node title>** hasn't been researched yet. `/deep-lesson <topic>: <node title>` to deepen it first." Stop.
- If the node has no `guide` field (empty string or null): "**<node title>** was deepened but has no study guide. `/deep-lesson <topic>: <node title>` to regenerate." Stop.

## Lock the status line

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-lock
```

## Teach — the Socratic walk-through

You have these materials (DO NOT show them raw to the user):
- `node.guide` — markdown study guide content (primary teaching material)
- `node.research.sources` — what was consulted and what each contributed
- `node.research.synthesis` — how the sources were combined
- `node.research.references` — visual references (images, videos, diagrams) if available
- `node.description` — one-line summary

### Step 1: Hook

Open with ONE concrete scenario or question that makes the concept feel necessary. Pick the most surprising or counterintuitive point from the guide. This is an invitation to think, not a quiz.

### Step 2: Explain a chunk

Present one chunk (2-3 paragraphs max) from the guide, rewritten conversationally. Use tables, formulas, and examples from the guide but weave them into the conversation. If the node has visual references (`node.research.references`), mention them: "Open the study guide to see the diagram."

### Step 3: Comprehension check

Ask ONE question that demands thinking — not yes/no, not pure recall. Test whether the learner built the right mental model.

Good: "What happens if you try X?" / "Tu es en situation Y — que fais-tu ?"
Bad: "Does that make sense?" / "What's the definition of X?"

Wait for the user's response. Do NOT use `AskUserQuestion` — the user must type freely.

### Step 4: Adjust

- **Solid:** Acknowledge briefly, bridge to the next chunk.
- **Partial:** Re-explain from a different angle with a new example. Don't repeat louder.
- **Misconception:** Name it directly, explain why it's wrong, provide the correct model.

Track internally:
- How many chunks you covered
- Whether checks passed on first attempt (strong), needed re-explanation (partial), or struggled (weak)
- Specific concepts that needed re-explanation (these become gaps)

### Step 5: Repeat steps 2-4

A typical node (200-500 word guide) breaks into 2-4 chunks. Cover all the guide material.

### Step 6: Bridge

Connect to what comes next in the graph. Check the project's `edges` to find nodes that depend on this one (edges where `from` is this node's id). Mention the next node in one sentence.

If standalone (no dependent nodes): "Your cards from **<node title>** are primed for `/study`."

## Record the trace

After the walk-through (or if the user stops mid-way), assess and write the trace:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" read-trace <projectId> <nodeId> \
  --comprehension <strong|partial|weak> \
  --gaps "<comma-separated specific concepts>" \
  --chunks <number of chunks covered>
```

Comprehension assessment:
- `strong` — all checks passed on first attempt
- `partial` — needed re-explanation on some chunks but got there
- `weak` — struggled throughout, multiple re-explanations needed

Gaps are SPECIFIC concepts, not categories. "non-cumul probatoire+pluie" yes. "speed limits" no.

## Unlock and close

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-unlock
```

Close: "Your cards from **<node title>** are primed for `/study`." One line. No summary stats, no "you covered N chunks", no score.

## Anti-guilt rules (hard constraints)

- Never show how many chunks remain or were covered
- Never score the session ("you got 3/4")
- Stopping mid-way is always fine; don't remark on it
- Never mention what hasn't been read yet
- Re-reading a node is always fine — don't comment on it
```

- [ ] **Step 2: Verify the file is valid**

Run: `head -5 skills/read/SKILL.md` — confirm frontmatter is well-formed YAML.

- [ ] **Step 3: Smoke test by loading**

Run: `node "${CLAUDE_PLUGIN_ROOT:-/Users/rafa/Developer/equanimitech/lull-n-learn}/lib/cli.mjs" project-list` — confirm CLI still works and the skill file doesn't break the plugin structure.

- [ ] **Step 4: Commit**

```bash
git add skills/read/SKILL.md
git commit -m "feat: add /read skill for Socratic node teaching"
```

---

### Task 4: `/lesson` skill

**Files:**
- Create: `skills/lesson/SKILL.md`

**Interfaces:**
- Consumes: `project-list`, `project-get`, `read-trace`, `study-lock`, `study-unlock` CLI subcommands
- Produces: `/lesson` slash command — multi-node learning path orchestrator

- [ ] **Step 1: Create the skill file**

Create `skills/lesson/SKILL.md`:

```markdown
---
name: lesson
description: Walk a learning path through multiple deepened nodes in prerequisite order, teaching each via Socratic walk-through. Use when the user runs /lesson, says "teach me the full topic", "walk me through the whole thing", or wants a structured learning session across multiple concepts.
---

# /lesson — learning path across nodes

Orchestrate a learning session across multiple deepened nodes. Each node is taught using the same Socratic walk-through as `/read`. Nodes are sequenced by the prerequisite graph. The learner can stop between any two nodes.

## Parse input

`$ARGUMENTS` contains the topic name. Optionally `--all` to re-teach already-read nodes.

```
/lesson <topic>
/lesson <topic> --all
```

## Load the project

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-list
```

Find the project whose topic matches (case-insensitive substring). If no match: "No project found for that topic. Run `/deep-lesson <topic>` first." and stop.

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-get <projectId>
```

## Compute the learning path

1. Collect nodes with status `deepened`, `learning`, or `mastered` that have a `guide` field (non-empty)
2. Unless `--all` was passed, filter out nodes where `readTrace` already exists
3. Also filter out nodes with status `mastered` (unless `--all`)
4. Topologically sort remaining nodes by the prerequisite graph (project `edges`):
   - For each edge `{ from, to }`, `from` must come before `to`
   - Nodes with no prerequisites come first
   - Among nodes at the same depth, order alphabetically by title
5. If no nodes remain: "Everything that's been researched is covered. `/deep-lesson <topic>` to deepen more nodes." and stop.

## Present the path

List the nodes by title with arrows:

"**N nodes** to cover: **Node A** → **Node B** → **Node C**. Ready?"

Wait for the user to confirm. Do NOT use `AskUserQuestion` — let them type freely.

## Lock the status line

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-lock
```

## Teach each node

For each node in the path, run the FULL Socratic walk-through described in `/read`:

1. **Hook** — one concrete scenario from the node's guide
2. **Explain chunks** — 2-3 paragraphs per chunk from the guide, conversational
3. **Comprehension checks** — after each chunk, one thinking question
4. **Adjust** — re-explain if needed
5. **Bridge** — connect to the next node in the path

After each node's walk-through is complete, write its trace:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" read-trace <projectId> <nodeId> \
  --comprehension <strong|partial|weak> \
  --gaps "<comma-separated>" \
  --chunks <n>
```

### Between nodes

If this is NOT the last node in the path:

"That's **<current node>**. Next: **<next node>** — <one-line description from node.description>. Continue?"

Wait for the user's response. If they say stop/no/enough/done: proceed to close. Otherwise continue to the next node.

### If the user stops mid-node

Write the trace for whatever was covered in the current node (partial chunks, comprehension so far). Then proceed to close.

## Unlock and close

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-unlock
```

Close: "You've covered **N nodes**. Your cards are primed for `/study`."

One line. No "N of M" framing. Don't list what wasn't covered.

## Anti-guilt rules (hard constraints)

- Never show "2 of 5 complete" or progress fractions
- Never list un-covered nodes or suggest what's remaining
- Stopping between nodes is always fine; don't remark on it
- Never pressure to continue ("you're so close!" etc.)
- Re-running `/lesson` on a topic where some nodes were already read is fine — it picks up where you left off
```

- [ ] **Step 2: Verify the file is valid**

Run: `head -5 skills/lesson/SKILL.md` — confirm frontmatter is well-formed YAML.

- [ ] **Step 3: Commit**

```bash
git add skills/lesson/SKILL.md
git commit -m "feat: add /lesson skill for multi-node learning paths"
```

---

### Task 5: Modify `/study` for trace-aware suggestions

**Files:**
- Modify: `skills/study/SKILL.md:57-79` (update post-session suggestion logic)

**Interfaces:**
- Consumes: `project-get` CLI subcommand; `readTrace` field on project nodes (from Task 1)
- Produces: Updated post-session suggestion that recommends `/read` for recently-read weak nodes

- [ ] **Step 1: Update the post-session suggestion section**

In `skills/study/SKILL.md`, replace the "Post-session: project node suggestion" section (lines 57-79) with:

```markdown
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
```

- [ ] **Step 2: Verify no syntax issues**

Run: `head -5 skills/study/SKILL.md` — confirm frontmatter intact.

- [ ] **Step 3: Commit**

```bash
git add skills/study/SKILL.md
git commit -m "feat(study): trace-aware post-session suggestions for /read"
```

---

### Task 6: Deep-lesson reference fetching + DEEPEN_SCHEMA update

**Files:**
- Modify: `workflows/deep-lesson.js:120-163` (update `DEEPEN_SCHEMA` to include references)
- Modify: `workflows/deep-lesson.js:313-336` (update Deepen research agent prompt to fetch references)

**Interfaces:**
- Consumes: Workflow `agent()` API with WebSearch, WebFetch, ToolSearch
- Produces: `research.references[]` on each deepened node (image, video, diagram entries)

- [ ] **Step 1: Update `DEEPEN_SCHEMA` to include references**

In `workflows/deep-lesson.js`, add a `references` field to the `research` property inside `DEEPEN_SCHEMA` (after the `excluded` field, around line 157):

```js
        references: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['image', 'video', 'diagram'] },
              url: { type: 'string', description: 'Source URL (image/video) or empty for diagrams' },
              alt: { type: 'string', description: 'Descriptive alt text' },
              title: { type: 'string', description: 'For videos: the video title' },
              timestamp: { type: 'string', description: 'For videos: start timestamp (e.g. "2:34")' },
              svg: { type: 'string', description: 'For diagrams: inline SVG markup' },
              contribution: { type: 'string', description: 'What this reference adds to the node' },
            },
            required: ['type', 'contribution'],
          },
          description: 'Visual references: images found via web, videos from YouTube/educational platforms, agent-generated diagrams',
        },
```

Also add `'references'` to the `required` array of the `research` property, changing:
```js
required: ['sources', 'synthesis', 'excluded'],
```
to:
```js
required: ['sources', 'synthesis', 'excluded', 'references'],
```

- [ ] **Step 2: Update the Deepen research agent prompt**

In the first stage of the pipeline (the research agent, around line 315), append to the agent prompt before the closing backtick:

```
Additionally, search for visual references that would help a learner understand this concept:
- IMAGES: Search for diagrams, illustrations, or reference images. For regulatory/exam topics, look for official signs and symbols. For cooking/craft topics, look for technique photos. For games/strategy, generate board-state diagrams as SVG.
- VIDEOS: Search for YouTube or educational videos that explain this concept well. Include the video title, URL, and a useful start timestamp if the video is long.
- DIAGRAMS: For spatial or structural concepts, generate an inline SVG diagram that illustrates the key relationships or positions.

Use WebFetch (via ToolSearch) to verify that image URLs are valid before including them.

Return references in the research.references array. Each entry needs a type (image/video/diagram), the contribution it makes, and the URL or SVG content. Aim for 1-3 references per node — quality over quantity. Skip references if no genuinely useful visual exists for this concept.
```

- [ ] **Step 3: Update the card generation agent prompt**

In the second stage of the pipeline (the generate agent, around line 337), add to the STUDY GUIDE RULES section:

```
- If the research includes visual references (research.references), mention them in the guide:
  - For images: reference them by alt text ("See the diagram of X")
  - For videos: include a markdown link with title and timestamp
  - For diagrams: embed the SVG inline in the guide markdown
```

- [ ] **Step 4: Commit**

```bash
git add workflows/deep-lesson.js
git commit -m "feat(deep-lesson): fetch visual references in Deepen phase"
```

---

### Task 7: Version bump + THEORY.md + docs/design.md

**Files:**
- Modify: `.claude-plugin/plugin.json` (bump version)
- Modify: `THEORY.md` (add principle mappings)
- Modify: `docs/design.md` (update architecture diagram)

**Interfaces:**
- Consumes: None
- Produces: Updated documentation reflecting the teaching surface

- [ ] **Step 1: Bump the plugin version**

In `.claude-plugin/plugin.json`, change:
```json
"version": "0.5.0",
```
to:
```json
"version": "0.6.0",
```

- [ ] **Step 2: Update THEORY.md**

Read the current `THEORY.md`. After the existing Principle #3 (Directness) mapping, add:

```markdown
**Plugin features (teaching surface):**
- `/read <topic>: <node>` teaches a single concept through Socratic dialogue — explain, check, adjust. The agent teaches *from* the researched material rather than dumping it. Comprehension checks demand thinking, not recognition.
- `/lesson <topic>` walks a learning path across multiple nodes in prerequisite order, with natural stopping points. The same Socratic loop, sequenced.
- Together they close the acquisition gap: `/deep-lesson` maps → `/read` or `/lesson` acquires → `/study` retrieves.
```

After the existing Principle #6 (Feedback) mapping, add:

```markdown
**Plugin features (teaching surface):**
- During `/read`, comprehension checks catch misconceptions in real-time. The agent names the gap, re-explains from a different angle, and verifies the fix.
- A light trace (`readTrace`) records comprehension signals and specific gaps. `/study` uses these to prioritize cards from weak nodes, closing the feedback loop between teaching and retrieval.
```

After the existing Principle #8 (Intuition) mapping, add:

```markdown
**Plugin features (teaching surface):**
- The Socratic hook opens each node with a concrete scenario that makes the concept feel necessary — building intuition before formalism.
- Comprehension checks test mental models ("what would happen if..."), not definitions.
```

- [ ] **Step 3: Update docs/design.md architecture diagram**

In `docs/design.md`, find the architecture ASCII diagram (around line 103-119) and update it to include the teaching surface:

```
┌──────────────────────────────────────────────────┐
│                Local JSON (~/.lull-n-learn/)        │
│  cards.json  inbox.json  projects.json           │
│  fsrs-state.json  config.json                    │
└──────────┬───────────────┬───────────────┬───────┘
           |               |               |
     ┌─────┴──────┐  ┌────┴─────┐  ┌──────┴───────┐
     |  Learning   |  |  Work    |  |  Workflow    |
     |  Session    |  |  Session |  |  (bg)        |
     |             |  |  Hook    |  |              |
     |  /study     |  |  HUD:    |  |  Deep        |
     |  /read  NEW |  |  one cue |  |  Research    |
     |  /lesson NEW|  |  during  |  |  lesson      |
     |  /deep-les  |  |  process |  |  plans       |
     |  /drill     |  |          |  |              |
     |  /sift      |  |          |  |              |
     |  /card      |  |          |  |              |
     └─────────────┘  └──────────┘  └──────────────┘
```

Also add a paragraph after the diagram explaining the teaching surface:

```markdown
### Teaching Surface (v0.6)

`/read` and `/lesson` fill the acquisition gap between `/deep-lesson` (mapping) and `/study` (retrieval). They teach deepened nodes conversationally via Socratic walk-through — explain, check comprehension, adjust. A light trace (`readTrace`) on each node records what was covered and how it went, feeding `/study`'s card prioritization. See `docs/teaching-surface-design.md` for the full spec.
```

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json THEORY.md docs/design.md
git commit -m "docs: teaching surface — version 0.6.0, THEORY.md mappings, architecture"
```
