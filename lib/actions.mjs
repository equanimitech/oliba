// @ts-check
/**
 * Project housekeeping: archive, unarchive, retag. `cli.mjs project-archive`
 * and `project-set --tags` go through these functions, and so does the global
 * index page: it is a file and can't write the store, so its Save button
 * downloads oliba-actions-<time>.json and the prompt hook applies it from
 * ~/Downloads, like a lesson's results. Archiving deletes nothing: the
 * project's cards rest out of due, the cue and grilling until it comes back.
 */
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fold } from './text.mjs';
import { readProjects, writeProjects } from './store.mjs';
import { downloadsDir } from './results.mjs';
import { writeHomeIndex } from './home.mjs';

export const ACTIONS_FILE = /^oliba-actions-.*\.json$/;
export const TAG_MAX = 40;
const TAGS_MAX = 20;
const ACTIONS_MAX = 200;
const OPS = ['archive', 'unarchive', 'tags'];

/**
 * Trimmed, deduped case- and accent-insensitively (the first spelling stays).
 * @param {string[]} tags
 */
export const normalizeTags = (tags) => {
  const seen = new Set();
  return tags.map((t) => t.trim()).filter((t) => t && !seen.has(fold(t)) && seen.add(fold(t)));
};

/**
 * The project, archived or not. Unarchiving drops the flag: no trace of the time away.
 * @param {any} project @param {boolean} archived
 */
export const withArchived = (project, archived) => {
  const { archived: _, ...rest } = project;
  return archived ? { ...rest, archived: true } : rest;
};

/**
 * The project with these tags; none clears them.
 * @param {any} project @param {string[]} tags
 */
export const withTags = (project, tags) => {
  const { tags: _, ...rest } = project;
  const clean = normalizeTags(tags);
  return clean.length ? { ...rest, tags: clean } : rest;
};

/**
 * @typedef {{ op: 'archive' | 'unarchive', projectId: string } | { op: 'tags', projectId: string, tags: string[] }} Action
 */

/**
 * The first thing wrong with an actions file, in one line, or null.
 * @param {unknown} data @param {Record<string, any>} projects
 * @returns {string | null}
 */
export const checkActions = (data, projects) => {
  const actions = /** @type {any} */ (data)?.actions;
  if (!Array.isArray(actions) || actions.length > ACTIONS_MAX) return 'not an oliba actions file';
  for (const a of actions) {
    if (!OPS.includes(a?.op)) return `unknown op ${JSON.stringify(a?.op)}`;
    if (typeof a.projectId !== 'string' || !Object.hasOwn(projects, a.projectId)) return `no project with id ${a.projectId}`;
    if (a.op === 'tags') {
      if (!Array.isArray(a.tags) || a.tags.length > TAGS_MAX) return `"tags" must be a list of up to ${TAGS_MAX} tags`;
      for (const t of a.tags) {
        if (typeof t !== 'string' || !t.trim() || t.length > TAG_MAX || t.includes(',')) return `a tag is text of 1–${TAG_MAX} characters, with no comma`;
      }
    }
  }
  return null;
};

/**
 * Apply actions, in order, to a copy of the projects.
 * @param {Record<string, any>} projects @param {Action[]} actions
 */
export const applyActions = (projects, actions) => {
  const next = { ...projects };
  for (const a of actions) {
    next[a.projectId] = a.op === 'tags' ? withTags(next[a.projectId], a.tags) : withArchived(next[a.projectId], a.op === 'archive');
  }
  return next;
};

/**
 * Check, apply and save the page's actions, then rebuild the index. Throws
 * (saving nothing) on the first bad action.
 * @param {unknown} data
 */
export function importActions(data) {
  const projects = readProjects();
  const problem = checkActions(data, projects);
  if (problem) throw new Error(problem);
  const actions = /** @type {{ actions: Action[] }} */ (data).actions;
  const next = applyActions(projects, actions);
  writeProjects(next);
  writeHomeIndex(next);
  return { applied: actions.length };
}

/**
 * Import one actions file and delete it; an unreadable or invalid file stays.
 * @param {string} file
 */
export function importActionsFile(file) {
  const result = importActions(JSON.parse(readFileSync(file, 'utf8')));
  if (ACTIONS_FILE.test(basename(file))) rmSync(file, { force: true });
  return result;
}

/** Import every oliba-actions-*.json in Downloads, oldest name first. Never throws. */
export function importActionDownloads() {
  let names;
  try {
    names = readdirSync(downloadsDir()).filter((n) => ACTIONS_FILE.test(n)).sort();
  } catch {
    return;
  }
  for (const name of names) {
    try { importActionsFile(join(downloadsDir(), name)); } catch { /* left in place */ }
  }
}
