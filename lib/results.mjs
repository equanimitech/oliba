// @ts-check
/**
 * Lesson quiz results → FSRS. Shared by `cli.mjs results-import` and the
 * hook that picks up the page's downloads (lib/import-results.mjs).
 */
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { review } from './fsrs.mjs';
import { readCards, writeCards, readProjects } from './store.mjs';

/** Where the lesson page's save button lands its file (override: OLIBA_DOWNLOADS_DIR). */
export const downloadsDir = () => process.env.OLIBA_DOWNLOADS_DIR ?? join(homedir(), 'Downloads');

export const RESULTS_FILE = /^oliba-results-.*\.json$/;

/** @param {string} path */
const base = (path) => path.split(/[\\/]/).pop() ?? '';

/**
 * Rate a lesson's quiz cards from first-attempt results: wrong → again, right → good.
 * Cards reviewed after the answers (or, without `answeredAt`, after the lesson
 * was written) are skipped, so importing twice never rates twice.
 * @param {{ project: string, lesson: string, answeredAt?: string, items: { q: string, correct: boolean }[] }} results
 * @returns {{ rated: { q: string, cardId: string, rating: 'again' | 'good' }[], skipped: { q: string, reason: string }[] }}
 */
export function importResults(results) {
  if (!results?.project || !results.lesson || !Array.isArray(results.items)) throw new Error('not an oliba results file');
  const project = readProjects()[results.project];
  if (!project) throw new Error(`no project with id ${results.project}`);
  const since = results.answeredAt
    ?? (project.lessons ?? []).find((/** @type {any} */ l) => base(l.file) === results.lesson)?.createdAt
    ?? null;
  const cards = readCards();
  const lessonCards = Object.values(cards).filter((c) => c.tags.includes(`project:${project.id}`) && c.ref);
  /** @type {{ q: string, cardId: string, rating: 'again' | 'good' }[]} */
  const rated = [];
  /** @type {{ q: string, reason: string }[]} */
  const skipped = [];
  const seen = new Set();
  for (const { q, correct } of results.items) {
    if (seen.has(q)) continue; // the first attempt is the one that counts
    seen.add(q);
    const card = lessonCards.find((c) => base(c.ref) === `${results.lesson}#${q}`);
    if (!card) {
      skipped.push({ q, reason: 'no card for this quiz' });
    } else if (since && card.fsrs.lastReview && card.fsrs.lastReview > since) {
      skipped.push({ q, reason: 'already reviewed' });
    } else {
      const rating = correct ? 'good' : 'again';
      cards[card.id] = { ...card, fsrs: review(card.fsrs, correct ? 3 : 1) };
      rated.push({ q, cardId: card.id, rating });
    }
  }
  writeCards(cards);
  return { rated, skipped };
}

/**
 * Import one results file and delete it. Throws (and leaves the file) when it
 * can't be read or imported.
 * @param {string} file
 */
export function importResultsFile(file) {
  const result = importResults(JSON.parse(readFileSync(file, 'utf8')));
  if (RESULTS_FILE.test(base(file))) rmSync(file, { force: true });
  return result;
}

/**
 * Import every oliba-results-*.json in the downloads folder. Never throws:
 * a file that fails stays where it is for `/study results` to report.
 */
export function importDownloads() {
  let names;
  try {
    names = readdirSync(downloadsDir()).filter((n) => RESULTS_FILE.test(n));
  } catch {
    return;
  }
  for (const name of names) {
    try { importResultsFile(join(downloadsDir(), name)); } catch { /* left in place */ }
  }
}
