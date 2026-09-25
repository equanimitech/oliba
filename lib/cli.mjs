#!/usr/bin/env node
// @ts-check
/**
 * lull-n-learn CLI. Skills call this as:
 *   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" <subcommand> [args]
 * Every command prints JSON to stdout; errors go to stderr, exit code 1.
 */
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { newCardState, review } from './fsrs.mjs';
import { readCards, writeCards, readInbox, writeInbox, readProjects, writeProjects, readCue, clearCue, writeStudyLock, clearStudyLock, readConfig, writeConfigKey, claudeSettingsPath, writeStatusLineShim } from './store.mjs';

/** @typedef {import('./fsrs.mjs').FsrsState} FsrsState */
/** @typedef {import('./fsrs.mjs').Rating} Rating */

/**
 * @typedef {Object} Card
 * @property {string} id
 * @property {string} front
 * @property {string} back
 * @property {string[]} tags
 * @property {'session' | 'manual' | 'workflow'} source
 * @property {string | null} ref URL back to study guide section
 * @property {string} createdAt ISO8601
 * @property {FsrsState} fsrs
 */

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
 * @param {{ front: string, back: string, tags: string[], source: Card['source'], ref?: string | null }} input
 * @param {Date} [now]
 * @returns {Card}
 */
const makeCard = ({ front, back, tags, source, ref }, now = new Date()) => ({
  id: randomUUID(),
  front,
  back,
  tags,
  source,
  ref: ref ?? null,
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

/** Case- and accent-insensitive form for fuzzy matching. @param {string} s */
const fold = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

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
 * Compute a trace-aware sort score for a card. Higher = higher priority.
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

// --- Card commands ---

/** @param {string[]} argv */
function cmdAdd(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      front: { type: 'string' },
      back: { type: 'string' },
      tags: { type: 'string' },
      source: { type: 'string' },
      ref: { type: 'string' },
    },
  });
  if (!values.front || !values.back) fail('add requires --front and --back');
  const card = makeCard({
    front: values.front,
    back: values.back,
    tags: parseTags(values.tags),
    source: /** @type {Card['source']} */ (values.source ?? 'manual'),
    ref: values.ref ?? null,
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
    options: {
      limit: { type: 'string' },
      'hide-back': { type: 'boolean' },
      tag: { type: 'string' },
    },
  });
  const limit = values.limit ? Number(values.limit) : Infinity;
  const now = new Date();
  const allCards = readCards();
  const projects = readProjects();
  let cards = dueCards(allCards, now);
  if (values.tag) {
    const filter = values.tag;
    /** @param {string} t */
    const tagMatches = (t) => t === filter || t.startsWith(`${filter}:`);
    const isTag = Object.values(allCards).some((c) => c.tags.some(tagMatches));
    if (isTag) {
      cards = cards.filter((c) => c.tags.some(tagMatches));
    } else {
      // Not a tag: resolve against project topics, e.g. "code de la route".
      const matches = Object.values(projects)
        .filter((/** @type {any} */ p) => fold(p.topic ?? '').includes(fold(filter)))
        .map((/** @type {any} */ p) => ({ id: p.id, topic: p.topic }));
      if (matches.length > 1) return out({ ambiguous: true, projects: matches });
      const projectTag = matches.length === 1 ? `project:${matches[0].id}` : null;
      cards = cards.filter((c) => projectTag !== null && c.tags.includes(projectTag));
    }
  }

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

/** @param {string[]} argv */
function cmdReveal(argv) {
  const [id] = argv;
  if (!id) fail('usage: reveal <cardId>');
  const cards = readCards();
  const card = cards[id];
  if (!card) fail(`no card with id ${id}`);
  out({ id: card.id, back: card.back, ref: card.ref });
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

// --- Inbox commands ---

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

// --- Project commands ---

const MASTERED_STABILITY = 21;

/**
 * Compute dynamic node statuses from linked card FSRS state.
 * Mutates nodes in place for convenience (caller owns the object).
 * @param {any} project
 * @param {Record<string, Card>} cards
 */
function computeNodeStatuses(project, cards) {
  for (const node of project.nodes) {
    const cardIds = node.cardIds ?? [];
    if (cardIds.length === 0) continue;
    const linkedCards = cardIds
      .map((/** @type {string} */ id) => cards[id])
      .filter(Boolean);
    if (linkedCards.length === 0) continue;
    const allMastered = linkedCards.every(
      (/** @type {Card} */ c) => c.fsrs.stability >= MASTERED_STABILITY,
    );
    if (allMastered) {
      node.status = 'mastered';
    } else {
      const anyReviewed = linkedCards.some(
        (/** @type {Card} */ c) => c.fsrs.reps > 0,
      );
      if (anyReviewed) {
        node.status = 'learning';
      }
    }
  }
}

/** @param {string[]} argv */
function cmdProjectCreate(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      topic: { type: 'string' },
      sources: { type: 'string' },
    },
  });
  if (!values.topic) fail('project-create requires --topic');
  /** @type {any} */
  const project = {
    id: randomUUID(),
    topic: values.topic,
    createdAt: new Date().toISOString(),
    artifactUrl: null,
    sources: values.sources ? values.sources.split(',').map((s) => s.trim()).filter(Boolean) : [],
    nodes: [],
    edges: [],
  };
  const projects = readProjects();
  projects[project.id] = project;
  writeProjects(projects);
  out(project);
}

function cmdProjectList() {
  const projects = readProjects();
  const summaries = Object.values(projects).map(
    (/** @type {any} */ p) => ({
      id: p.id,
      topic: p.topic,
      createdAt: p.createdAt,
      artifactUrl: p.artifactUrl,
      nodeCount: p.nodes.length,
    }),
  );
  out(summaries.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')));
}

/** @param {string[]} argv */
function cmdProjectGet(argv) {
  const [id] = argv;
  if (!id) fail('usage: project-get <id>');
  const projects = readProjects();
  const project = projects[id];
  if (!project) fail(`no project with id ${id}`);
  computeNodeStatuses(project, readCards());
  out(project);
}

/** @param {string[]} argv */
function cmdProjectUpdate(argv) {
  const [id] = argv;
  if (!id) fail('usage: project-update <id> (reads JSON from stdin)');
  const projects = readProjects();
  if (!projects[id]) fail(`no project with id ${id}`);
  let input = '';
  try {
    input = readFileSync(0, 'utf8');
  } catch {
    fail('project-update requires JSON on stdin');
  }
  /** @type {any} */
  let updated;
  try {
    updated = JSON.parse(input);
  } catch {
    fail('invalid JSON on stdin');
  }
  // Merge: fields the caller doesn't send (topic, createdAt, ...) survive.
  const merged = { ...projects[id], ...updated, id };
  projects[id] = merged;
  writeProjects(projects);
  out(merged);
}

/** @param {string[]} argv */
function cmdProjectAddCards(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { cards: { type: 'string' } },
    allowPositionals: true,
  });
  const [projectId, nodeId] = positionals;
  if (!projectId || !nodeId || !values.cards) {
    fail('usage: project-add-cards <projectId> <nodeId> --cards id1,id2');
  }
  const cardIds = values.cards.split(',').map((s) => s.trim()).filter(Boolean);
  const projects = readProjects();
  const project = projects[projectId];
  if (!project) fail(`no project with id ${projectId}`);
  const node = project.nodes.find((/** @type {any} */ n) => n.id === nodeId);
  if (!node) fail(`no node with id ${nodeId} in project ${projectId}`);
  node.cardIds ??= [];
  for (const cid of cardIds) {
    if (!node.cardIds.includes(cid)) {
      node.cardIds.push(cid);
    }
  }
  writeProjects(projects);
  computeNodeStatuses(project, readCards());
  out(project);
}

/**
 * Persist a /deep-lesson workflow result in one write per collection:
 * create or load the project, merge the map, create cards with the
 * canonical `project:<id>` tag, link them to their nodes.
 * stdin: the workflow result `{ map: { nodes, edges }, deepened: [...] }`.
 * @param {string[]} argv
 */
function cmdLessonSave(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: 'string' },
      topic: { type: 'string' },
      sources: { type: 'string' },
    },
  });
  if (!values.project && !values.topic) fail('lesson-save requires --project <id> or --topic "<topic>"');
  /** @type {any} */
  let result;
  try {
    result = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    fail('lesson-save requires the workflow result JSON on stdin');
  }
  if (!result?.map?.nodes) fail('workflow result has no map.nodes');

  const projects = readProjects();
  const now = new Date();
  const existing = values.project ? projects[values.project] : null;
  if (values.project && !existing) fail(`no project with id ${values.project}`);
  const id = existing?.id ?? randomUUID();
  const base = existing ?? {
    id,
    topic: values.topic,
    createdAt: now.toISOString(),
    artifactUrl: null,
    sources: parseTags(values.sources),
    nodes: [],
    edges: [],
  };

  const cards = readCards();
  const deepenedById = new Map((result.deepened ?? []).map((/** @type {any} */ d) => [d.nodeId, d]));
  const oldNodes = new Map(base.nodes.map((/** @type {any} */ n) => [n.id, n]));
  // Keep old nodes the new map dropped (they may carry cards), then overlay the map.
  const mapIds = new Set(result.map.nodes.map((/** @type {any} */ n) => n.id));
  const nodes = [
    ...base.nodes.filter((/** @type {any} */ n) => !mapIds.has(n.id)),
    ...result.map.nodes.map((/** @type {any} */ n) => {
      const old = oldNodes.get(n.id) ?? {};
      const d = deepenedById.get(n.id);
      const newCards = (d?.cards ?? []).map((/** @type {any} */ c) =>
        makeCard({
          front: c.front,
          back: c.back,
          tags: [...new Set([`project:${id}`, `node:${n.id}`, ...(c.tags ?? []).filter((/** @type {string} */ t) => !t.startsWith('project:'))])],
          source: 'workflow',
          ref: base.artifactUrl ? `${base.artifactUrl}#${n.id}` : null,
        }, now),
      );
      for (const card of newCards) cards[card.id] = card;
      return {
        ...old,
        ...n,
        status: d ? 'deepened' : (old.status ?? 'mapped'),
        cardIds: [...(old.cardIds ?? []), ...newCards.map((c) => c.id)],
        ...(d ? { research: d.research, guide: d.guide } : {}),
      };
    }),
  ];
  const project = {
    ...base,
    nodes,
    edges: result.map.edges ?? base.edges,
    ...(result.map.suggestedStart ? { suggestedStart: result.map.suggestedStart } : {}),
  };

  writeCards(cards);
  projects[id] = project;
  writeProjects(projects);
  out({
    projectId: id,
    created: !existing,
    nodeCount: nodes.length,
    cardCount: nodes.reduce((sum, n) => sum + n.cardIds.length, 0),
    cardsAdded: [...deepenedById.values()].reduce((sum, d) => sum + (d.cards?.length ?? 0), 0),
  });
}

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

// --- Cue command ---

function cmdCurrentCue() {
  const cue = readCue();
  if (!cue) fail('no active cue');
  const cards = readCards();
  const card = cards[cue.cardId];
  if (!card) fail('cue card no longer exists');
  out({ ...card, cueTs: cue.ts });
}

// --- Study lock commands ---

function cmdStudyLock() {
  writeStudyLock();
  out({ locked: true });
}

function cmdStudyUnlock() {
  clearStudyLock();
  out({ locked: false });
}

// --- Cue management ---

function cmdClearCue() {
  clearCue();
  out({ cleared: true });
}

// --- Config commands ---

function cmdConfigGet() {
  out(readConfig());
}

/** @param {string[]} argv */
function cmdConfigSet(argv) {
  const [key, ...valueParts] = argv;
  if (!key || valueParts.length === 0) fail('usage: config-set <key> <value>');
  const raw = valueParts.join(' ');

  let value;
  if (raw === 'true') value = true;
  else if (raw === 'false') value = false;
  else if (/^\d+$/.test(raw)) value = Number(raw);
  else if (raw.includes(',')) value = raw.split(',').map((s) => s.trim()).filter(Boolean);
  else value = raw;

  writeConfigKey(key, value);
  out({ [key]: value });
}

// --- Status line setup ---

/**
 * Point Claude Code's statusLine at the stable shim, keeping the user's
 * previous status line (it runs first, the cue is appended). Backs up
 * settings.json, writes atomically, touches only the statusLine key.
 */
function cmdStatuslineInstall() {
  const path = claudeSettingsPath();
  /** @type {string | null} */
  let raw = null;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (/** @type {any} */ (err).code !== 'ENOENT') fail(`cannot read ${path}`);
  }
  /** @type {any} */
  let settings = {};
  if (raw !== null) {
    try {
      settings = JSON.parse(raw);
    } catch {
      fail(`${path} is not valid JSON; left untouched`);
    }
  }
  const shim = writeStatusLineShim();
  const command = `"${process.execPath}" "${shim}"`;
  const previous = settings.statusLine?.command;
  // An older lull-n-learn status line is replaced, not composed (no double cue).
  const isOurs = typeof previous === 'string' && (previous.includes(shim) || /lull-n-learn.*statusline\.mjs/.test(previous));
  if (typeof previous === 'string' && !isOurs) writeConfigKey('statusLinePrevious', previous);

  mkdirSync(dirname(path), { recursive: true });
  const backup = raw !== null ? `${path}.lull-n-learn.bak` : null;
  if (backup) writeFileSync(backup, raw ?? '');
  const next = { ...settings, statusLine: { ...settings.statusLine, type: 'command', command } };
  writeFileSync(`${path}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
  writeConfigKey('statusLineOffered', true);
  out({ installed: true, command, kept: isOurs ? null : (previous ?? null), backup });
}

// --- Dispatch ---

/** @type {Record<string, (argv: string[]) => void>} */
const commands = {
  add: cmdAdd,
  due: cmdDue,
  rate: cmdRate,
  reveal: cmdReveal,
  list: cmdList,
  'inbox-add': cmdInboxAdd,
  'inbox-list': cmdInboxList,
  'inbox-promote': cmdInboxPromote,
  'inbox-dismiss': cmdInboxDismiss,
  'project-create': cmdProjectCreate,
  'project-list': cmdProjectList,
  'project-get': cmdProjectGet,
  'project-update': cmdProjectUpdate,
  'project-add-cards': cmdProjectAddCards,
  'lesson-save': cmdLessonSave,
  'read-trace': cmdReadTrace,
  'current-cue': cmdCurrentCue,
  'study-lock': cmdStudyLock,
  'study-unlock': cmdStudyUnlock,
  'clear-cue': cmdClearCue,
  'config-get': cmdConfigGet,
  'config-set': cmdConfigSet,
  'statusline-install': cmdStatuslineInstall,
};

const [cmd, ...rest] = process.argv.slice(2);
const handler = cmd ? commands[cmd] : undefined;
if (!handler) fail(`usage: cli.mjs <${Object.keys(commands).join('|')}> [args]`);
handler(rest);
