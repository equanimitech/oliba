// @ts-check
/**
 * Writing pages: the template, ~/.oliba/index.html (every project under its
 * tags, the archived ones folded away, with buttons to archive and retag),
 * and each song's page with its project's repertoire. The CLI and the prompt
 * hook (lib/actions.mjs) both call these.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml, fold, slugify } from './text.mjs';
import { TYPES, labels, renderRepertoire, songsOf } from './resources.mjs';
import { dataDir } from './store.mjs';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.mjs');

/**
 * The one page template. Lessons, songs, the indexes and the glossary all go
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
  pt: {
    lessons: 'Lições', guide: 'Guia de estudo', glossary: 'Glossário', archived: 'Arquivados',
    archive: 'Arquivar', unarchive: 'Desarquivar', newTag: 'nova etiqueta', removeTag: 'Remover etiqueta',
    save: 'Salvar', copy: 'Copiar comando',
    saved: 'Salvo. Vale a partir da sua próxima mensagem ao Claude.', copied: 'Copiado: cole na conversa com o Claude.',
  },
  fr: {
    lessons: 'Leçons', guide: 'Guide d’étude', glossary: 'Glossaire', archived: 'Archivés',
    archive: 'Archiver', unarchive: 'Désarchiver', newTag: 'nouvelle étiquette', removeTag: 'Retirer l’étiquette',
    save: 'Enregistrer', copy: 'Copier la commande',
    saved: 'Enregistré. Appliqué à votre prochain message à Claude.', copied: 'Copié : collez-le dans la conversation avec Claude.',
  },
  en: {
    lessons: 'Lessons', guide: 'Study guide', glossary: 'Glossary', archived: 'Archived',
    archive: 'Archive', unarchive: 'Unarchive', newTag: 'new tag', removeTag: 'Remove tag',
    save: 'Save', copy: 'Copy command',
    saved: 'Saved. It applies on your next message to Claude.', copied: 'Copied: paste it into your chat with Claude.',
  },
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
 * One project: its topic, mission, links, and the controls index.js wakes up.
 * @param {any} p @param {number} level heading level @param {typeof HOME.en} H
 */
const projectHtml = (p, level, H) => {
  const e = escapeHtml;
  const links = [
    p.lessons?.length && p.slug ? `<a href="lessons/${e(p.slug)}/index.html">${H.lessons}</a>` : '',
    songsOf(p).length && p.slug ? `<a href="${TYPES.song.dir}/${e(p.slug)}/index.html">${labels(p.language).repertoire}</a>` : '',
    /^https?:\/\//.test(p.artifactUrl ?? '') ? `<a href="${e(p.artifactUrl)}">${H.guide}</a>` : '',
  ].filter(Boolean).join(' · ');
  return [
    `<section class="project" data-project="${e(p.id)}" data-archived="${Boolean(p.archived)}" data-tags="${e(JSON.stringify(p.tags ?? []))}">`,
    `<h${level}>${e(p.topic ?? p.id)}</h${level}>`,
    p.mission ? `<p class="mission">${e(p.mission)}</p>` : '',
    links ? `<p>${links}</p>` : '',
    `<p class="manage" hidden><span class="chips"></span> <input class="tag" type="text" maxlength="40" placeholder="+ ${H.newTag}" aria-label="${H.newTag}"> <button type="button" class="archive">${p.archived ? H.unarchive : H.archive}</button></p>`,
    '</section>',
  ].filter(Boolean).join('\n');
};

/**
 * The index body: projects under each of their tags (a project with two tags
 * shows under both), untagged ones last with no heading, archived ones in a
 * closed <details>. A map, not a scoreboard: no counts, no dates.
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
    archived.length ? `<details class="archived">\n<summary>${H.archived}</summary>\n${archived.map((p) => projectHtml(p, 3, H)).join('\n')}\n</details>` : '',
    actionsFooter(H),
  ].filter(Boolean).join('\n');
};

/**
 * One Save for every change queued on the page, and the copy fallback.
 * @param {typeof HOME.en} H
 */
const actionsFooter = (H) =>
  `<footer class="actions" hidden><button type="button" class="save-actions" disabled>${H.save}</button> <button type="button" class="copy-actions" disabled>${H.copy}</button> <output></output></footer>`;

/**
 * What manage.js reads off <main>: the CLI path for "copy command" and its words.
 * @param {typeof HOME.en} H
 */
const manageData = (H) => ({ cli: CLI, archive: H.archive, unarchive: H.unarchive, remove: H.removeTag, saved: H.saved, copied: H.copied });

/**
 * Regenerate ~/.oliba/index.html: every project, its mission and where to go.
 * @param {Record<string, any>} projects
 */
export const writeHomeIndex = (projects) => {
  const list = Object.values(projects);
  const lang = pageLanguage(list);
  const H = homeLabels(lang);
  mkdirSync(dataDir(), { recursive: true });
  const file = join(dataDir(), 'index.html');
  writeFileSync(file, renderPage({
    title: 'òliba',
    lang,
    body: renderHome(list, lang),
    data: { type: 'home', ...manageData(H) },
    scripts: ['manage.js'],
  }));
  return file;
};

/**
 * The project's folder name under lessons/, songs/ and classes/. Fixed on the
 * project the first time, so renaming the topic doesn't move its files.
 * @param {any} project
 */
export const projectSlug = (project) => (project.slug ??= slugify(project.topic ?? project.id));

/** ~/.oliba/songs/<project-slug>/<song-slug>/ @param {any} project @param {import('./resources.mjs').Song} song */
export const songDir = (project, song) => join(dataDir(), TYPES.song.dir, projectSlug(project), song.slug);

/**
 * Render the song's page and the project's repertoire index. Claude never
 * writes this HTML: the type's template does, from the stored JSON.
 * @param {any} project @param {import('./resources.mjs').Song} song
 */
export const writeSongPages = (project, song) => {
  const H = homeLabels(project.language);
  const dir = songDir(project, song);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'index.html');
  writeFileSync(file, renderPage({
    title: song.title,
    lang: project.language,
    body: `${TYPES.song.render(song, project.language)}\n${actionsFooter(H)}`,
    data: { type: 'song', ...manageData(H) },
    scripts: TYPES.song.scripts,
  }));
  const index = join(dirname(dir), 'index.html');
  writeFileSync(index, renderPage({
    title: labels(project.language).repertoire,
    lang: project.language,
    body: `${renderRepertoire(project, songsOf(project), project.language)}\n${actionsFooter(H)}`,
    data: { type: 'repertoire', ...manageData(H) },
    scripts: ['manage.js'],
  }));
  return { file, index };
};
