// @ts-check
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
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
      env: { ...process.env, OLIBA_DIR: dir },
      encoding: 'utf8',
    }),
  );

/**
 * Run the CLI with stdin input and parse its JSON output.
 * @param {string} stdinData
 * @param {...string} args
 * @returns {any}
 */
const runWithStdin = (stdinData, ...args) =>
  JSON.parse(
    execFileSync(process.execPath, [CLI, ...args], {
      env: { ...process.env, OLIBA_DIR: dir },
      encoding: 'utf8',
      input: stdinData,
    }),
  );

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oliba-cli-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// --- Card commands ---

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

test('add stores ref when provided', () => {
  const card = run('add', '--front', 'q', '--back', 'a', '--ref', 'https://example.com/guide#node');
  assert.equal(card.ref, 'https://example.com/guide#node');
});

test('add defaults ref to null', () => {
  const card = run('add', '--front', 'q', '--back', 'a');
  assert.equal(card.ref, null);
});

test('due respects --limit and sorts oldest due first', () => {
  const first = run('add', '--front', 'q1', '--back', 'a1');
  const second = run('add', '--front', 'q2', '--back', 'a2');
  assert.ok(first.fsrs.due <= second.fsrs.due);
  const limited = run('due', '--limit', '1');
  assert.equal(limited.length, 1);
  assert.equal(limited[0].id, first.id);
});

test('due --hide-back strips the back field', () => {
  const card = run('add', '--front', 'What is ownership?', '--back', 'A compile-time memory management system.');
  const hidden = run('due', '--hide-back');
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].front, 'What is ownership?');
  assert.equal(hidden[0].back, undefined, 'back must be absent when --hide-back is used');
  assert.equal(hidden[0].id, card.id);
});

test('due --tag filters cards by tag', () => {
  run('add', '--front', 'q1', '--back', 'a1', '--tags', 'rust,ownership');
  run('add', '--front', 'q2', '--back', 'a2', '--tags', 'python,typing');
  const rustCards = run('due', '--tag', 'rust');
  assert.equal(rustCards.length, 1);
  assert.equal(rustCards[0].front, 'q1');
  const pyCards = run('due', '--tag', 'python');
  assert.equal(pyCards.length, 1);
  assert.equal(pyCards[0].front, 'q2');
});

test('due --tag matches prefix tags like project:abc', () => {
  run('add', '--front', 'q1', '--back', 'a1', '--tags', 'project:abc,rust');
  run('add', '--front', 'q2', '--back', 'a2', '--tags', 'project:xyz');
  const abcCards = run('due', '--tag', 'project');
  assert.equal(abcCards.length, 2, 'prefix "project" matches both project:abc and project:xyz');
  const exactCards = run('due', '--tag', 'project:abc');
  assert.equal(exactCards.length, 1);
  assert.equal(exactCards[0].front, 'q1');
});

test('reveal returns the back and ref for a card', () => {
  const card = run('add', '--front', 'q', '--back', 'the answer', '--ref', 'https://example.com/guide');
  const revealed = run('reveal', card.id);
  assert.equal(revealed.id, card.id);
  assert.equal(revealed.back, 'the answer');
  assert.equal(revealed.ref, 'https://example.com/guide');
});

test('reveal rejects unknown id', () => {
  assert.throws(() => run('reveal', 'nonexistent'));
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

// --- Project commands ---

test('project-create creates a project with topic and optional sources', () => {
  const project = run('project-create', '--topic', 'rust ownership', '--sources', 'ch4.pdf,ch5.pdf');
  assert.ok(project.id);
  assert.equal(project.topic, 'rust ownership');
  assert.deepEqual(project.sources, ['ch4.pdf', 'ch5.pdf']);
  assert.equal(project.artifactUrl, null);
  assert.deepEqual(project.nodes, []);
  assert.deepEqual(project.edges, []);
  assert.ok(project.createdAt);
});

test('project-create works without sources', () => {
  const project = run('project-create', '--topic', 'fsrs');
  assert.deepEqual(project.sources, []);
});

test('project-list returns summaries sorted by creation', () => {
  const p1 = run('project-create', '--topic', 'alpha');
  const p2 = run('project-create', '--topic', 'beta');
  const list = run('project-list');
  assert.equal(list.length, 2);
  assert.equal(list[0].topic, 'alpha');
  assert.equal(list[1].topic, 'beta');
  assert.equal(list[0].nodeCount, 0);
  assert.ok(!list[0].nodes, 'list should not include full nodes');
});

test('project-get returns the full project', () => {
  const created = run('project-create', '--topic', 'test');
  const got = run('project-get', created.id);
  assert.equal(got.id, created.id);
  assert.equal(got.topic, 'test');
  assert.deepEqual(got.nodes, []);
});

test('project-get rejects unknown id', () => {
  assert.throws(() => run('project-get', 'nonexistent'));
});

test('project-update replaces a project from stdin JSON', () => {
  const created = run('project-create', '--topic', 'original');
  const updated = {
    ...created,
    topic: 'original',
    nodes: [
      { id: 'n1', title: 'basics', description: 'the basics', status: 'mapped', cardIds: [], research: null },
    ],
    edges: [],
  };
  const result = runWithStdin(JSON.stringify(updated), 'project-update', created.id);
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].title, 'basics');
});

test('project-update merges: fields not sent survive (regression: topic/createdAt wiped)', () => {
  const created = run('project-create', '--topic', 'Sicilian defense');
  const partial = { nodes: [{ id: 'n1', title: 'a', description: 'a', status: 'mapped', cardIds: [] }], edges: [], artifactUrl: 'https://x' };
  runWithStdin(JSON.stringify(partial), 'project-update', created.id);
  const got = run('project-get', created.id);
  assert.equal(got.topic, 'Sicilian defense');
  assert.equal(got.createdAt, created.createdAt);
  assert.equal(got.artifactUrl, 'https://x');
  assert.equal(got.nodes.length, 1);
});

test('lesson-save persists a new project, canonical-tagged cards, and node links', () => {
  const result = {
    isNew: true,
    map: {
      nodes: [
        { id: 'n1', title: 'Basics', description: 'd1' },
        { id: 'n2', title: 'Next', description: 'd2' },
      ],
      edges: [{ from: 'n1', to: 'n2' }],
      suggestedStart: 'n1',
    },
    deepened: [{
      nodeId: 'n1',
      nodeTitle: 'Basics',
      guide: '# g',
      research: { sources: [], synthesis: 's', excluded: [], references: [] },
      cards: [
        { front: 'q1', back: 'a1', tags: ['project:PROJECT_ID', 'node:n1', 'theme'], layer: 'starter' },
        { front: 'q2', back: 'a2', tags: ['theme'], layer: 'starter' },
      ],
    }],
  };
  const saved = runWithStdin(JSON.stringify(result), 'lesson-save', '--topic', 'Code de la route');
  assert.equal(saved.created, true);
  assert.equal(saved.cardCount, 2);

  const project = run('project-get', saved.projectId);
  assert.equal(project.topic, 'Code de la route');
  assert.ok(project.createdAt);
  assert.equal(project.nodes.length, 2);
  const n1 = project.nodes.find((/** @type {any} */ n) => n.id === 'n1');
  assert.equal(n1.status, 'deepened');
  assert.equal(n1.guide, '# g');
  assert.equal(n1.cardIds.length, 2);
  assert.equal(project.nodes.find((/** @type {any} */ n) => n.id === 'n2').status, 'mapped');

  const cards = run('list');
  assert.equal(cards.length, 2);
  for (const card of cards) {
    assert.deepEqual(card.tags, [`project:${saved.projectId}`, 'node:n1', 'theme']);
  }

  // Continuation keeps existing cards on the node and adds the new ones.
  const more = { map: result.map, deepened: [{ ...result.deepened[0], cards: [{ front: 'q3', back: 'a3', tags: [] }] }] };
  const again = runWithStdin(JSON.stringify(more), 'lesson-save', '--project', saved.projectId);
  assert.equal(again.created, false);
  assert.equal(again.cardCount, 3);
  assert.equal(run('project-list').length, 1);
});

test('lesson-save turns map starter cards into cards and deepens nothing', () => {
  const result = {
    map: {
      nodes: [
        { id: 'n1', title: 'Basics', description: 'd1', starterCards: [{ front: 'What is n1?', back: 'a' }] },
        { id: 'n2', title: 'Next', description: 'd2', starterCards: [] },
      ],
      edges: [{ from: 'n1', to: 'n2' }],
    },
    deepened: [],
  };
  const saved = runWithStdin(JSON.stringify(result), 'lesson-save', '--topic', 'Syllabus only');
  assert.equal(saved.cardsAdded, 1);
  const project = run('project-get', saved.projectId);
  for (const node of project.nodes) {
    assert.equal(node.status, 'mapped');
    assert.equal(node.starterCards, undefined);
  }
  const [card] = run('list');
  assert.deepEqual(card.tags, [`project:${saved.projectId}`, 'node:n1']);

  // /teach later deepens one node against the stored map.
  const deepen = {
    map: { nodes: project.nodes, edges: project.edges },
    deepened: [{ nodeId: 'n2', guide: '# g', research: { sources: [] }, cards: [{ front: 'q', back: 'a', tags: [] }] }],
  };
  runWithStdin(JSON.stringify(deepen), 'lesson-save', '--project', saved.projectId);
  const after = run('project-get', saved.projectId);
  assert.equal(after.nodes.find((/** @type {any} */ n) => n.id === 'n1').status, 'mapped');
  assert.equal(after.nodes.find((/** @type {any} */ n) => n.id === 'n1').cardIds.length, 1);
  assert.equal(after.nodes.find((/** @type {any} */ n) => n.id === 'n2').status, 'deepened');
  assert.equal(run('list').length, 2);
});

test('due --tag resolves a project by topic (case/accent-insensitive)', () => {
  const route = run('project-create', '--topic', 'Code de la route — France');
  const cooking = run('project-create', '--topic', 'Classic Italian Cooking');
  run('add', '--front', 'r1', '--back', 'a', '--tags', `project:${route.id},node:n1`);
  run('add', '--front', 'c1', '--back', 'a', '--tags', `project:${cooking.id}`);

  assert.deepEqual(run('due', '--tag', 'CODE DE LA RÔUTE').map((/** @type {any} */ c) => c.front), ['r1']);
  assert.deepEqual(run('due', '--tag', 'cooking').map((/** @type {any} */ c) => c.front), ['c1']);
  assert.deepEqual(run('due', '--tag', 'nothing-like-this'), []);
});

test('due --tag returns candidate projects when the name is ambiguous', () => {
  const a = run('project-create', '--topic', 'Italian cooking');
  const b = run('project-create', '--topic', 'French cooking');
  run('add', '--front', 'q', '--back', 'a', '--tags', `project:${a.id}`);
  const res = run('due', '--tag', 'cooking');
  assert.equal(res.ambiguous, true);
  assert.deepEqual(res.projects.map((/** @type {any} */ p) => p.id).sort(), [a.id, b.id].sort());
});

test('due --tag prefers an exact tag over project resolution', () => {
  run('project-create', '--topic', 'rust ownership');
  run('add', '--front', 'q1', '--back', 'a', '--tags', 'rust');
  assert.deepEqual(run('due', '--tag', 'rust').map((/** @type {any} */ c) => c.front), ['q1']);
});

test('project-update rejects unknown id', () => {
  assert.throws(() => runWithStdin('{}', 'project-update', 'nonexistent'));
});

test('project-add-cards links cards to a node', () => {
  const project = run('project-create', '--topic', 'test');
  const updated = {
    ...project,
    nodes: [{ id: 'n1', title: 'a', description: 'a', status: 'deepened', cardIds: [], research: null }],
  };
  runWithStdin(JSON.stringify(updated), 'project-update', project.id);
  const card = run('add', '--front', 'q', '--back', 'a', '--source', 'workflow');
  const result = run('project-add-cards', project.id, 'n1', '--cards', card.id);
  assert.deepEqual(result.nodes[0].cardIds, [card.id]);
});

test('project-add-cards does not duplicate card ids', () => {
  const project = run('project-create', '--topic', 'test');
  const updated = {
    ...project,
    nodes: [{ id: 'n1', title: 'a', description: 'a', status: 'deepened', cardIds: [], research: null }],
  };
  runWithStdin(JSON.stringify(updated), 'project-update', project.id);
  const card = run('add', '--front', 'q', '--back', 'a');
  run('project-add-cards', project.id, 'n1', '--cards', card.id);
  const result = run('project-add-cards', project.id, 'n1', '--cards', card.id);
  assert.equal(result.nodes[0].cardIds.length, 1);
});

test('project-get computes learning status from card FSRS state', () => {
  const project = run('project-create', '--topic', 'test');
  const updated = {
    ...project,
    nodes: [{ id: 'n1', title: 'a', description: 'a', status: 'deepened', cardIds: [], research: null }],
  };
  runWithStdin(JSON.stringify(updated), 'project-update', project.id);
  const card = run('add', '--front', 'q', '--back', 'a');
  run('project-add-cards', project.id, 'n1', '--cards', card.id);
  run('rate', card.id, 'good');
  const got = run('project-get', project.id);
  assert.equal(got.nodes[0].status, 'learning');
});

test('project-get computes mastered status when stability >= 21', () => {
  const project = run('project-create', '--topic', 'test');
  const cardId = 'mastered-card-1';
  const masteredCard = {
    id: cardId,
    front: 'q',
    back: 'a',
    tags: [],
    source: 'workflow',
    createdAt: '2026-01-01T00:00:00.000Z',
    fsrs: { difficulty: 5, stability: 30, reps: 5, lapses: 0, due: '2026-03-01T00:00:00.000Z', lastReview: '2026-01-15T00:00:00.000Z' },
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'cards.json'), JSON.stringify({ [cardId]: masteredCard }));
  const updated = {
    ...project,
    nodes: [{ id: 'n1', title: 'a', description: 'a', status: 'deepened', cardIds: [cardId], research: null }],
  };
  runWithStdin(JSON.stringify(updated), 'project-update', project.id);
  const got = run('project-get', project.id);
  assert.equal(got.nodes[0].status, 'mastered');
});

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

// --- /study entry point ---

/** @param {string} cardId */
const setCue = (cardId) => writeFileSync(join(dir, '.current-cue.json'), JSON.stringify({ cardId, ts: new Date().toISOString() }));

test('study-resolve: no arguments is a plain session', () => {
  assert.deepEqual(run('study-resolve'), { mode: 'plain' });
});

test('study-resolve: grill comes first', () => {
  run('add', '--front', 'q', '--back', 'a', '--tags', 'grill');
  assert.deepEqual(run('study-resolve', 'grill', 'me', 'on', 'rust'), { mode: 'grill', target: 'rust' });
});

test('study-resolve: a known tag or project topic filters', () => {
  run('add', '--front', 'q', '--back', 'a', '--tags', 'rust');
  run('project-create', '--topic', 'Code de la route');
  assert.deepEqual(run('study-resolve', 'rust'), { mode: 'filter', tag: 'rust' });
  assert.deepEqual(run('study-resolve', 'code', 'de', 'la', 'route'), { mode: 'filter', tag: 'code de la route' });
});

test('study-resolve: with a cue, other text is the answer', () => {
  const card = run('add', '--front', 'What does the borrow checker enforce?', '--back', 'a');
  setCue(card.id);
  assert.deepEqual(run('study-resolve', 'single', 'ownership'), { mode: 'cue', cardId: card.id, answer: 'single ownership' });
});

test('study-resolve: a tag while a cue shows is a tie to ask about', () => {
  const card = run('add', '--front', 'q', '--back', 'a', '--tags', 'rust');
  setCue(card.id);
  assert.deepEqual(run('study-resolve', 'rust'), { mode: 'ask', tag: 'rust', cueCardId: card.id });
});

test('study-resolve: unknown text without a cue is a plain session', () => {
  assert.deepEqual(run('study-resolve', 'whatever'), { mode: 'plain', unmatched: 'whatever' });
});

test('inbox commands are gone', () => {
  assert.throws(() => run('inbox-list'));
});

// --- Mission and language ---

test('project-create stores mission, language and term language', () => {
  const p = run('project-create', '--topic', 'rupture brutale', '--mission', 'Run discovery calls with distribution lawyers', '--language', 'pt-BR', '--term-language', 'fr');
  assert.equal(p.mission, 'Run discovery calls with distribution lawyers');
  assert.equal(p.language, 'pt-BR');
  assert.equal(p.termLanguage, 'fr');
  assert.deepEqual(p.records, []);
  assert.deepEqual(p.lessons, []);
});

test('project-create leaves mission and languages null when not given', () => {
  const p = run('project-create', '--topic', 'fsrs');
  assert.equal(p.mission, null);
  assert.equal(p.language, null);
  assert.equal(p.termLanguage, null);
});

test('project-set updates only the fields it is given', () => {
  const p = run('project-create', '--topic', 'chess', '--language', 'en');
  run('project-set', p.id, '--mission', 'Beat my brother at the Sicilian', '--term-language', 'en');
  const got = run('project-get', p.id);
  assert.equal(got.mission, 'Beat my brother at the Sicilian');
  assert.equal(got.language, 'en');
  assert.equal(got.termLanguage, 'en');
  assert.equal(got.topic, 'chess');
});

test('project-set rejects unknown id and empty calls', () => {
  assert.throws(() => run('project-set', 'nope', '--mission', 'x'));
  const p = run('project-create', '--topic', 't');
  assert.throws(() => run('project-set', p.id));
});

// --- Learning records ---

test('record appends an evidence-gated record', () => {
  const p = run('project-create', '--topic', 'rust');
  const { record } = run('record', p.id, '--kind', 'prior', '--text', 'Knows C pointers', '--evidence', 'Explained a dangling pointer unprompted');
  assert.ok(record.id);
  assert.equal(record.kind, 'prior');
  assert.equal(record.supersededBy, null);
  const got = run('project-get', p.id);
  assert.equal(got.records.length, 1);
  assert.equal(got.records[0].text, 'Knows C pointers');
});

test('record refuses a record without evidence or with an unknown kind', () => {
  const p = run('project-create', '--topic', 'rust');
  assert.throws(() => run('record', p.id, '--kind', 'insight', '--text', 'covered lifetimes'));
  assert.throws(() => run('record', p.id, '--kind', 'guess', '--text', 't', '--evidence', 'e'));
});

test('record --kind misconception appends a record and one contrast card', () => {
  const p = run('project-create', '--topic', 'rupture brutale');
  const { record, card } = run('record', p.id, '--kind', 'misconception',
    '--text', 'Thinks any contract end is a « rupture brutale »',
    '--evidence', 'Corrected: only an established relationship ended without enough notice',
    '--lesson', '1',
    '--front', 'Um contrato de 6 meses termina sem aviso. É « rupture brutale » (término abrupto)? Por quê?',
    '--back', 'Não necessariamente: exige « relation commerciale établie » e aviso insuficiente, não qualquer término.');
  assert.equal(record.cardId, card.id);
  assert.equal(card.source, 'teach');
  assert.ok(card.tags.includes(`project:${p.id}`));
  assert.ok(card.tags.includes('lesson:1'));
  assert.ok(card.tags.includes('misconception'));
  assert.equal(run('list').length, 1);
});

test('record --kind misconception needs the contrast card front and back', () => {
  const p = run('project-create', '--topic', 'rust');
  assert.throws(() => run('record', p.id, '--kind', 'misconception', '--text', 't', '--evidence', 'e'));
});

test('record --supersedes keeps the old record, marked', () => {
  const p = run('project-create', '--topic', 'rust');
  const { record: old } = run('record', p.id, '--kind', 'insight', '--text', 'Borrowing is copying', '--evidence', 'said so');
  const { record: next } = run('record', p.id, '--kind', 'insight', '--text', 'Borrowing is a checked reference', '--evidence', 'used it right', '--supersedes', old.id);
  const got = run('project-get', p.id);
  assert.equal(got.records.length, 2);
  assert.equal(got.records.find((/** @type {any} */ r) => r.id === old.id).supersededBy, next.id);
  assert.equal(next.supersedes, old.id);
  assert.throws(() => run('record', p.id, '--kind', 'insight', '--text', 't', '--evidence', 'e', '--supersedes', 'missing'));
});

// --- HTML lessons ---

const LESSON_BODY = `<h1>Rupture brutale em uma fórmula</h1>
<p>A « rupture brutale » (término abrupto) pune a falta de aviso, não o término.</p>
<fieldset class="quiz" id="q1" data-answer="b">
  <legend>O que a lei pune?</legend>
  <button type="button" value="a" data-why="Terminar é livre.">O término da relação</button>
  <button type="button" value="b" data-why="Isso: o aviso curto demais.">A falta de aviso suficiente</button>
  <details><summary>Resposta</summary><p>b: a falta de aviso suficiente.</p></details>
</fieldset>
<p>Fonte primária: <a href="https://www.legifrance.gouv.fr/">Code de commerce, L442-1 II</a></p>`;

test('lesson-write writes one self-contained HTML file with inlined CSS and JS', () => {
  const p = run('project-create', '--topic', 'Rupture brutale', '--language', 'pt-BR', '--term-language', 'fr');
  const res = runWithStdin(LESSON_BODY, 'lesson-write', p.id, '--title', 'Rupture brutale in one formula', '--no-open');
  assert.equal(res.file, join(dir, 'lessons', 'rupture-brutale', '0001-rupture-brutale-in-one-formula.html'));
  const html = readFileSync(res.file, 'utf8');
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<style>[\s\S]+<\/style>/);
  assert.match(html, /<script>[\s\S]*fieldset\.quiz[\s\S]*<\/script>/);
  assert.match(html, /<details>/);
  assert.doesNotMatch(html, /<(script|link|img|iframe)\b[^>]*\b(src|href)="(?!data:)/i, 'no external or relative resources');
  assert.doesNotMatch(html, /@import|url\(/i);
  const got = run('project-get', p.id);
  assert.equal(got.lessons.length, 1);
  assert.equal(got.lessons[0].title, 'Rupture brutale in one formula');
  assert.equal(got.lessons[0].file, res.file);
});

test('lesson-write regenerates an index.html that links every lesson', () => {
  const p = run('project-create', '--topic', 'Rupture brutale', '--mission', 'Discovery calls');
  runWithStdin(LESSON_BODY, 'lesson-write', p.id, '--title', 'One formula', '--no-open');
  const second = runWithStdin(LESSON_BODY, 'lesson-write', p.id, '--title', 'Two gates', '--no-open');
  assert.match(second.file, /0002-two-gates\.html$/);
  const index = readFileSync(second.index, 'utf8');
  assert.match(index, /href="0001-one-formula\.html"/);
  assert.match(index, /href="0002-two-gates\.html"/);
  assert.match(index, /Discovery calls/);
});

test('lesson-write refuses a quiz without a <details> fallback', () => {
  const p = run('project-create', '--topic', 't');
  const body = '<fieldset class="quiz" data-answer="a"><legend>q</legend><button type="button" value="a">a</button></fieldset>';
  assert.throws(() => runWithStdin(body, 'lesson-write', p.id, '--title', 'x', '--no-open'));
});

test('lesson-write refuses a <head> or external resources in the body', () => {
  const p = run('project-create', '--topic', 't');
  assert.throws(() => runWithStdin('<head><title>x</title></head><p>hi</p>', 'lesson-write', p.id, '--title', 'x', '--no-open'));
  assert.throws(() => runWithStdin('<img src="https://example.com/a.png">', 'lesson-write', p.id, '--title', 'x', '--no-open'));
  assert.throws(() => runWithStdin('', 'lesson-write', p.id, '--title', 'x', '--no-open'));
});

// --- Grill ---

test('grill-targets returns open misconceptions and weak cards for a project', () => {
  const p = run('project-create', '--topic', 'Rupture brutale', '--language', 'fr');
  const other = run('project-create', '--topic', 'Chess');
  const { record: old } = run('record', p.id, '--kind', 'misconception', '--text', 'old wrong', '--evidence', 'e', '--front', 'f1', '--back', 'b1');
  run('record', p.id, '--kind', 'insight', '--text', 'fixed', '--evidence', 'e', '--supersedes', old.id);
  const { record: open, card } = run('record', p.id, '--kind', 'misconception', '--text', 'still wrong', '--evidence', 'e', '--front', 'f2', '--back', 'b2');
  run('add', '--front', 'fine', '--back', 'x', '--tags', `project:${p.id}`);
  run('record', other.id, '--kind', 'misconception', '--text', 'chess wrong', '--evidence', 'e', '--front', 'f3', '--back', 'b3');
  const t = run('grill-targets', 'rupture');
  assert.equal(t.projectId, p.id);
  assert.equal(t.language, 'fr');
  assert.deepEqual(t.misconceptions.map((/** @type {any} */ r) => r.id), [open.id]);
  assert.deepEqual(t.weakCards.map((/** @type {any} */ c) => c.id), [card.id], 'open misconception cards and lapsed cards only');
  assert.ok(t.weakCards.every((/** @type {any} */ c) => c.back === undefined), 'backs stay hidden');
});

test('grill-targets reports an unknown or ambiguous target', () => {
  run('project-create', '--topic', 'Rust ownership');
  run('project-create', '--topic', 'Rust lifetimes');
  assert.throws(() => run('grill-targets', 'haskell'));
  assert.equal(run('grill-targets', 'rust').ambiguous, true);
});

// --- Glossary ---

test('glossary-add only takes a term after correct use (evidence required)', () => {
  const p = run('project-create', '--topic', 'Rupture brutale');
  assert.throws(() => run('glossary-add', p.id, '--term', 'préavis', '--translation', 'aviso prévio', '--definition', 'd'));
  assert.throws(() => run('glossary-add', 'nope', '--term', 't', '--translation', 't', '--definition', 'd', '--evidence', 'e'));
  const { entry } = run('glossary-add', p.id, '--term', 'préavis', '--translation', 'aviso prévio', '--definition', 'Tempo entre o anúncio e o fim.', '--avoid', 'pré-aviso,notice', '--evidence', 'Used it right in quiz 2');
  assert.deepEqual(entry.avoid, ['pré-aviso', 'notice']);
  assert.equal(run('project-get', p.id).glossary.length, 1);
});

test('glossary-add updates a term instead of duplicating it', () => {
  const p = run('project-create', '--topic', 'Rupture brutale');
  run('glossary-add', p.id, '--term', 'Préavis', '--translation', 'aviso', '--definition', 'old', '--evidence', 'e');
  run('glossary-add', p.id, '--term', 'preavis', '--translation', 'aviso prévio', '--definition', 'new', '--evidence', 'e');
  const { glossary } = run('project-get', p.id);
  assert.equal(glossary.length, 1);
  assert.equal(glossary[0].definition, 'new');
});

test('glossary-add renders the project glossary and a derived global index in both languages', () => {
  const rb = run('project-create', '--topic', 'Rupture brutale', '--language', 'pt-BR');
  const chess = run('project-create', '--topic', 'Chess');
  const res = run('glossary-add', rb.id, '--term', 'rupture brutale', '--translation', 'término abrupto', '--definition', 'd', '--avoid', 'ruptura brutal', '--evidence', 'e');
  run('glossary-add', chess.id, '--term', 'zugzwang', '--translation', 'compulsion to move', '--definition', 'd', '--evidence', 'e');
  const page = readFileSync(res.file, 'utf8');
  assert.match(page, /rupture brutale/);
  assert.match(page, /término abrupto/);
  assert.match(page, /ruptura brutal/);
  const global = readFileSync(join(dir, 'glossary.html'), 'utf8');
  assert.match(global, /rupture brutale/);
  assert.match(global, /zugzwang/);
  assert.ok(existsSync(join(dir, 'lessons', 'rupture-brutale', 'index.html')));
  assert.match(readFileSync(join(dir, 'lessons', 'rupture-brutale', 'index.html'), 'utf8'), /href="glossary\.html"/);
});
