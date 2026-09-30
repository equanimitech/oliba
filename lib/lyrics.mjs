// @ts-check
/**
 * Lyrics from LRCLIB (https://lrclib.net): a free, open lyrics API with no key.
 * Fetched for the learner's own study and stored locally on the song.
 * API shape checked against https://lrclib.net/docs on 2026-09-30:
 * GET /api/search?track_name=&artist_name= → up to 20 records of
 * { id, trackName, artistName, albumName, duration, instrumental, plainLyrics, syncedLyrics }.
 */
import { readFileSync } from 'node:fs';

/** Base URL (override: OLIBA_LRCLIB_URL, for tests). */
export const lrclibUrl = () => process.env.OLIBA_LRCLIB_URL ?? 'https://lrclib.net';

const VERSION = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version;
/** LRCLIB asks clients to name themselves. */
const USER_AGENT = `oliba v${VERSION} (https://github.com/equanimitech/oliba)`;

/**
 * @typedef {{ id: number, duration: number, instrumental?: boolean, plainLyrics: string | null, syncedLyrics: string | null }} LrclibRecord
 * @typedef {{ lyrics: string, syncedLyrics: string | null, lrclibId: number, lyricsDuration: number }} SongLyrics
 */

/**
 * The record to keep: with the teacher's audio length, the closest one (a
 * recording within ±3 s is likely the one she sings over); without it, the
 * first with timed lines. Records with no plain lyrics never win.
 * @param {LrclibRecord[]} records
 * @param {number | null} duration seconds of the song's audio
 * @returns {LrclibRecord | null}
 */
export const pickRecord = (records, duration) => {
  const usable = records.filter((r) => !r.instrumental && r.plainLyrics?.trim());
  if (duration) {
    return usable.reduce((/** @type {LrclibRecord | null} */ best, r) =>
      best === null || Math.abs(r.duration - duration) < Math.abs(best.duration - duration) ? r : best, null);
  }
  return usable.find((r) => r.syncedLyrics) ?? usable[0] ?? null;
};

/** @param {LrclibRecord} r @returns {SongLyrics} */
export const toSongLyrics = (r) => ({
  lyrics: /** @type {string} */ (r.plainLyrics).trim(),
  syncedLyrics: r.syncedLyrics?.trim() || null,
  lrclibId: r.id,
  lyricsDuration: r.duration,
});

/**
 * Search LRCLIB for a song. Never throws: no network or no match comes back
 * as a status the caller reports in one line.
 * @param {{ title: string, artist: string, duration?: number | null }} song
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ status: 'found', found: SongLyrics } | { status: 'not-found' } | { status: 'failed', reason: string }>}
 */
export async function findLyrics({ title, artist, duration = null }, fetchImpl = fetch) {
  const query = new URLSearchParams({ track_name: title, artist_name: artist });
  try {
    const res = await fetchImpl(`${lrclibUrl()}/api/search?${query}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { status: 'failed', reason: `LRCLIB answered ${res.status}` };
    const records = await res.json();
    const record = pickRecord(Array.isArray(records) ? records : [], duration);
    return record ? { status: 'found', found: toSongLyrics(record) } : { status: 'not-found' };
  } catch (err) {
    return { status: 'failed', reason: /** @type {Error} */ (err).message };
  }
}
