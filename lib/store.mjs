// @ts-check
/**
 * Persistence for oliba: plain JSON collections keyed by id,
 * living in ~/.oliba/ (override with OLIBA_DIR; LULL_N_LEARN_DIR still read).
 * No server, no account, no sync. The user owns these files.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Resolved lazily on every call so tests can point it at a temp dir.
 * @returns {string}
 */
const dirOverride = () => process.env.OLIBA_DIR ?? process.env.LULL_N_LEARN_DIR;

export const dataDir = () => dirOverride() ?? join(homedir(), '.oliba');

/**
 * One-time move of the pre-rename data folder: ~/.lull-n-learn -> ~/.oliba,
 * leaving a symlink at the old path so old status-line commands keep working.
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

const sessionStartPath = () => join(dataDir(), '.session-start');

/** @param {Date} [now] */
export function writeSessionStart(now = new Date()) {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(sessionStartPath(), now.toISOString());
}

/** @returns {string | null} */
export function readSessionStart() {
  try {
    return readFileSync(sessionStartPath(), 'utf8').trim();
  } catch {
    return null;
  }
}

const studyLockPath = () => join(dataDir(), '.study-active');

export function writeStudyLock() {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(studyLockPath(), new Date().toISOString());
}

export function clearStudyLock() {
  try { rmSync(studyLockPath()); } catch { /* already gone */ }
}

/** @returns {boolean} */
export function isStudyActive() {
  try {
    const ts = readFileSync(studyLockPath(), 'utf8').trim();
    const age = Date.now() - new Date(ts).getTime();
    return age < 2 * 60 * 60_000;
  } catch {
    return false;
  }
}

const cuePath = () => join(dataDir(), '.current-cue.json');

/** @param {string} cardId */
export function writeCue(cardId) {
  mkdirSync(dataDir(), { recursive: true });
  const target = cuePath();
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify({ cardId, ts: new Date().toISOString() }));
  renameSync(tmp, target);
}

/** @returns {{ cardId: string, ts: string } | null} */
export function readCue() {
  try {
    return JSON.parse(readFileSync(cuePath(), 'utf8'));
  } catch {
    return null;
  }
}

/** @param {{ cooldown?: boolean }} [opts] */
export function clearCue({ cooldown = true } = {}) {
  try { rmSync(cuePath()); } catch { /* already gone */ }
  if (cooldown) writeCueCooldown();
}

const cueCooldownPath = () => join(dataDir(), '.cue-cooldown');
const CUE_COOLDOWN_MS = 10 * 60_000;

export function writeCueCooldown() {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(cueCooldownPath(), new Date().toISOString());
}

export function clearCueCooldown() {
  try { rmSync(cueCooldownPath()); } catch { /* already gone */ }
}

/** @returns {boolean} */
export function isCueCoolingDown() {
  try {
    const ts = readFileSync(cueCooldownPath(), 'utf8').trim();
    return Date.now() - new Date(ts).getTime() < CUE_COOLDOWN_MS;
  } catch {
    return false;
  }
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
 * Repoint a status line still aimed at the pre-rename shim path.
 * Leaves settings.json untouched (no backup, no write) when nothing matches.
 * @returns {boolean} whether settings.json was rewritten
 */
export function migrateStatusLinePath() {
  /** @type {string} */
  let raw;
  /** @type {any} */
  let settings;
  try {
    raw = readFileSync(claudeSettingsPath(), 'utf8');
    settings = JSON.parse(raw);
  } catch {
    return false;
  }
  const command = settings?.statusLine?.command;
  const OLD = '.lull-n-learn/statusline.mjs';
  if (typeof command !== 'string' || !command.includes(OLD)) return false;
  writeClaudeSettings(raw, { ...settings, statusLine: { ...settings.statusLine, command: command.replaceAll(OLD, '.oliba/statusline.mjs') } });
  return true;
}

/** Stable status-line entry point: survives plugin version bumps. */
export const statusLineShimPath = () => join(dataDir(), 'statusline.mjs');

/**
 * Write the shim that imports this plugin version's statusline.mjs.
 * settings.json can't expand ${CLAUDE_PLUGIN_ROOT}; the shim can point anywhere.
 * @returns {string} the shim path
 */
export function writeStatusLineShim() {
  mkdirSync(dataDir(), { recursive: true });
  const target = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'statusline.mjs')).href;
  const shim = statusLineShimPath();
  writeFileSync(`${shim}.tmp`, `import ${JSON.stringify(target)};\n`);
  renameSync(`${shim}.tmp`, shim);
  return shim;
}
