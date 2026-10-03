# ultralearn v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the smallest ultralearn plugin that proves the core loop: extract learning moments, triage them, review with FSRS scheduling, and surface one ambient cue.

**Architecture:** Three layers, no build step. `lib/fsrs.mjs` is a pure FSRS-5 scheduler (no I/O). `lib/store.mjs` persists keyed-by-id JSON collections in `~/.ultralearn/`. `lib/cli.mjs` exposes subcommands that skills call via `node ${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs <cmd>`; skills (`/add`, `/review`, `/inbox`, `/extract`) are markdown instructions for Claude, and `lib/statusline.mjs` is a composable status line script the user wires in themselves.

**Tech Stack:** Node.js built-ins only. ES modules (`.mjs`) with `// @ts-check` and JSDoc. Tests with `node --test` and `node:assert/strict`.

**Spec:** `docs/design.md`

## Global Constraints

- **No dependencies.** Node.js built-ins only: `node:fs`, `node:path`, `node:os`, `node:crypto`, `node:util`, `node:test`, `node:assert`, `node:child_process`, `node:url`. No `package.json` is needed; `.mjs` files are ESM by extension.
- **Pure JS, typed by JSDoc.** Every `.mjs` file starts with `// @ts-check`. No TypeScript, no build step.
- **Functional style.** Pure functions where possible; FSRS functions never mutate their inputs. Use `for...of`, never `forEach`.
- **Tests are hermetic.** Every test that touches the store sets `ULTRALEARN_DIR` to a fresh temp dir. Tests must NEVER read or write the real `~/.ultralearn/`. Fixtures use synthetic content only, never real personal data.
- **Data location.** `~/.ultralearn/` (created on first write), overridable via the `ULTRALEARN_DIR` environment variable. Plain JSON, keyed by id, pretty-printed (2-space indent) so users can read and edit it.
- **IDs** come from `crypto.randomUUID()`.
- **Anti-guilt (hard rule).** No user-facing output anywhere (skills, status line, hook announce, README) may show due-card counts, streaks, review debt, "you missed X", or "come back tomorrow". The inbox candidate count during triage is allowed (it is a work queue, not a guilt metric); due/overdue counts are not.
- **Attribution.** User-facing copy (README, SessionStart announce, THEORY.md) credits Scott Young's Ultralearning. The plugin is inspired by, not affiliated with, his work.
- **FSRS-5 default weights, no per-user optimization.** Weights are the 19-element vector in Task 1, verbatim.
- **Skills call the CLI as** `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" <subcommand> [args]`.
- **Run the full suite with:** `node --test lib/` from the repo root.
- **Commit style:** conventional commits (`feat:`, `test:`, `docs:`, `chore:`), one commit per task minimum, exactly the files the task touched. No em dashes in commit messages.

---

## File Structure

```
ultralearn/
+-- .claude-plugin/plugin.json      # exists, unchanged
+-- hooks/
|   +-- hooks.json                  # Task 7: SessionStart announce
+-- skills/
|   +-- add.md                      # Task 8
|   +-- review.md                   # Task 8
|   +-- inbox.md                    # Task 9
|   +-- extract.md                  # Task 9
+-- lib/
|   +-- fsrs.mjs                    # Tasks 1-2: pure FSRS-5 scheduler
|   +-- fsrs.test.mjs
|   +-- store.mjs                   # Task 3: JSON persistence
|   +-- store.test.mjs
|   +-- cli.mjs                     # Tasks 4-5: subcommand entry point
|   +-- cli.test.mjs
|   +-- statusline.mjs              # Task 6: one-cue status line script
|   +-- statusline.test.mjs
+-- docs/design.md                  # exists
+-- docs/plan.md                    # this file
+-- THEORY.md, README.md, LICENSE   # exist; README updated in Task 10
```

---

### Task 1: FSRS primitives (weights, init, retrievability, interval)

**Files:**
- Create: `lib/fsrs.mjs`
- Test: `lib/fsrs.test.mjs`

**Interfaces:**
- Consumes: nothing (leaf module, pure math).
- Produces: `DEFAULT_WEIGHTS: readonly number[]` (19 entries), `DECAY = -0.5`, `FACTOR`, `DESIRED_RETENTION = 0.9`, `initDifficulty(rating: 1|2|3|4, w?): number` (clamped 1..10), `initStability(rating: 1|2|3|4, w?): number` (min 0.1), `retrievability(elapsedDays: number, stability: number): number`, `nextInterval(stability: number, retention?: number): number` (whole days, min 1), `nextDifficulty(d: number, rating: 1|2|3|4, w?): number`, `stabilityAfterSuccess(d, s, r, rating, w?): number`, `stabilityAfterLapse(d, s, r, w?): number`. Task 2 builds `review()` on top of these; Tasks 4-6 never call these directly.

Note on the interval formula: the design shorthand `S * (retention^(1/decay) - 1)` omits normalization. Canonical FSRS is `I = (S / FACTOR) * (retention^(1/DECAY) - 1)`, which reduces to `I = S` at retention 0.9. Implement the canonical form; the tests below pin that identity.

- [ ] **Step 1: Write the failing test**

Create `lib/fsrs.test.mjs`:

```js
// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WEIGHTS,
  initDifficulty,
  initStability,
  retrievability,
  nextInterval,
  nextDifficulty,
  stabilityAfterSuccess,
  stabilityAfterLapse,
} from './fsrs.mjs';

test('DEFAULT_WEIGHTS has the 19 FSRS-5 defaults', () => {
  assert.equal(DEFAULT_WEIGHTS.length, 19);
  assert.equal(DEFAULT_WEIGHTS[0], 0.40255);
  assert.equal(DEFAULT_WEIGHTS[18], 0.6621);
});

test('initStability returns w[rating-1], floored at 0.1', () => {
  assert.equal(initStability(1), DEFAULT_WEIGHTS[0]);
  assert.equal(initStability(2), DEFAULT_WEIGHTS[1]);
  assert.equal(initStability(3), DEFAULT_WEIGHTS[2]);
  assert.equal(initStability(4), DEFAULT_WEIGHTS[3]);
});

test('initDifficulty is higher for Again than Easy and stays in [1,10]', () => {
  assert.ok(initDifficulty(1) > initDifficulty(2));
  assert.ok(initDifficulty(2) > initDifficulty(3));
  assert.ok(initDifficulty(3) > initDifficulty(4));
  for (const rating of /** @type {const} */ ([1, 2, 3, 4])) {
    const d = initDifficulty(rating);
    assert.ok(d >= 1 && d <= 10, `initDifficulty(${rating}) = ${d} out of range`);
  }
});

test('retrievability is 1 at t=0 and 0.9 when elapsed equals stability', () => {
  assert.equal(retrievability(0, 3.0), 1);
  assert.ok(Math.abs(retrievability(3.0, 3.0) - 0.9) < 1e-9);
  assert.ok(retrievability(30, 3.0) < retrievability(3, 3.0));
});

test('nextInterval equals stability (rounded, min 1 day) at retention 0.9', () => {
  assert.equal(nextInterval(3.173), 3);
  assert.equal(nextInterval(15.7), 16);
  assert.equal(nextInterval(0.2), 1);
});

test('nextDifficulty rises on Again, falls on Easy, clamps to [1,10]', () => {
  assert.ok(nextDifficulty(5, 1) > 5);
  assert.ok(nextDifficulty(5, 4) < 5);
  assert.equal(nextDifficulty(5, 3) < 5, true); // mean reversion pulls toward D0(4) < 5
  let d = 5;
  for (let i = 0; i < 50; i += 1) d = nextDifficulty(d, 1);
  assert.ok(d <= 10);
});

test('stabilityAfterSuccess grows stability; Easy > Good > Hard', () => {
  const d = 5;
  const s = 3.173;
  const r = 0.9;
  const hard = stabilityAfterSuccess(d, s, r, 2);
  const good = stabilityAfterSuccess(d, s, r, 3);
  const easy = stabilityAfterSuccess(d, s, r, 4);
  assert.ok(good > s);
  assert.ok(easy > good);
  assert.ok(good > hard);
});

test('stabilityAfterLapse shrinks stability and never goes below 0.1', () => {
  const dropped = stabilityAfterLapse(5, 20, 0.9);
  assert.ok(dropped < 20);
  assert.ok(stabilityAfterLapse(10, 0.1, 0.5) >= 0.1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test lib/fsrs.test.mjs`
Expected: FAIL with `Cannot find module '.../lib/fsrs.mjs'`

- [ ] **Step 3: Implement the primitives**

Create `lib/fsrs.mjs`:

```js
// @ts-check
/**
 * FSRS-5 (Free Spaced Repetition Scheduler), pure functions, no I/O.
 * https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 */

/** @typedef {1 | 2 | 3 | 4} Rating Again=1, Hard=2, Good=3, Easy=4 */

export const DEFAULT_WEIGHTS = Object.freeze([
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621,
]);

export const DECAY = -0.5;
export const FACTOR = 0.9 ** (1 / DECAY) - 1; // ~0.2346; makes R(S, S) = 0.9
export const DESIRED_RETENTION = 0.9;

/**
 * @param {number} x
 * @param {number} lo
 * @param {number} hi
 */
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Initial difficulty after the first rating: D0(G) = w4 - e^(w5 * (G - 1)) + 1.
 * @param {Rating} rating
 * @param {readonly number[]} [w]
 * @returns {number} difficulty in [1, 10]
 */
export const initDifficulty = (rating, w = DEFAULT_WEIGHTS) =>
  clamp(w[4] - Math.exp(w[5] * (rating - 1)) + 1, 1, 10);

/**
 * Initial stability after the first rating: S0(G) = w[G-1].
 * @param {Rating} rating
 * @param {readonly number[]} [w]
 * @returns {number} stability in days, min 0.1
 */
export const initStability = (rating, w = DEFAULT_WEIGHTS) =>
  Math.max(w[rating - 1], 0.1);

/**
 * Probability of recall after elapsedDays given stability.
 * @param {number} elapsedDays
 * @param {number} stability
 * @returns {number} in (0, 1]
 */
export const retrievability = (elapsedDays, stability) =>
  (1 + (FACTOR * elapsedDays) / stability) ** DECAY;

/**
 * Days until retrievability decays to the desired retention.
 * I(r, S) = (S / FACTOR) * (r^(1/DECAY) - 1); reduces to S at r = 0.9.
 * @param {number} stability
 * @param {number} [retention]
 * @returns {number} whole days, min 1
 */
export const nextInterval = (stability, retention = DESIRED_RETENTION) =>
  Math.max(1, Math.round((stability / FACTOR) * (retention ** (1 / DECAY) - 1)));

/**
 * Mean reversion toward D0(Easy): w7 * D0(4) + (1 - w7) * d.
 * @param {number} d
 * @param {readonly number[]} w
 */
const meanRevert = (d, w) => w[7] * initDifficulty(4, w) + (1 - w[7]) * d;

/**
 * Difficulty after a review: D' = meanRevert(D - w6 * (G - 3)), clamped [1, 10].
 * @param {number} d current difficulty
 * @param {Rating} rating
 * @param {readonly number[]} [w]
 * @returns {number}
 */
export const nextDifficulty = (d, rating, w = DEFAULT_WEIGHTS) =>
  clamp(meanRevert(d - w[6] * (rating - 3), w), 1, 10);

/**
 * Stability after a successful review (Hard, Good, or Easy).
 * @param {number} d difficulty
 * @param {number} s current stability
 * @param {number} r retrievability at review time
 * @param {Rating} rating 2, 3, or 4
 * @param {readonly number[]} [w]
 * @returns {number}
 */
export const stabilityAfterSuccess = (d, s, r, rating, w = DEFAULT_WEIGHTS) => {
  const hardPenalty = rating === 2 ? w[15] : 1;
  const easyBonus = rating === 4 ? w[16] : 1;
  return (
    s *
    (Math.exp(w[8]) *
      (11 - d) *
      s ** -w[9] *
      (Math.exp(w[10] * (1 - r)) - 1) *
      hardPenalty *
      easyBonus +
      1)
  );
};

/**
 * Stability after a lapse (Again). Never exceeds the pre-lapse stability,
 * never drops below 0.1.
 * @param {number} d difficulty
 * @param {number} s current stability
 * @param {number} r retrievability at review time
 * @param {readonly number[]} [w]
 * @returns {number}
 */
export const stabilityAfterLapse = (d, s, r, w = DEFAULT_WEIGHTS) =>
  Math.max(
    0.1,
    Math.min(
      w[11] * d ** -w[12] * ((s + 1) ** w[13] - 1) * Math.exp(w[14] * (1 - r)),
      s,
    ),
  );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test lib/fsrs.test.mjs`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add lib/fsrs.mjs lib/fsrs.test.mjs
git commit -m "feat: FSRS-5 primitives (weights, init, retrievability, interval)"
```

---

### Task 2: FSRS card-state transitions (`newCardState`, `review`)

**Files:**
- Modify: `lib/fsrs.mjs` (append to end of file)
- Modify: `lib/fsrs.test.mjs` (update import, append tests)

**Interfaces:**
- Consumes: Task 1 primitives (same file).
- Produces the two functions everything downstream schedules with:
  - `newCardState(now?: Date): FsrsState` where `FsrsState = { difficulty: number, stability: number, reps: number, lapses: number, due: string (ISO8601), lastReview: string | null }`. New cards are due immediately (`due === now`), `reps: 0`, `lapses: 0`, `lastReview: null`, placeholder `difficulty: 5.0`, `stability: 1.0` (replaced at first review).
  - `review(state: FsrsState, rating: 1|2|3|4, now?: Date): FsrsState` returning a NEW object (no mutation). First review seeds from `initDifficulty`/`initStability`. `Again` on a learned card increments `lapses` and re-queues in 10 minutes; success ratings queue `nextInterval(stability)` days out. Throws `RangeError` on ratings outside 1..4.

- [ ] **Step 1: Extend the test file with failing tests**

In `lib/fsrs.test.mjs`, replace the import statement with:

```js
import {
  DEFAULT_WEIGHTS,
  initDifficulty,
  initStability,
  retrievability,
  nextInterval,
  nextDifficulty,
  stabilityAfterSuccess,
  stabilityAfterLapse,
  newCardState,
  review,
} from './fsrs.mjs';
```

Append at the end of the file:

```js
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-24T12:00:00.000Z');

test('newCardState is due immediately with no review history', () => {
  const s = newCardState(NOW);
  assert.equal(s.reps, 0);
  assert.equal(s.lapses, 0);
  assert.equal(s.lastReview, null);
  assert.equal(s.due, NOW.toISOString());
  assert.equal(s.difficulty, 5.0);
  assert.equal(s.stability, 1.0);
});

test('first Good review seeds state from the init formulas', () => {
  const s = review(newCardState(NOW), 3, NOW);
  assert.equal(s.stability, initStability(3)); // 3.173
  assert.equal(s.difficulty, initDifficulty(3));
  assert.equal(s.reps, 1);
  assert.equal(s.lapses, 0);
  assert.equal(s.lastReview, NOW.toISOString());
  const dueDays = (new Date(s.due).getTime() - NOW.getTime()) / DAY_MS;
  assert.equal(dueDays, 3); // nextInterval(3.173) = 3
});

test('review does not mutate the input state', () => {
  const before = newCardState(NOW);
  const frozen = JSON.stringify(before);
  review(before, 3, NOW);
  assert.equal(JSON.stringify(before), frozen);
});

test('second review: Easy schedules further out than Good, Good further than Hard', () => {
  const base = review(newCardState(NOW), 3, NOW);
  const later = new Date(NOW.getTime() + 3 * DAY_MS);
  const hard = review(base, 2, later);
  const good = review(base, 3, later);
  const easy = review(base, 4, later);
  assert.ok(easy.stability > good.stability);
  assert.ok(good.stability > hard.stability);
  assert.ok(good.stability > base.stability);
  assert.ok(new Date(easy.due) > new Date(good.due));
  assert.equal(good.reps, 2);
});

test('Again on a learned card is a lapse: stability drops, lapses increment, due within minutes', () => {
  const base = review(newCardState(NOW), 3, NOW);
  const later = new Date(NOW.getTime() + 3 * DAY_MS);
  const s = review(base, 1, later);
  assert.equal(s.lapses, 1);
  assert.ok(s.stability < base.stability);
  const dueMs = new Date(s.due).getTime() - later.getTime();
  assert.ok(dueMs > 0 && dueMs <= 15 * 60 * 1000);
});

test('Again on the very first review is not counted as a lapse', () => {
  const s = review(newCardState(NOW), 1, NOW);
  assert.equal(s.lapses, 0);
  assert.equal(s.stability, initStability(1));
});

test('review rejects invalid ratings', () => {
  assert.throws(() => review(newCardState(NOW), /** @type {any} */ (0), NOW), RangeError);
  assert.throws(() => review(newCardState(NOW), /** @type {any} */ (5), NOW), RangeError);
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test lib/fsrs.test.mjs`
Expected: FAIL, `newCardState`/`review` not exported

- [ ] **Step 3: Implement `newCardState` and `review`**

Append to `lib/fsrs.mjs`:

```js
const DAY_MS = 24 * 60 * 60 * 1000;
const LAPSE_REQUEUE_MS = 10 * 60 * 1000; // Again resurfaces in ~10 minutes

/**
 * @typedef {Object} FsrsState
 * @property {number} difficulty 1..10
 * @property {number} stability days
 * @property {number} reps completed reviews
 * @property {number} lapses times forgotten after being learned
 * @property {string} due ISO8601
 * @property {string | null} lastReview ISO8601, null before the first review
 */

/**
 * State for a card that has never been reviewed. Due immediately; the
 * placeholder difficulty/stability are replaced at the first review.
 * @param {Date} [now]
 * @returns {FsrsState}
 */
export const newCardState = (now = new Date()) => ({
  difficulty: 5.0,
  stability: 1.0,
  reps: 0,
  lapses: 0,
  due: now.toISOString(),
  lastReview: null,
});

/**
 * Apply one review. Pure: returns a new state, never mutates the input.
 * @param {FsrsState} state
 * @param {Rating} rating
 * @param {Date} [now]
 * @returns {FsrsState}
 */
export function review(state, rating, now = new Date()) {
  if (![1, 2, 3, 4].includes(rating)) {
    throw new RangeError(`rating must be 1..4, got ${rating}`);
  }
  const isFirst = state.lastReview === null;
  let difficulty;
  let stability;
  let lapses = state.lapses;

  if (isFirst) {
    difficulty = initDifficulty(rating);
    stability = initStability(rating);
  } else {
    const elapsedDays = Math.max(
      0,
      (now.getTime() - new Date(/** @type {string} */ (state.lastReview)).getTime()) / DAY_MS,
    );
    const r = retrievability(elapsedDays, state.stability);
    difficulty = nextDifficulty(state.difficulty, rating);
    if (rating === 1) {
      stability = stabilityAfterLapse(state.difficulty, state.stability, r);
      lapses += 1;
    } else {
      stability = stabilityAfterSuccess(state.difficulty, state.stability, r, rating);
    }
  }

  const dueMs =
    rating === 1 ? LAPSE_REQUEUE_MS : nextInterval(stability) * DAY_MS;

  return {
    difficulty,
    stability,
    reps: state.reps + 1,
    lapses,
    due: new Date(now.getTime() + dueMs).toISOString(),
    lastReview: now.toISOString(),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test lib/fsrs.test.mjs`
Expected: PASS, 15 tests

- [ ] **Step 5: Commit**

```bash
git add lib/fsrs.mjs lib/fsrs.test.mjs
git commit -m "feat: FSRS card-state transitions (newCardState, review)"
```

---

### Task 3: JSON store (`lib/store.mjs`)

**Files:**
- Create: `lib/store.mjs`
- Test: `lib/store.test.mjs`

**Interfaces:**
- Consumes: nothing from this repo (Node built-ins only).
- Produces:
  - `dataDir(): string` returning `process.env.ULTRALEARN_DIR ?? join(homedir(), '.ultralearn')`, resolved lazily on every call (so tests can swap the env var).
  - `readCollection(name: string): Record<string, object>` returning `{}` when the file does not exist.
  - `writeCollection(name: string, data: Record<string, object>): void` creating the data dir on demand and writing atomically (tmp file + rename).
  - Convenience pairs used by Tasks 4-6: `readCards()`, `writeCards(cards)`, `readInbox()`, `writeInbox(inbox)` mapping to `cards.json` / `inbox.json`.

- [ ] **Step 1: Write the failing test**

Create `lib/store.test.mjs`:

```js
// @ts-check
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dataDir,
  readCollection,
  writeCollection,
  readCards,
  writeCards,
  readInbox,
  writeInbox,
} from './store.mjs';

/** @type {string} */
let tempRoot;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'ultralearn-store-'));
  // Point at a subdirectory that does NOT exist yet: the store must create it.
  process.env.ULTRALEARN_DIR = join(tempRoot, 'data');
});

afterEach(() => {
  delete process.env.ULTRALEARN_DIR;
  rmSync(tempRoot, { recursive: true, force: true });
});

test('dataDir honors the ULTRALEARN_DIR override', () => {
  assert.equal(dataDir(), join(tempRoot, 'data'));
});

test('reading a collection that does not exist returns an empty object', () => {
  assert.deepEqual(readCollection('cards'), {});
  assert.deepEqual(readCards(), {});
  assert.deepEqual(readInbox(), {});
});

test('writeCollection creates the directory and round-trips', () => {
  const card = { id: 'a1', front: 'What is a monoid?', back: 'A set with an associative op and identity.' };
  writeCards({ [card.id]: card });
  assert.ok(existsSync(join(dataDir(), 'cards.json')));
  assert.deepEqual(readCards(), { a1: card });
});

test('cards and inbox are separate files', () => {
  writeCards({ a: { id: 'a' } });
  writeInbox({ b: { id: 'b' } });
  assert.deepEqual(Object.keys(readCards()), ['a']);
  assert.deepEqual(Object.keys(readInbox()), ['b']);
  assert.ok(existsSync(join(dataDir(), 'inbox.json')));
});

test('files are pretty-printed JSON a human can read and edit', () => {
  writeCollection('cards', { a: { id: 'a' } });
  const raw = readFileSync(join(dataDir(), 'cards.json'), 'utf8');
  assert.ok(raw.includes('\n  '), 'expected 2-space indentation');
  assert.ok(raw.endsWith('\n'), 'expected trailing newline');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test lib/store.test.mjs`
Expected: FAIL with `Cannot find module '.../lib/store.mjs'`

- [ ] **Step 3: Implement the store**

Create `lib/store.mjs`:

```js
// @ts-check
/**
 * Persistence for ultralearn: plain JSON collections keyed by id,
 * living in ~/.ultralearn/ (override with ULTRALEARN_DIR).
 * No server, no account, no sync. The user owns these files.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Resolved lazily on every call so tests can point it at a temp dir.
 * @returns {string}
 */
export const dataDir = () =>
  process.env.ULTRALEARN_DIR ?? join(homedir(), '.ultralearn');

/** @param {string} name */
const filePath = (name) => join(dataDir(), `${name}.json`);

/**
 * Read a collection; a missing file is an empty collection.
 * @param {string} name e.g. "cards", "inbox"
 * @returns {Record<string, any>}
 */
export function readCollection(name) {
  try {
    return JSON.parse(readFileSync(filePath(name), 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    throw err;
  }
}

/**
 * Write a collection atomically (tmp file + rename), creating the
 * data directory on first use. Pretty-printed so users can edit it.
 * @param {string} name
 * @param {Record<string, any>} data
 */
export function writeCollection(name, data) {
  mkdirSync(dataDir(), { recursive: true });
  const target = filePath(name);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, target);
}

/** @returns {Record<string, any>} */
export const readCards = () => readCollection('cards');
/** @param {Record<string, any>} cards */
export const writeCards = (cards) => writeCollection('cards', cards);
/** @returns {Record<string, any>} */
export const readInbox = () => readCollection('inbox');
/** @param {Record<string, any>} inbox */
export const writeInbox = (inbox) => writeCollection('inbox', inbox);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test lib/store.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 5: Run the whole suite, then commit**

Run: `node --test lib/`
Expected: all tests PASS

```bash
git add lib/store.mjs lib/store.test.mjs
git commit -m "feat: JSON store in ~/.ultralearn with ULTRALEARN_DIR override"
```

---

### Task 4: CLI card commands (`add`, `due`, `rate`, `list`)

**Files:**
- Create: `lib/cli.mjs`
- Test: `lib/cli.test.mjs`

**Interfaces:**
- Consumes: `newCardState`, `review` from `lib/fsrs.mjs`; `readCards`, `writeCards`, `readInbox`, `writeInbox` from `lib/store.mjs`.
- Produces (process interface used by all skills; every command prints JSON to stdout, errors to stderr with exit code 1):
  - `add --front <str> --back <str> [--tags a,b] [--source manual|session|workflow]` prints the created Card.
  - `due [--limit N]` prints an array of due Cards, oldest due first.
  - `rate <cardId> <again|hard|good|easy|1|2|3|4>` prints the updated Card.
  - `list` prints an array of all Cards.
  - Card shape: `{ id, front, back, tags: string[], source, createdAt, fsrs: FsrsState }` exactly as in docs/design.md.
- Task 5 appends the inbox commands to this same file and its `commands` map.

- [ ] **Step 1: Write the failing test**

Create `lib/cli.test.mjs`:

```js
// @ts-check
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.mjs');

/** @type {string} */
let dir;

/**
 * Run the CLI against the temp data dir and parse its JSON output.
 * @param {...string} args
 * @returns {any}
 */
const run = (...args) =>
  JSON.parse(
    execFileSync(process.execPath, [CLI, ...args], {
      env: { ...process.env, ULTRALEARN_DIR: dir },
      encoding: 'utf8',
    }),
  );

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ultralearn-cli-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('add creates a card that is immediately due', () => {
  const card = run(
    'add',
    '--front', 'What does the borrow checker enforce?',
    '--back', 'Single ownership and reference validity, at compile time.',
    '--tags', 'rust,ownership',
  );
  assert.ok(card.id);
  assert.equal(card.source, 'manual');
  assert.deepEqual(card.tags, ['rust', 'ownership']);
  assert.equal(card.fsrs.reps, 0);
  assert.equal(card.fsrs.lastReview, null);
  const due = run('due');
  assert.equal(due.length, 1);
  assert.equal(due[0].id, card.id);
});

test('due respects --limit and sorts oldest due first', () => {
  const first = run('add', '--front', 'q1', '--back', 'a1');
  const second = run('add', '--front', 'q2', '--back', 'a2');
  assert.ok(first.fsrs.due <= second.fsrs.due);
  const limited = run('due', '--limit', '1');
  assert.equal(limited.length, 1);
  assert.equal(limited[0].id, first.id);
});

test('rate good schedules the card out of the due queue', () => {
  const card = run('add', '--front', 'f', '--back', 'b');
  const updated = run('rate', card.id, 'good');
  assert.equal(updated.fsrs.reps, 1);
  assert.ok(new Date(updated.fsrs.due) > new Date());
  assert.deepEqual(run('due'), []);
  assert.equal(run('list').length, 1);
});

test('rate accepts numeric ratings and rejects unknown ones', () => {
  const card = run('add', '--front', 'f', '--back', 'b');
  const updated = run('rate', card.id, '4');
  assert.equal(updated.fsrs.reps, 1);
  assert.throws(() => run('rate', card.id, 'perfect'));
});

test('unknown subcommand exits non-zero', () => {
  assert.throws(() => run('frobnicate'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test lib/cli.test.mjs`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the CLI card commands**

Create `lib/cli.mjs`:

```js
#!/usr/bin/env node
// @ts-check
/**
 * ultralearn CLI. Skills call this as:
 *   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" <subcommand> [args]
 * Every command prints JSON to stdout; errors go to stderr, exit code 1.
 */
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { newCardState, review } from './fsrs.mjs';
import { readCards, writeCards, readInbox, writeInbox } from './store.mjs';

/** @typedef {import('./fsrs.mjs').FsrsState} FsrsState */
/** @typedef {import('./fsrs.mjs').Rating} Rating */

/**
 * @typedef {Object} Card
 * @property {string} id
 * @property {string} front
 * @property {string} back
 * @property {string[]} tags
 * @property {'session' | 'manual' | 'workflow'} source
 * @property {string} createdAt ISO8601
 * @property {FsrsState} fsrs
 */

const RATING_NAMES = /** @type {Record<string, Rating>} */ ({
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
});

/** @param {unknown} value */
const out = (value) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

/**
 * @param {string} message
 * @returns {never}
 */
const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

/** @param {string | undefined} raw */
const parseTags = (raw) =>
  raw ? raw.split(',').map((t) => t.trim()).filter(Boolean) : [];

/**
 * @param {{ front: string, back: string, tags: string[], source: Card['source'] }} input
 * @param {Date} [now]
 * @returns {Card}
 */
const makeCard = ({ front, back, tags, source }, now = new Date()) => ({
  id: randomUUID(),
  front,
  back,
  tags,
  source,
  createdAt: now.toISOString(),
  fsrs: newCardState(now),
});

/**
 * @param {Record<string, Card>} cards
 * @param {Date} [now]
 * @returns {Card[]}
 */
const dueCards = (cards, now = new Date()) =>
  Object.values(cards)
    .filter((card) => new Date(card.fsrs.due) <= now)
    .sort((a, b) => a.fsrs.due.localeCompare(b.fsrs.due));

/** @param {string[]} argv */
function cmdAdd(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      front: { type: 'string' },
      back: { type: 'string' },
      tags: { type: 'string' },
      source: { type: 'string' },
    },
  });
  if (!values.front || !values.back) fail('add requires --front and --back');
  const card = makeCard({
    front: values.front,
    back: values.back,
    tags: parseTags(values.tags),
    source: /** @type {Card['source']} */ (values.source ?? 'manual'),
  });
  const cards = readCards();
  cards[card.id] = card;
  writeCards(cards);
  out(card);
}

/** @param {string[]} argv */
function cmdDue(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { limit: { type: 'string' } },
  });
  const limit = values.limit ? Number(values.limit) : Infinity;
  out(dueCards(readCards()).slice(0, limit));
}

/** @param {string[]} argv */
function cmdRate(argv) {
  const [id, ratingArg] = argv;
  if (!id || !ratingArg) fail('usage: rate <cardId> <again|hard|good|easy|1-4>');
  const rating = RATING_NAMES[ratingArg] ?? Number(ratingArg);
  if (![1, 2, 3, 4].includes(rating)) fail(`unknown rating: ${ratingArg}`);
  const cards = readCards();
  const card = cards[id];
  if (!card) fail(`no card with id ${id}`);
  const updated = { ...card, fsrs: review(card.fsrs, /** @type {Rating} */ (rating)) };
  cards[id] = updated;
  writeCards(cards);
  out(updated);
}

function cmdList() {
  out(Object.values(readCards()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
}

/** @type {Record<string, (argv: string[]) => void>} */
const commands = {
  add: cmdAdd,
  due: cmdDue,
  rate: cmdRate,
  list: cmdList,
};

const [cmd, ...rest] = process.argv.slice(2);
const handler = cmd ? commands[cmd] : undefined;
if (!handler) fail(`usage: cli.mjs <${Object.keys(commands).join('|')}> [args]`);
handler(rest);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test lib/cli.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add lib/cli.mjs lib/cli.test.mjs
git commit -m "feat: CLI card commands (add, due, rate, list)"
```

---

### Task 5: CLI inbox commands (`inbox-add`, `inbox-list`, `inbox-promote`, `inbox-dismiss`)

**Files:**
- Modify: `lib/cli.mjs` (add four command functions, extend the `commands` map)
- Modify: `lib/cli.test.mjs` (append tests)

**Interfaces:**
- Consumes: `makeCard`, `readInbox`, `writeInbox`, `readCards`, `writeCards` already in `lib/cli.mjs` (Task 4).
- Produces (process interface used by /inbox and /extract skills):
  - `inbox-add --front <str> --back <str> [--tags a,b] [--context <str>] [--source session]` prints the created Candidate: `{ id, front, back, tags: string[], source, sessionDate: ISO8601, context: string }`.
  - `inbox-list` prints an array of Candidates, oldest first.
  - `inbox-promote <id> [--front <str>] [--back <str>]` moves a candidate into the deck (optional front/back overrides support the "edit" triage path), prints the created Card, removes the candidate.
  - `inbox-dismiss <id>` removes a candidate, prints `{ "dismissed": "<id>" }`.

- [ ] **Step 1: Append failing tests**

Append to `lib/cli.test.mjs`:

```js
test('inbox-add creates a candidate with context and session source', () => {
  const candidate = run(
    'inbox-add',
    '--front', 'Why did the N+1 query happen here?',
    '--back', 'Each iteration lazily loaded a relation; batch with a join or prefetch.',
    '--tags', 'orm,performance',
    '--context', 'Debugging slow endpoint in a session about Django',
  );
  assert.ok(candidate.id);
  assert.equal(candidate.source, 'session');
  assert.equal(candidate.context, 'Debugging slow endpoint in a session about Django');
  assert.ok(candidate.sessionDate);
  assert.equal(run('inbox-list').length, 1);
});

test('inbox-promote moves a candidate to the deck, with optional edits', () => {
  const candidate = run('inbox-add', '--front', 'q1', '--back', 'a1', '--tags', 't1');
  const card = run('inbox-promote', candidate.id, '--back', 'a1 (sharpened)');
  assert.equal(card.front, 'q1');
  assert.equal(card.back, 'a1 (sharpened)');
  assert.deepEqual(card.tags, ['t1']);
  assert.equal(card.source, 'session');
  assert.equal(card.fsrs.reps, 0);
  assert.deepEqual(run('inbox-list'), []);
  assert.equal(run('list').length, 1);
  assert.equal(run('due').length, 1); // promoted cards are immediately due
});

test('inbox-dismiss removes a candidate without touching the deck', () => {
  const keep = run('inbox-add', '--front', 'q1', '--back', 'a1');
  const drop = run('inbox-add', '--front', 'q2', '--back', 'a2');
  const result = run('inbox-dismiss', drop.id);
  assert.deepEqual(result, { dismissed: drop.id });
  const remaining = run('inbox-list');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, keep.id);
  assert.deepEqual(run('list'), []);
});

test('inbox-promote and inbox-dismiss reject unknown ids', () => {
  assert.throws(() => run('inbox-promote', 'nope'));
  assert.throws(() => run('inbox-dismiss', 'nope'));
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test lib/cli.test.mjs`
Expected: FAIL, `usage: cli.mjs <add|due|rate|list>` (unknown subcommand)

- [ ] **Step 3: Implement the inbox commands**

In `lib/cli.mjs`, insert the following above the `commands` map:

```js
/**
 * @typedef {Object} Candidate
 * @property {string} id
 * @property {string} front
 * @property {string} back
 * @property {string[]} tags
 * @property {Card['source']} source
 * @property {string} sessionDate ISO8601
 * @property {string} context brief note on where this came from
 */

/** @param {string[]} argv */
function cmdInboxAdd(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      front: { type: 'string' },
      back: { type: 'string' },
      tags: { type: 'string' },
      context: { type: 'string' },
      source: { type: 'string' },
    },
  });
  if (!values.front || !values.back) fail('inbox-add requires --front and --back');
  /** @type {Candidate} */
  const candidate = {
    id: randomUUID(),
    front: values.front,
    back: values.back,
    tags: parseTags(values.tags),
    source: /** @type {Card['source']} */ (values.source ?? 'session'),
    sessionDate: new Date().toISOString(),
    context: values.context ?? '',
  };
  const inbox = readInbox();
  inbox[candidate.id] = candidate;
  writeInbox(inbox);
  out(candidate);
}

function cmdInboxList() {
  out(
    Object.values(readInbox()).sort((a, b) =>
      a.sessionDate.localeCompare(b.sessionDate),
    ),
  );
}

/** @param {string[]} argv */
function cmdInboxPromote(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      front: { type: 'string' },
      back: { type: 'string' },
    },
    allowPositionals: true,
  });
  const [id] = positionals;
  if (!id) fail('usage: inbox-promote <id> [--front "..."] [--back "..."]');
  const inbox = readInbox();
  const candidate = inbox[id];
  if (!candidate) fail(`no inbox candidate with id ${id}`);
  const card = makeCard({
    front: values.front ?? candidate.front,
    back: values.back ?? candidate.back,
    tags: candidate.tags,
    source: candidate.source,
  });
  const cards = readCards();
  cards[card.id] = card;
  writeCards(cards);
  delete inbox[id];
  writeInbox(inbox);
  out(card);
}

/** @param {string[]} argv */
function cmdInboxDismiss(argv) {
  const [id] = argv;
  if (!id) fail('usage: inbox-dismiss <id>');
  const inbox = readInbox();
  if (!inbox[id]) fail(`no inbox candidate with id ${id}`);
  delete inbox[id];
  writeInbox(inbox);
  out({ dismissed: id });
}
```

Then replace the `commands` map with:

```js
/** @type {Record<string, (argv: string[]) => void>} */
const commands = {
  add: cmdAdd,
  due: cmdDue,
  rate: cmdRate,
  list: cmdList,
  'inbox-add': cmdInboxAdd,
  'inbox-list': cmdInboxList,
  'inbox-promote': cmdInboxPromote,
  'inbox-dismiss': cmdInboxDismiss,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test lib/cli.test.mjs`
Expected: PASS, 9 tests

- [ ] **Step 5: Run the whole suite, then commit**

Run: `node --test lib/`
Expected: all tests PASS

```bash
git add lib/cli.mjs lib/cli.test.mjs
git commit -m "feat: CLI inbox commands (add, list, promote, dismiss)"
```

---

### Task 6: Status line script (`lib/statusline.mjs`)

**Files:**
- Create: `lib/statusline.mjs`
- Test: `lib/statusline.test.mjs`

**Interfaces:**
- Consumes: `readCards` from `lib/store.mjs`.
- Produces: a standalone script. When at least one card is due it writes exactly `↻ <front>` (one randomly chosen due card, no trailing newline) to stdout; when nothing is due, or on ANY error (missing dir, corrupt JSON), it writes nothing and exits 0. A status line must never crash or nag. Users wire it into `statusLine` in their own settings (documented in Task 10); it is not registered by the plugin.

- [ ] **Step 1: Write the failing test**

Create `lib/statusline.test.mjs`:

```js
// @ts-check
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = dirname(fileURLToPath(import.meta.url));
const STATUSLINE = join(LIB, 'statusline.mjs');
const CLI = join(LIB, 'cli.mjs');

/** @type {string} */
let dir;

/** @param {string} script @param {string[]} [args] */
const runScript = (script, args = []) =>
  execFileSync(process.execPath, [script, ...args], {
    env: { ...process.env, ULTRALEARN_DIR: dir },
    encoding: 'utf8',
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ultralearn-hud-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('prints one due card front with the cue glyph', () => {
  runScript(CLI, ['add', '--front', 'What does the borrow checker enforce?', '--back', 'b']);
  const output = runScript(STATUSLINE);
  assert.equal(output, '↻ What does the borrow checker enforce?');
});

test('prints nothing when nothing is due', () => {
  assert.equal(runScript(STATUSLINE), '');
});

test('prints exactly one cue and never a count, even with many due cards', () => {
  const fronts = ['q one', 'q two', 'q three', 'q four'];
  for (const front of fronts) {
    runScript(CLI, ['add', '--front', front, '--back', 'a']);
  }
  const output = runScript(STATUSLINE);
  assert.match(output, /^↻ q (one|two|three|four)$/);
});

test('a corrupt cards.json is silent, not a crash', () => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'cards.json'), 'not json{');
  assert.equal(runScript(STATUSLINE), '');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test lib/statusline.test.mjs`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the status line script**

Create `lib/statusline.mjs`:

```js
#!/usr/bin/env node
// @ts-check
/**
 * ultralearn status line: one due card's front as a retrieval cue.
 * One cue, never a count. Quiet when nothing is due. Silent on any error;
 * a status line must never crash or demand attention.
 *
 * Wire into ~/.claude/settings.json:
 *   { "statusLine": { "type": "command", "command": "node <path-to>/lib/statusline.mjs" } }
 */
import { readCards } from './store.mjs';

try {
  const now = new Date();
  const due = Object.values(readCards()).filter(
    (card) => new Date(card.fsrs.due) <= now,
  );
  if (due.length > 0) {
    const pick = due[Math.floor(Math.random() * due.length)];
    process.stdout.write(`↻ ${pick.front}`);
  }
} catch {
  // Stay quiet. The cue is a gift, not a demand; an error is nobody's problem.
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test lib/statusline.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 5: Run the whole suite, then commit**

Run: `node --test lib/`
Expected: all tests PASS

```bash
git add lib/statusline.mjs lib/statusline.test.mjs
git commit -m "feat: status line script showing one due-card cue"
```

---

### Task 7: Hook wiring (`hooks/hooks.json`)

**Files:**
- Create: `hooks/hooks.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a SessionStart hook whose stdout lands in Claude's context, announcing the plugin's skills so Claude knows they exist without the user asking. No extraction hook: extraction is the /extract skill (SessionEnd hooks cannot read the transcript). No status line registration: that is user-level config.

- [ ] **Step 1: Write the hook config**

Create `hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo \"ultralearn active. Skills: /review (retrieval session), /inbox (triage extracted candidates), /add (create a card), /extract (mine this session for cards). Spaced repetition grounded in Scott Young's Ultralearning. Data: ~/.ultralearn/\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Validate the JSON and the shell quoting**

Run: `node -e "const h = require('./hooks/hooks.json'); console.log(h.hooks.SessionStart[0].hooks[0].type)"`
Expected: prints `command`

Run: `bash -c "$(node -p "require('./hooks/hooks.json').hooks.SessionStart[0].hooks[0].command")"`
Expected: prints the announce line, including "Scott Young's Ultralearning", with no shell error

- [ ] **Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: SessionStart hook announcing ultralearn skills"
```

---

### Task 8: /add and /review skills

**Files:**
- Create: `skills/add.md`
- Create: `skills/review.md`

**Interfaces:**
- Consumes: CLI commands `add`, `due`, `rate` (Task 4) via `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs"`.
- Produces: the two primary learning-session skills. No code contract; the contract is the CLI JSON shapes defined in Task 4.

- [ ] **Step 1: Write the /add skill**

Create `skills/add.md`:

```markdown
---
name: add
description: Create a spaced-repetition card manually in the ultralearn deck. Use when the user runs /add, says "add a card", "make a card for this", or "I want to remember this".
---

# Add a card

Create one card in the user's ultralearn deck.

## Steps

1. Determine the card content:
   - If the user gave front and back explicitly (e.g. `/add "front" "back"`), use them as given.
   - If they pointed at something in the conversation ("make a card for that"), draft an atomic front/back pair yourself: front is a question that demands production (not recognition), back is the shortest complete answer. Show the draft and get a confirmation before saving.
2. Save it:

   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" add --front "..." --back "..." --tags "tag1,tag2"

   Tags are optional: comma-separated, lowercase, topic-level (e.g. "rust,ownership").
   The command prints the created card as JSON.
3. Confirm in one line, quoting the card's front. Do not mention deck size, due counts, or review schedules.

## Card quality rules

- One idea per card. Split compound facts into several cards.
- The front asks a question; the back answers it. Never "front: topic X, back: everything about X".
- Prefer conceptual questions ("why", "what distinguishes") over trivia.
- Skip project-specific trivia and anything better looked up than memorized.
```

- [ ] **Step 2: Write the /review skill**

Create `skills/review.md`:

```markdown
---
name: review
description: Run a spaced-repetition review session over due ultralearn cards. Use when the user runs /review, says "let's review", "quiz me", or wants to practice what they've been learning.
---

# Review session

An FSRS-driven retrieval session. Retrieval means production: the user answers before seeing anything. The user can stop at any time and stopping is always fine.

## Loop

1. Fetch due cards:

   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" due --limit 10

2. If the list is empty: say "Nothing is due right now." and stop. Do NOT say when the next card is due, how many cards exist, or suggest coming back later.
3. For each card, one at a time:
   a. Show ONLY the front, phrased as the question it is. Never reveal the back first. Never say how many cards are in the batch or remain.
   b. Wait for the user's typed answer.
   c. Compare their answer to the back. Reveal the back and give one or two sentences of feedback: what they got, what they missed.
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
5. When the batch is done or the user stops: close warmly in one line, e.g. "Good session." NO summary counts, NO "X of Y correct", NO streaks, NO "see you tomorrow".

## Anti-guilt rules (hard constraints)

- Never show how many cards are due, remaining, or overdue.
- Never mention missed days, review debt, or how long since the last session.
- Stopping mid-session is always fine; don't remark on it.
- This plugin is grounded in Scott Young's Ultralearning; if the user asks about the method, point them to the plugin's THEORY.md.
```

- [ ] **Step 3: Verify frontmatter parses**

Run: `node -e "const fs=require('fs');for(const f of ['skills/add.md','skills/review.md']){const t=fs.readFileSync(f,'utf8');if(!/^---\nname: .+\ndescription: .+\n---\n/.test(t))throw new Error(f+' frontmatter bad');}console.log('ok')"`
Expected: prints `ok`

- [ ] **Step 4: Commit**

```bash
git add skills/add.md skills/review.md
git commit -m "feat: /add and /review skills"
```

---

### Task 9: /inbox and /extract skills

**Files:**
- Create: `skills/inbox.md`
- Create: `skills/extract.md`

**Interfaces:**
- Consumes: CLI commands `inbox-add`, `inbox-list`, `inbox-promote`, `inbox-dismiss` (Task 5) via `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs"`.
- Produces: the triage skill and the extraction skill that feeds it. /extract works on the CURRENT conversation, invoked by the user while it is in context (SessionEnd hooks cannot read the transcript, which is why this is a skill and not a hook).

- [ ] **Step 1: Write the /inbox skill**

Create `skills/inbox.md`:

```markdown
---
name: inbox
description: Triage auto-extracted ultralearn card candidates. Use when the user runs /inbox, says "triage my inbox", "review the extracted cards", or asks what's waiting in the learning inbox.
---

# Inbox triage

Candidates extracted from work sessions wait here for the user's judgment. The user never keeps a card they didn't choose; choosing what to learn is itself metalearning (Scott Young's principle #1).

## Steps

1. List candidates:

   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" inbox-list

2. If empty: say the inbox is empty and mention that /extract at the end of a rich session fills it. Stop.
3. Say how many candidates are waiting (a triage queue count is fine; due-card counts are not), then present them ONE at a time: front, back, and context. Offer three moves:
   - **keep**: node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" inbox-promote <id>
   - **edit**: agree on better wording with the user, then
     node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" inbox-promote <id> --front "..." --back "..."
   - **skip**: node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" inbox-dismiss <id>
4. Honor batch instructions ("keep all", "dismiss the rest") without walking through each one.
5. When done, confirm what entered the deck in one line. Do not mention when the new cards are due or how many cards the deck now holds.

## Judgment help

If the user asks whether a candidate is worth keeping, apply the filter: keep concepts, distinctions, and debugging insights; dismiss project-specific trivia and things better looked up than memorized.
```

- [ ] **Step 2: Write the /extract skill**

Create `skills/extract.md`:

```markdown
---
name: extract
description: Extract learning moments from the current Claude session into the ultralearn inbox. Use when the user runs /extract, says "extract cards from this session", "mine this conversation for cards", or is wrapping up a session with learnable content.
---

# Extract learning moments

Analyze the CURRENT conversation (it is already in your context) and produce card candidates for the ultralearn inbox. This must run while the session content is in context; it cannot read past sessions.

## What counts as a learning moment

- A concept the user asked about
- A mistake that was corrected
- A technique or pattern that was explained or demonstrated for the first time
- A distinction the user confused (e.g. "clone vs Copy", "@property vs @cached_property")
- A debugging insight (e.g. "why the N+1 query happened here")

## What to skip

- Project-specific trivia (config file names, local paths, ticket numbers)
- Anything the user demonstrated they already knew
- Implementation details better looked up than memorized
- Secrets, credentials, API keys, personal data: never put these in a card

## Steps

1. Re-read the conversation and list the candidate moments. Be generous: catch more, not fewer. The cut happens in /inbox triage, not here.
2. For each moment write an atomic candidate: front is a production question carrying ONE idea; back is the shortest complete answer; context is one line on where in the session it came from.
3. Save each candidate:

   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" inbox-add --front "..." --back "..." --tags "topic" --context "..."

4. Tell the user in one line how many candidates went to the inbox and that /inbox triages them. No pressure to triage now.

If the session had no learning moments, say so plainly. An empty extraction is a fine outcome, not a failure.
```

- [ ] **Step 3: Verify frontmatter parses**

Run: `node -e "const fs=require('fs');for(const f of ['skills/inbox.md','skills/extract.md']){const t=fs.readFileSync(f,'utf8');if(!/^---\nname: .+\ndescription: .+\n---\n/.test(t))throw new Error(f+' frontmatter bad');}console.log('ok')"`
Expected: prints `ok`

- [ ] **Step 4: Commit**

```bash
git add skills/inbox.md skills/extract.md
git commit -m "feat: /inbox and /extract skills"
```

---

### Task 10: README update and end-to-end verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything shipped in Tasks 1-9.
- Produces: a README that matches what v0 actually does (extraction is /extract, not automatic; status line is user-wired) plus a manual smoke check of the whole loop.

- [ ] **Step 1: Update README "How it works" and commands**

In `README.md`, replace the "How it works" section:

```markdown
## How it works

1. **Work normally.** When a session taught you something, run `/extract`: the agent mines the conversation for learning moments and files card candidates into an inbox.
2. **Triage.** Run `/inbox` to promote candidates to your deck, edit them, or dismiss them. You never keep a card you didn't choose.
3. **Review.** Run `/review` in a dedicated session. The FSRS algorithm picks due cards. You type your answer from memory. The agent scores it and reschedules.
4. **Ambient cues (optional).** Wire the status line script into your settings and one due card's front appears as a retrieval cue. One cue, never a count.
```

Replace the commands table:

```markdown
| Command | What it does |
|---|---|
| `/review` | FSRS-driven retrieval session |
| `/inbox` | Triage extracted card candidates |
| `/add "front" "back"` | Create a card manually |
| `/extract` | Mine the current session for card candidates |
```

Insert a new section between "Commands" and "Theory":

````markdown
## Status line (optional)

The plugin ships a composable status line script that shows one due card's front as a retrieval cue while Claude works. If nothing is due, it stays quiet. Wire it into `~/.claude/settings.json`, pointing at your installed plugin directory:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/path/to/ultralearn/lib/statusline.mjs\""
  }
}
```

No counter, no streak, no debt. The cue is a gift, not a demand.
````

- [ ] **Step 2: Run the full test suite**

Run: `node --test lib/`
Expected: all tests PASS (33 tests across 4 files)

- [ ] **Step 3: Manual smoke test of the whole loop in a sandbox dir**

Run:

```bash
export ULTRALEARN_DIR=$(mktemp -d) && \
node lib/cli.mjs inbox-add --front "What does FSRS stability represent?" --back "Days until recall probability decays to 90%." --context "smoke test" && \
node lib/cli.mjs inbox-list && \
ID=$(node -p "Object.values(require(process.env.ULTRALEARN_DIR + '/inbox.json'))[0].id") && \
node lib/cli.mjs inbox-promote "$ID" && \
node lib/cli.mjs due && \
node lib/statusline.mjs && echo && \
CARD=$(node -p "Object.keys(require(process.env.ULTRALEARN_DIR + '/cards.json'))[0]") && \
node lib/cli.mjs rate "$CARD" good && \
node lib/cli.mjs due && \
node lib/statusline.mjs && echo "(quiet)" && \
rm -rf "$ULTRALEARN_DIR" && unset ULTRALEARN_DIR
```

Expected: candidate JSON, one-element inbox list, promoted card JSON, one due card, `↻ What does FSRS stability represent?`, updated card with `reps: 1` and a future `due`, empty due list `[]`, and a quiet status line.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README matches v0 (/extract flow, status line wiring)"
```

---

## Deferred to v1 (explicitly out of scope)

`/learn`, `/drill`, Feynman escalation, `/progress`, `projects.json`, `config.json`, per-user FSRS weight optimization, marketplace packaging. `fsrs-state.json` from the design doc's data-layer table is intentionally collapsed into each card's `fsrs` field per the v0 schema.
