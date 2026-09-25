#!/usr/bin/env node
// @ts-check
/**
 * lull-n-learn status line: one due card's front as a retrieval cue.
 * One cue, never a count. Quiet when nothing is due. Silent on any error.
 * The chosen card stays pinned until answered (/study) or the session ends.
 *
 * Respects config.json:
 *   cueEnabled — master toggle (default: true)
 *   cueDelayMinutes — grace period after session start before cues appear (default: 5)
 *   cueTags — only show cards matching at least one of these tags (default: all)
 *   statusLinePrevious — the user's own status line command, run first and kept
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readCards, writeCue, readCue, readConfig, readSessionStart, isStudyActive, isCueCoolingDown } from './store.mjs';

const PREVIOUS_TIMEOUT_MS = 500;

/**
 * @param {Record<string, any>} config
 * @returns {string | null} the cue card's front, or null for silence
 */
function pickCue(config) {
  if (config.cueEnabled === false) return null;
  if (isStudyActive()) return null;
  if (isCueCoolingDown()) return null;

  const delayMinutes = config.cueDelayMinutes ?? 5;
  const sessionStart = readSessionStart();
  if (sessionStart) {
    const elapsed = (Date.now() - new Date(sessionStart).getTime()) / 60_000;
    if (elapsed < delayMinutes) return null;
  }

  const cards = readCards();
  const existingCue = readCue();
  if (existingCue && cards[existingCue.cardId]) return cards[existingCue.cardId].front;

  const now = new Date();
  let due = Object.values(cards).filter((card) => new Date(card.fsrs.due) <= now);

  const cueTags = config.cueTags;
  if (Array.isArray(cueTags) && cueTags.length > 0) {
    due = due.filter((card) =>
      card.tags.some((/** @type {string} */ t) => cueTags.some((ct) => t.includes(ct))),
    );
  }

  if (due.length === 0) return null;
  const pick = due[Math.floor(Math.random() * due.length)];
  writeCue(pick.id);
  return pick.front;
}

/**
 * Run the user's previous status line with the same stdin. A slow or
 * failing command yields '' so it never blanks the cue.
 * @param {string} command
 */
function runPrevious(command) {
  let input = '';
  try { input = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  const result = spawnSync('/bin/sh', ['-c', command], { input, timeout: PREVIOUS_TIMEOUT_MS, encoding: 'utf8' });
  return result.error ? '' : (result.stdout ?? '').trimEnd();
}

const config = readConfig();
/** @type {string | null} */
let cue = null;
try {
  cue = pickCue(config);
} catch {
  // Stay quiet. The cue is a gift, not a demand; an error is nobody's problem.
}
const theirs = typeof config.statusLinePrevious === 'string' ? runPrevious(config.statusLinePrevious) : '';
process.stdout.write([theirs, cue && `↻ ${cue}`].filter(Boolean).join('  '));
