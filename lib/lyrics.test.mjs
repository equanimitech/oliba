// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLyrics, pickRecord } from './lyrics.mjs';

/** A slice of the real /api/search answer for "Flor de Lis", Djavan (2026-09-30). */
const RECORDS = [
  { id: 37485952, duration: 228, instrumental: false, plainLyrics: 'Valei-me, Deus', syncedLyrics: '[00:12.17]Valei-me, Deus' },
  { id: 37133480, duration: 254, instrumental: false, plainLyrics: 'Valei-me, Deus', syncedLyrics: '[00:20.00]Valei-me, Deus' },
  { id: 34711768, duration: 224, instrumental: false, plainLyrics: 'Valei-me, Deus\nÉ o fim do nosso amor', syncedLyrics: '[00:12.17]Valei-me, Deus' },
  { id: 20816425, duration: 223, instrumental: false, plainLyrics: 'Valei-me, Deus', syncedLyrics: null },
  { id: 1, duration: 223.2, instrumental: true, plainLyrics: null, syncedLyrics: null },
];

/**
 * A fetch that answers like LRCLIB, and remembers what it was asked.
 * @param {number} status @param {unknown} body
 */
const stubFetch = (status, body) => {
  /** @type {{ url: string, headers: any }[]} */
  const calls = [];
  const impl = /** @type {typeof fetch} */ (/** @type {unknown} */ (async (/** @type {string} */ url, /** @type {any} */ init) => {
    calls.push({ url, headers: init.headers });
    return { ok: status < 400, status, json: async () => body };
  }));
  return { impl, calls };
};

test('pickRecord keeps the record closest to the audio length, never an instrumental', () => {
  assert.equal(pickRecord(RECORDS, 223.24)?.id, 20816425);
  assert.equal(pickRecord(RECORDS, 225)?.id, 34711768);
  assert.equal(pickRecord(RECORDS, null)?.id, 37485952, 'without a length: the first with timed lines');
  assert.equal(pickRecord([RECORDS[4]], 223), null);
  assert.equal(pickRecord([], 223), null);
});

test('findLyrics searches by track and artist, names itself, and maps the record onto the song', async () => {
  const { impl, calls } = stubFetch(200, RECORDS);
  const res = await findLyrics({ title: 'Flor de Lis', artist: 'Djavan', duration: 224.4 }, impl);
  assert.equal(calls[0].url, 'https://lrclib.net/api/search?track_name=Flor+de+Lis&artist_name=Djavan');
  assert.match(calls[0].headers['User-Agent'], /^oliba v\d+\.\d+\.\d+ \(https:\/\/github\.com\/equanimitech\/oliba\)$/);
  assert.deepEqual(res, {
    status: 'found',
    found: { lyrics: 'Valei-me, Deus\nÉ o fim do nosso amor', syncedLyrics: '[00:12.17]Valei-me, Deus', lrclibId: 34711768, lyricsDuration: 224 },
  });
});

test('findLyrics reports no match, an error status and no network, without throwing', async () => {
  assert.deepEqual(await findLyrics({ title: 'x', artist: 'y' }, stubFetch(200, []).impl), { status: 'not-found' });
  assert.deepEqual(await findLyrics({ title: 'x', artist: 'y' }, stubFetch(429, '').impl), { status: 'failed', reason: 'LRCLIB answered 429' });
  const offline = /** @type {typeof fetch} */ (/** @type {unknown} */ (async () => { throw new Error('fetch failed'); }));
  assert.deepEqual(await findLyrics({ title: 'x', artist: 'y' }, offline), { status: 'failed', reason: 'fetch failed' });
});
