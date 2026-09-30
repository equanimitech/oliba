// @ts-check
/**
 * Housekeeping from the pages: archive, unarchive and retag a project; move a
 * song between statuses and retag it. The CLI (`project-archive`,
 * `project-set --tags`, `song-set`) goes through the same functions. The
 * pages are files and can't write the store, so their Save button downloads
 * oliba-actions-<time>.json and the prompt hook applies it from ~/Downloads,
 * like a lesson's results. Archiving deletes nothing: the project's cards
 * rest out of due, the cue and grilling until it comes back.
 */
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { normalizeTags, tagsProblem } from './text.mjs';
import { readProjects, writeProjects } from './store.mjs';
import { downloadsDir } from './results.mjs';
import { SONG_STATUSES, patchSong, songsOf } from './resources.mjs';
import { writeHomeIndex, writeSongPages } from './home.mjs';

export { normalizeTags };
export const ACTIONS_FILE = /^oliba-actions-.*\.json$/;
const ACTIONS_MAX = 200;
const OPS = ['archive', 'unarchive', 'tags', 'song-status', 'song-tags'];

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
 * The project holding a song, by the song's id.
 * @param {Record<string, any>} projects @param {string} songId
 * @returns {any | undefined}
 */
export const projectOfSong = (projects, songId) => Object.values(projects).find((p) => songsOf(p).some((s) => s.id === songId));

/**
 * The project with one of its songs patched (`patchSong`, as `song-set` does).
 * @param {any} project @param {string} songId @param {Record<string, any>} patch
 */
export const withSongPatch = (project, songId, patch) => ({
  ...project,
  resources: project.resources.map((/** @type {any} */ r) => (r.type === 'song' && r.id === songId ? patchSong(r, patch) : r)),
});

/**
 * @typedef {{ op: 'archive' | 'unarchive', projectId: string }
 *   | { op: 'tags', projectId: string, tags: string[] }
 *   | { op: 'song-status', songId: string, status: import('./resources.mjs').SongStatus }
 *   | { op: 'song-tags', songId: string, tags: string[] }} Action
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
    if (a.op.startsWith('song-')) {
      if (typeof a.songId !== 'string' || !projectOfSong(projects, a.songId)) return `no song with id ${a.songId}`;
      if (a.op === 'song-status' && !SONG_STATUSES.includes(a.status)) return `"status" must be one of: ${SONG_STATUSES.join(', ')}`;
    } else if (typeof a.projectId !== 'string' || !Object.hasOwn(projects, a.projectId)) return `no project with id ${a.projectId}`;
    if (a.op === 'tags' || a.op === 'song-tags') {
      const problem = tagsProblem(a.tags);
      if (problem) return problem;
    }
  }
  return null;
};

/**
 * Apply checked actions, in order, to a copy of the projects.
 * @param {Record<string, any>} projects @param {Action[]} actions
 */
export const applyActions = (projects, actions) => {
  const next = { ...projects };
  for (const a of actions) {
    if (a.op === 'song-status' || a.op === 'song-tags') {
      const project = projectOfSong(next, a.songId);
      next[project.id] = withSongPatch(project, a.songId, a.op === 'song-status' ? { status: a.status } : { tags: a.tags });
    } else {
      next[a.projectId] = a.op === 'tags' ? withTags(next[a.projectId], a.tags) : withArchived(next[a.projectId], a.op === 'archive');
    }
  }
  return next;
};

/**
 * Check, apply and save the page's actions, then re-render what they touched:
 * each changed song's page and repertoire, and the home index. Throws (saving
 * nothing) on the first bad action.
 * @param {unknown} data
 */
export function importActions(data) {
  const projects = readProjects();
  const problem = checkActions(data, projects);
  if (problem) throw new Error(problem);
  const actions = /** @type {{ actions: Action[] }} */ (data).actions;
  const next = applyActions(projects, actions);
  for (const songId of new Set(actions.flatMap((a) => ('songId' in a ? [a.songId] : [])))) {
    const project = projectOfSong(next, songId);
    writeSongPages(project, songsOf(project).find((s) => s.id === songId));
  }
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
