// @ts-check
/**
 * Persistence for oliba: plain JSON collections keyed by id,
 * living in ~/.oliba/ (override with OLIBA_DIR; LULL_N_LEARN_DIR still read).
 * No server, no account, no sync. The user owns these files.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

/**
 * Resolved lazily on every call so tests can point it at a temp dir.
 * @returns {string}
 */
const dirOverride = () => process.env.OLIBA_DIR ?? process.env.LULL_N_LEARN_DIR;

export const dataDir = () => dirOverride() ?? join(homedir(), '.oliba');

/**
 * One-time move of the pre-rename data folder: ~/.lull-n-learn -> ~/.oliba,
 * leaving a symlink at the old path so old paths keep resolving.
 * Never merges or overwrites: if ~/.oliba exists, the old folder is left alone.
 * Skipped when the data dir is overridden. Idempotent and silent on failure.
 */
export function migrateDataDir() {
  if (dirOverride()) return;
  const next = dataDir();
  const old = join(homedir(), '.lull-n-learn');
  if (existsSync(next) || !existsSync(old)) return;
  try {
    renameSync(old, next);
    symlinkSync(next, old);
  } catch { /* a concurrent run won the race, or the fs refused: next run retries */ }
}

/** @param {string} name */
const filePath = (name) => join(dataDir(), `${name}.json`);

/**
 * Read a collection; a missing file is an empty collection.
 * @param {string} name e.g. "cards", "projects"
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
export const readProjects = () => readCollection('projects');
/** @param {Record<string, any>} projects */
export const writeProjects = (projects) => writeCollection('projects', projects);

/**
 * The cards that can come due: every card but those of archived projects,
 * which rest (never deleted) until the project is unarchived.
 * @returns {Record<string, any>}
 */
export function readActiveCards() {
  const archived = new Set(Object.values(readProjects()).filter((p) => p.archived).map((p) => `project:${p.id}`));
  const cards = readCards();
  if (archived.size === 0) return cards;
  return Object.fromEntries(Object.entries(cards).filter(([, c]) => !c.tags.some((/** @type {string} */ t) => archived.has(t))));
}

/** @returns {Record<string, any>} */
export function readConfig() {
  try {
    return JSON.parse(readFileSync(join(dataDir(), 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * @param {string} key
 * @param {any} value
 */
export function writeConfigKey(key, value) {
  mkdirSync(dataDir(), { recursive: true });
  const config = readConfig();
  config[key] = value;
  const target = join(dataDir(), 'config.json');
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
  renameSync(tmp, target);
}

/** Claude Code's user settings file (honors CLAUDE_CONFIG_DIR). */
export const claudeSettingsPath = () =>
  join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'settings.json');

/**
 * Write Claude Code settings atomically, backing up the previous raw text.
 * @param {string | null} raw the file's current text, null if it did not exist
 * @param {Record<string, any>} next
 * @returns {string | null} the backup path, if one was written
 */
export function writeClaudeSettings(raw, next) {
  const path = claudeSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  const backup = raw !== null ? `${path}.oliba.bak` : null;
  if (backup) writeFileSync(backup, raw ?? '');
  writeFileSync(`${path}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
  return backup;
}

/**
 * oliba no longer draws a status line (0.19). Give back the one it replaced:
 * when settings.json's statusLine runs oliba's shim, restore the command kept
 * in config.statusLinePrevious (or drop the key when there was none), with a
 * backup, then delete the shim. Any other status line is never touched.
 * Idempotent. Returns a one-line note when settings.json can't be parsed but
 * still names a statusline.mjs, so the user can fix it by hand; null otherwise.
 * @returns {string | null}
 */
export function restoreStatusLine() {
  const shim = join(dataDir(), 'statusline.mjs');
  const isOurs = (/** @type {unknown} */ c) => typeof c === 'string' && (c.includes(shim) || /\.(oliba|lull-n-learn)\/statusline\.mjs/.test(c));
  /** @type {string | null} */
  let raw = null;
  try { raw = readFileSync(claudeSettingsPath(), 'utf8'); } catch { /* no settings file */ }
  if (raw !== null) {
    /** @type {any} */
    let settings;
    try {
      settings = JSON.parse(raw);
    } catch {
      return /statusline\.mjs/.test(raw) ? `oliba could not read ${claudeSettingsPath()}; if your status line runs oliba's statusline.mjs, put your own command back by hand.` : null;
    }
    if (isOurs(settings?.statusLine?.command)) {
      const previous = readConfig().statusLinePrevious;
      const { statusLine, ...rest } = settings;
      writeClaudeSettings(raw, typeof previous === 'string' ? { ...rest, statusLine: { ...statusLine, command: previous } } : rest);
    }
  }
  rmSync(shim, { force: true });
  return null;
}
