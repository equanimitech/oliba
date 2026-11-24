// @ts-check
/**
 * Writing pages: the template, ~/.oliba/index.html (the desk: every project
 * under its tags, the archived ones folded away) and each project's page
 * (mission, lessons, map with cards, sources). Pages are for reading and
 * practice; changes go through the conversation and the CLI. The CLI and the
 * SessionStart hook (rebuilding after an upgrade) both call these.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml, fold, slugify } from './text.mjs';
import { dataDir, readCards } from './store.mjs';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

/**
 * The one page template. Lessons, the indexes and the glossary all go
 * through it, with the stylesheet and scripts inlined so each file stands alone.
 * @param {{ title: string, lang?: string | null, body: string, data?: Record<string, string>, scripts?: string[] }} page
 */
export const renderPage = ({ title, lang, body, data = {}, scripts = ['quiz.js'] }) => `<!doctype html>
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
<main${Object.entries(data).map(([k, v]) => ` data-${k}="${escapeHtml(v)}"`).join('')}>
${body}
</main>
${scripts.map((name) => `<script>\n${readFileSync(join(ASSETS, name), 'utf8')}</script>\n`).join('')}</body>
</html>
`;

const HOME = {
  pt: { lessons: 'Lições', guide: 'Guia de estudo', glossary: 'Glossário', archived: 'Arquivados', project: 'Mapa e fontes', map: 'Mapa', sources: 'Fontes' },
  fr: { lessons: 'Leçons', guide: 'Guide d’étude', glossary: 'Glossaire', archived: 'Archivés', project: 'Carte et sources', map: 'Carte', sources: 'Sources' },
  en: { lessons: 'Lessons', guide: 'Study guide', glossary: 'Glossary', archived: 'Archived', project: 'Map and sources', map: 'Map', sources: 'Sources' },
};

/** pt, fr or en, from a BCP 47 code. @param {string | null | undefined} lang */
export const homeLabels = (lang) => {
  const code = fold(lang ?? '');
  return code.startsWith('pt') ? HOME.pt : code.startsWith('fr') ? HOME.fr : HOME.en;
};

/**
 * The index speaks the language most projects are taught in.
 * @param {any[]} projects
 */
export const pageLanguage = (projects) => {
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (const p of projects) if (p.language) seen.set(p.language, (seen.get(p.language) ?? 0) + 1);
  return [...seen].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'en';
};

/**
 * The project's folder name under lessons/. Fixed on the project the first
 * time, so renaming the topic doesn't move its files.
 * @param {any} project
 */
export const projectSlug = (project) => (project.slug ??= slugify(project.topic ?? project.id));

/** The lesson's file name, without its folder. @param {any} l */
const lessonFile = (l) => String(l.file).split('/').pop();

/** @param {any} l @param {string} prefix path to the project folder, '' when already inside */
const lessonItem = (l, prefix) =>
  `  <li value="${Number(l.n) || ''}"><a href="${prefix}${escapeHtml(lessonFile(l))}">${escapeHtml(l.title)}</a></li>`;

/**
 * One project on the desk: topic, mission, its lessons linked straight to the
 * lesson files, then the project page; the external guide is a small aside.
 * Archived ones stay compact (no lesson list): they sit folded away.
 * @param {any} p @param {number} level heading level @param {typeof HOME.en} H
 * @param {boolean} [compact]
 */
const projectHtml = (p, level, H, compact = false) => {
  const e = escapeHtml;
  const base = `lessons/${e(projectSlug(p))}/`;
  const guide = /^https?:\/\//.test(p.artifactUrl ?? '') ? ` <a class="aside" href="${e(p.artifactUrl)}">${H.guide}</a>` : '';
  return [
    '<section class="project">',
    `<h${level}>${e(p.topic ?? p.id)}</h${level}>`,
    p.mission ? `<p class="mission">${e(p.mission)}</p>` : '',
    !compact && p.lessons?.length
      ? `<ol class="lessons" aria-label="${e(H.lessons)}">\n${p.lessons.map((/** @type {any} */ l) => lessonItem(l, base)).join('\n')}\n</ol>`
      : '',
    `<p class="links"><a href="${base}index.html">${H.project}</a>${guide}</p>`,
    '</section>',
  ].filter(Boolean).join('\n');
};

/**
 * The desk body: projects under each of their tags (a project with two tags
 * shows under both), untagged ones last with no heading, archived ones in a
 * closed <details>. A map, not a scoreboard: no counts, no dates (the archived
 * fold says how many it hides, nothing else).
 * @param {any[]} projects
 * @param {string} lang
 */
export const renderHome = (projects, lang) => {
  const H = homeLabels(lang);
  const all = [...projects].sort((a, b) => fold(a.topic ?? '').localeCompare(fold(b.topic ?? '')));
  const live = all.filter((p) => !p.archived);
  const archived = all.filter((p) => p.archived);
  /** @type {Map<string, string>} folded tag → first spelling */
  const tags = new Map();
  for (const p of live) for (const t of p.tags ?? []) if (!tags.has(fold(t))) tags.set(fold(t), t);
  const level = tags.size ? 3 : 2;
  const groups = [...tags].sort((a, b) => a[0].localeCompare(b[0])).map(([key, name]) => [
    `<h2 class="tag">${escapeHtml(name)}</h2>`,
    ...live.filter((p) => (p.tags ?? []).some((/** @type {string} */ t) => fold(t) === key)).map((p) => projectHtml(p, level, H)),
  ].join('\n'));
  const untagged = live.filter((p) => !p.tags?.length).map((p) => projectHtml(p, level, H));
  return [
    '<h1>òliba</h1>',
    ...groups,
    ...untagged,
    all.some((p) => p.glossary?.length) ? `<p class="ask"><a href="glossary.html">${H.glossary}</a></p>` : '',
    archived.length ? `<details class="archived">\n<summary>${H.archived} (${archived.length})</summary>\n${archived.map((p) => projectHtml(p, 3, H, true)).join('\n')}\n</details>` : '',
  ].filter(Boolean).join('\n');
};

/**
 * A source as a link: http(s) as is, an absolute local path as file://,
 * anything else (a title, a book) as plain text.
 * @param {string} src
 */
export const sourceHtml = (src) => {
  const text = String(src);
  const e = escapeHtml;
  if (/^https?:\/\//i.test(text)) return `<a href="${e(text)}">${e(text)}</a>`;
  if (text.startsWith('/')) return `<a href="${e(`file://${encodeURI(text)}`)}">${e(text)}</a>`;
  return e(text);
};

/**
 * One map node: title, description, the lessons that touched it (recorded
 * with --node, or sharing a card tagged both node and lesson), and its cards
 * as reveals. Nodes without cards stay, muted.
 * @param {any} project @param {any} node @param {any[]} cards this project's cards
 */
const nodeHtml = (project, node, cards) => {
  const e = escapeHtml;
  const mine = cards.filter((c) => (c.tags ?? []).includes(`node:${node.id}`));
  const ns = new Set(
    (project.lessons ?? []).filter((/** @type {any} */ l) => l.nodes?.includes(node.id)).map((/** @type {any} */ l) => l.n),
  );
  for (const c of mine) for (const t of c.tags ?? []) if (t.startsWith('lesson:')) ns.add(Number(t.slice(7)));
  const lessons = (project.lessons ?? []).filter((/** @type {any} */ l) => ns.has(l.n));
  return [
    `<article class="node${mine.length ? '' : ' empty'}">`,
    `<h3>${e(node.title ?? node.id)}</h3>`,
    node.description ? `<p class="desc">${e(node.description)}</p>` : '',
    lessons.length
      ? `<p class="node-lessons">${lessons.map((/** @type {any} */ l) => `<a href="${e(lessonFile(l))}">${e(l.title)}</a>`).join(' · ')}</p>`
      : '',
    mine.length
      ? `<div class="cards">\n${mine.map((c) => `<details><summary>${e(c.front)}</summary><p>${e(c.back)}</p></details>`).join('\n')}\n</div>`
      : '',
    '</article>',
  ].filter(Boolean).join('\n');
};

/**
 * The project page body: mission, lessons, the map with each node's cards and
 * lessons, sources, glossary. No counts, no dates.
 * @param {any} project
 * @param {Record<string, any>} cardStore
 */
export const renderProject = (project, cardStore) => {
  const H = homeLabels(project.language);
  const e = escapeHtml;
  const cards = Object.values(cardStore).filter((c) => (c.tags ?? []).includes(`project:${project.id}`));
  return [
    '<p class="back"><a href="../../index.html">òliba</a></p>',
    `<h1>${e(project.topic ?? project.id)}</h1>`,
    project.mission ? `<p class="mission">${e(project.mission)}</p>` : '',
    project.lessons?.length
      ? `<h2>${H.lessons}</h2>\n<ol class="lessons">\n${project.lessons.map((/** @type {any} */ l) => lessonItem(l, '')).join('\n')}\n</ol>`
      : '',
    project.nodes?.length
      ? `<h2>${H.map}</h2>\n${project.nodes.map((/** @type {any} */ n) => nodeHtml(project, n, cards)).join('\n')}`
      : '',
    project.sources?.length
      ? `<h2>${H.sources}</h2>\n<ul class="sources">\n${project.sources.map((/** @type {string} */ s) => `  <li>${sourceHtml(s)}</li>`).join('\n')}\n</ul>`
      : '',
    project.glossary?.length ? `<p class="ask"><a href="glossary.html">${H.glossary}</a></p>` : '',
  ].filter(Boolean).join('\n');
};

/** ~/.oliba/lessons/<project-slug>/, created on first use. @param {any} project */
export const lessonDir = (project) => {
  const path = join(dataDir(), 'lessons', projectSlug(project));
  mkdirSync(path, { recursive: true });
  return path;
};

/**
 * Regenerate the project page, lessons/<slug>/index.html.
 * @param {any} project
 * @param {Record<string, any>} [cards]
 */
export const writeLessonIndex = (project, cards = readCards()) => {
  const file = join(lessonDir(project), 'index.html');
  writeFileSync(file, renderPage({
    title: project.topic ?? project.id,
    lang: project.language,
    body: renderProject(project, cards),
    data: { type: 'project' },
    scripts: [],
  }));
  return file;
};

/**
 * Regenerate ~/.oliba/index.html, and every project page it links to, so no
 * link on the desk is dead.
 * @param {Record<string, any>} projects
 */
export const writeHomeIndex = (projects) => {
  const list = Object.values(projects);
  const cards = readCards();
  for (const p of list) writeLessonIndex(p, cards);
  const lang = pageLanguage(list);
  mkdirSync(dataDir(), { recursive: true });
  const file = join(dataDir(), 'index.html');
  writeFileSync(file, renderPage({
    title: 'òliba',
    lang,
    body: renderHome(list, lang),
    data: { type: 'home' },
    scripts: [],
  }));
  return file;
};

/**
 * Re-render every generated page from the store: the desk and each project's
 * page. Lessons themselves are written once and stay as they are.
 * @param {Record<string, any>} projects
 * @returns {string[]} the paths written
 */
export const writeAllPages = (projects) => [
  ...Object.values(projects).map((p) => join(lessonDir(p), 'index.html')),
  writeHomeIndex(projects),
];
