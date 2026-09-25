#!/usr/bin/env node
// @ts-check
/**
 * oliba CLI. Skills call this as:
 *   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" <subcommand> [args]
 * Every command prints JSON to stdout; errors go to stderr, exit code 1.
 */
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { newCardState, review } from './fsrs.mjs';
import { readCards, writeCards, readProjects, writeProjects, readCue, clearCue, writeStudyLock, clearStudyLock, readConfig, writeConfigKey, claudeSettingsPath, writeStatusLineShim, writeClaudeSettings, migrateDataDir, dataDir } from './store.mjs';

/** @typedef {import('./fsrs.mjs').FsrsState} FsrsState */
/** @typedef {import('./fsrs.mjs').Rating} Rating */

/**
 * @typedef {Object} Card
 * @property {string} id
 * @property {string} front
 * @property {string} back
 * @property {string[]} tags
 * @property {'session' | 'manual' | 'workflow' | 'teach'} source
 * @property {string | null} ref URL back to study guide section
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

/**
 * Resolve a /study filter: a card tag (exact or `tag:` prefix) first, then a
 * project topic (case- and accent-insensitive substring), else null.
 * @param {string} filter
 * @param {Record<string, Card>} cards
 * @param {Record<string, any>} projects
 * @returns {{ kind: 'tag', test: (t: string) => boolean } | { kind: 'project', id: string } | { kind: 'ambiguous', projects: { id: string, topic: string }[] } | null}
 */
const resolveFilter = (filter, cards, projects) => {
  /** @param {string} t */
  const test = (t) => t === filter || t.startsWith(`${filter}:`);
  if (Object.values(cards).some((c) => c.tags.some(test))) return { kind: 'tag', test };
  const matches = Object.values(projects)
    .filter((p) => fold(p.topic ?? '').includes(fold(filter)))
    .map((p) => ({ id: p.id, topic: p.topic }));
  if (matches.length > 1) return { kind: 'ambiguous', projects: matches };
  return matches.length === 1 ? { kind: 'project', id: matches[0].id } : null;
};

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
    const match = resolveFilter(values.tag, allCards, projects);
    if (match?.kind === 'ambiguous') return out({ ambiguous: true, projects: match.projects });
    cards = cards.filter((c) =>
      match?.kind === 'tag' ? c.tags.some(match.test)
        : match?.kind === 'project' ? c.tags.includes(`project:${match.id}`)
          : false);
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

/** Mission and languages: asked once per project, set together. */
const PROJECT_SETTINGS = /** @type {const} */ ({
  mission: { type: 'string' },
  language: { type: 'string' },
  'term-language': { type: 'string' },
});

/** @param {string[]} argv */
function cmdProjectSet(argv) {
  const { values, positionals } = parseArgs({ args: argv, options: PROJECT_SETTINGS, allowPositionals: true });
  const [id] = positionals;
  if (!id) fail('usage: project-set <id> [--mission "<why>"] [--language <code>] [--term-language <code>]');
  const changes = Object.fromEntries(
    Object.entries({ mission: values.mission, language: values.language, termLanguage: values['term-language'] })
      .filter(([, v]) => v !== undefined),
  );
  if (Object.keys(changes).length === 0) fail('project-set needs --mission, --language or --term-language');
  const projects = readProjects();
  if (!projects[id]) fail(`no project with id ${id}`);
  projects[id] = { ...projects[id], ...changes };
  writeProjects(projects);
  out(projects[id]);
}

// --- Learning records ---

const RECORD_KINDS = ['prior', 'misconception', 'insight', 'mission-shift'];

/**
 * Append an evidence-gated learning record. Superseding marks the old record
 * instead of deleting it. A misconception also becomes one contrast card.
 * @param {string[]} argv
 */
function cmdRecord(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      kind: { type: 'string' },
      text: { type: 'string' },
      evidence: { type: 'string' },
      node: { type: 'string' },
      lesson: { type: 'string' },
      supersedes: { type: 'string' },
      front: { type: 'string' },
      back: { type: 'string' },
    },
    allowPositionals: true,
  });
  const [projectId] = positionals;
  if (!projectId || !values.kind || !values.text) {
    fail('usage: record <projectId> --kind prior|misconception|insight|mission-shift --text "..." --evidence "..." [--node <id>|--lesson <n>] [--supersedes <recordId>] [--front "..." --back "..."]');
  }
  if (!RECORD_KINDS.includes(values.kind)) fail(`--kind must be one of: ${RECORD_KINDS.join(', ')}`);
  if (!values.evidence?.trim()) fail('record needs --evidence: a correct use, a stated prior, or a corrected belief. Coverage is not evidence.');
  const isMisconception = values.kind === 'misconception';
  if (isMisconception && (!values.front || !values.back)) fail('a misconception needs --front and --back for its contrast card');
  const projects = readProjects();
  const project = projects[projectId];
  if (!project) fail(`no project with id ${projectId}`);
  const records = project.records ?? [];
  const old = values.supersedes ? records.find((/** @type {any} */ r) => r.id === values.supersedes) : null;
  if (values.supersedes && !old) fail(`no record with id ${values.supersedes}`);

  const card = isMisconception
    ? makeCard({
      front: /** @type {string} */ (values.front),
      back: /** @type {string} */ (values.back),
      tags: [`project:${projectId}`, 'misconception', ...(values.node ? [`node:${values.node}`] : []), ...(values.lesson ? [`lesson:${values.lesson}`] : [])],
      source: 'teach',
    })
    : null;
  const record = {
    id: randomUUID(),
    kind: values.kind,
    text: values.text,
    evidence: values.evidence,
    node: values.node ?? null,
    lesson: values.lesson ?? null,
    cardId: card?.id ?? null,
    supersedes: old?.id ?? null,
    supersededBy: null,
    createdAt: new Date().toISOString(),
  };
  project.records = [...records.map((/** @type {any} */ r) => (r === old ? { ...r, supersededBy: record.id } : r)), record];
  if (card) {
    const cards = readCards();
    cards[card.id] = card;
    writeCards(cards);
  }
  writeProjects(projects);
  out(card ? { record, card } : { record });
}

/** @param {string[]} argv */
function cmdProjectCreate(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      topic: { type: 'string' },
      sources: { type: 'string' },
      ...PROJECT_SETTINGS,
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
    mission: values.mission ?? null,
    language: values.language ?? null,
    termLanguage: values['term-language'] ?? null,
    records: [],
    lessons: [],
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
 * Persist a /syllabus workflow result in one write per collection:
 * create or load the project, merge the map, create cards with the
 * canonical `project:<id>` tag, link them to their nodes.
 * stdin: the workflow result `{ map: { nodes: [{ ..., starterCards? }], edges }, deepened: [...] }`.
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
    ...result.map.nodes.map((/** @type {any} */ { starterCards = [], ...n }) => {
      const old = oldNodes.get(n.id) ?? {};
      const d = deepenedById.get(n.id);
      const newCards = [...starterCards, ...(d?.cards ?? [])].map((/** @type {any} */ c) =>
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
    cardsAdded: result.map.nodes.reduce((/** @type {number} */ sum, /** @type {any} */ n) => sum + (n.starterCards?.length ?? 0), 0)
      + [...deepenedById.values()].reduce((sum, d) => sum + (d.cards?.length ?? 0), 0),
  });
}

// --- HTML lessons ---

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

/** @param {string} s */
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** @param {string} s */
const slugify = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'untitled';

/**
 * The one page template. Lessons, the index and the glossary all go through it,
 * with the stylesheet and quiz script inlined so each file stands alone.
 * @param {{ title: string, lang?: string | null, body: string }} page
 */
const renderPage = ({ title, lang, body }) => `<!doctype html>
<html lang="${escapeHtml(lang || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="oliba">
<link rel="icon" href="data:,">
<title>${escapeHtml(title)}</title>
<style>
${readFileSync(join(ASSETS, 'oliba.css'), 'utf8')}</style>
</head>
<body>
<main>
${body}
</main>
<script>
${readFileSync(join(ASSETS, 'quiz.js'), 'utf8')}</script>
</body>
</html>
`;

/** @param {any} project */
const lessonDir = (project) => join(dataDir(), 'lessons', project.slug);

/**
 * Regenerate the project's local index: a link to every lesson, no counts.
 * @param {any} project
 */
const writeLessonIndex = (project) => {
  const items = (project.lessons ?? [])
    .map((/** @type {any} */ l) => `  <li><a href="${escapeHtml(l.file.split('/').pop())}">${escapeHtml(l.title)}</a></li>`)
    .join('\n');
  const body = [
    `<h1>${escapeHtml(project.topic)}</h1>`,
    project.mission ? `<p class="mission">${escapeHtml(project.mission)}</p>` : '',
    `<ol class="lessons">\n${items}\n</ol>`,
    project.glossary?.length ? '<p><a href="glossary.html">Glossary</a></p>' : '',
  ].filter(Boolean).join('\n');
  const file = join(lessonDir(project), 'index.html');
  writeFileSync(file, renderPage({ title: project.topic, lang: project.language, body }));
  return file;
};

/** Open a file in the default browser; silently skip where there is no opener. @param {string} file */
const openFile = (file) => {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  try {
    spawn(opener, [file], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch { /* the path is printed either way */ }
};

/**
 * Wrap a lesson body (HTML fragment on stdin) in the page template and file it
 * under the project's lesson folder.
 * @param {string[]} argv
 */
function cmdLessonWrite(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { title: { type: 'string' }, 'no-open': { type: 'boolean' } },
    allowPositionals: true,
  });
  const [projectId] = positionals;
  if (!projectId || !values.title) fail('usage: lesson-write <projectId> --title "<title>" [--no-open] < body.html');
  let body = '';
  try {
    body = readFileSync(0, 'utf8').trim();
  } catch { /* empty stdin */ }
  if (!body) fail('lesson-write needs the lesson body (an HTML fragment) on stdin');
  if (/<(!doctype|html|head|body|style)\b/i.test(body)) fail('the lesson body is a fragment: no <html>, <head>, <body> or <style>; the template adds them');
  if (/<(link|img|iframe|video|audio|source|object|embed)\b[^>]*\b(src|href|srcset|data)\s*=\s*["']?(?!data:)/i.test(body)) {
    fail('the lesson must stand alone: no fetched or relative resources (links in <a> are fine; draw diagrams as inline SVG or data: URIs)');
  }
  if (/<script\b/i.test(body)) fail('the lesson body carries no <script>; quiz.js is inlined by the template');
  for (const chunk of body.split(/<fieldset\b/i).slice(1)) {
    const quiz = chunk.split(/<\/fieldset>/i)[0];
    if (/class\s*=\s*["'][^"']*\bquiz\b/.test(quiz) && !/<details\b/i.test(quiz)) {
      fail('every <fieldset class="quiz"> needs a <details> answer, so it works where JS is stripped');
    }
  }

  const projects = readProjects();
  const project = projects[projectId];
  if (!project) fail(`no project with id ${projectId}`);
  project.slug ??= slugify(project.topic ?? projectId);
  const lessons = project.lessons ?? [];
  const n = lessons.length + 1;
  mkdirSync(lessonDir(project), { recursive: true });
  const file = join(lessonDir(project), `${String(n).padStart(4, '0')}-${slugify(values.title)}.html`);
  writeFileSync(file, renderPage({ title: values.title, lang: project.language, body }));
  const lesson = { n, title: values.title, file, createdAt: new Date().toISOString() };
  project.lessons = [...lessons, lesson];
  const index = writeLessonIndex(project);
  writeProjects(projects);
  if (!values['no-open']) openFile(file);
  out({ file, index, lesson });
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

// --- /study entry point ---

/**
 * Decide what /study's arguments mean, in a fixed order:
 * grill → known tag/project → active cue (the text is the answer) → plain.
 * A tag that could also be a cue answer is a tie: mode "ask".
 * @param {string[]} argv
 */
function cmdStudyResolve(argv) {
  const text = argv.join(' ').trim();
  if (!text) return out({ mode: 'plain' });
  if (/^grill\b/i.test(text)) {
    return out({ mode: 'grill', target: text.replace(/^grill(\s+me)?(\s+on)?\s*/i, '') });
  }
  const cards = readCards();
  const filter = resolveFilter(text, cards, readProjects());
  const cue = readCue();
  const cueCardId = cue && cards[cue.cardId] ? cue.cardId : null;
  if (filter && cueCardId) return out({ mode: 'ask', tag: text, cueCardId });
  if (filter) return out({ mode: 'filter', tag: text });
  if (cueCardId) return out({ mode: 'cue', cardId: cueCardId, answer: text });
  return out({ mode: 'plain', unmatched: text });
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
  // An older oliba (or pre-rename lull-n-learn) status line is replaced, not composed (no double cue).
  const isOurs = typeof previous === 'string' && (previous.includes(shim) || /(oliba|lull-n-learn).*statusline\.mjs/.test(previous));
  if (typeof previous === 'string' && !isOurs) writeConfigKey('statusLinePrevious', previous);

  const backup = writeClaudeSettings(raw, { ...settings, statusLine: { ...settings.statusLine, type: 'command', command } });
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
  'project-create': cmdProjectCreate,
  'project-list': cmdProjectList,
  'project-get': cmdProjectGet,
  'project-update': cmdProjectUpdate,
  'project-set': cmdProjectSet,
  record: cmdRecord,
  'project-add-cards': cmdProjectAddCards,
  'lesson-save': cmdLessonSave,
  'lesson-write': cmdLessonWrite,
  'read-trace': cmdReadTrace,
  'current-cue': cmdCurrentCue,
  'study-resolve': cmdStudyResolve,
  'study-lock': cmdStudyLock,
  'study-unlock': cmdStudyUnlock,
  'clear-cue': cmdClearCue,
  'config-get': cmdConfigGet,
  'config-set': cmdConfigSet,
  'statusline-install': cmdStatuslineInstall,
};

migrateDataDir();
const [cmd, ...rest] = process.argv.slice(2);
const handler = cmd ? commands[cmd] : undefined;
if (!handler) fail(`usage: cli.mjs <${Object.keys(commands).join('|')}> [args]`);
handler(rest);
