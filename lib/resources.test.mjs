// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, pitchClass, semitones, seconds, parseLrc, validateSong, renderRepertoire } from './resources.mjs';

test('the repertoire lists songs newest first within each status, ties by title, and shows no dates', () => {
  /** @param {string} title @param {string} createdAt @param {string} [status] */
  const song = (title, createdAt, status = 'working') => /** @type {any} */ ({ id: title, title, artist: 'x', slug: title.toLowerCase(), status, createdAt });
  const html = renderRepertoire({ topic: 'Canto' }, [
    song('Aquarela', '2026-08-01T10:00:00.000Z'),
    song('Wave', '2026-09-20T10:00:00.000Z'),
    song('Garota', '2026-09-20T10:00:00.000Z'),
    song('Flor de Lis', '2026-09-30T10:00:00.000Z', 'repertoire'),
    song('Samba', '2026-07-01T10:00:00.000Z', 'repertoire'),
  ], 'pt-BR');
  const order = [...html.matchAll(/<li[^>]*><a href="[^"]+">([^<]+)<\/a>/g)].map((m) => m[1]);
  assert.deepEqual(order, ['Garota', 'Wave', 'Aquarela', 'Flor de Lis', 'Samba']);
  assert.doesNotMatch(html, /\d{4}-\d{2}-\d{2}/, 'order only, no dates');
});

test('keys read as letters or pt solfège', () => {
  assert.equal(pitchClass('Bb'), 10);
  assert.equal(pitchClass('si bemol'), 10);
  assert.equal(pitchClass('Si♭'), 10);
  assert.equal(pitchClass('F#m'), 6);
  assert.equal(pitchClass('Dó'), 0);
  assert.equal(pitchClass('lá menor'), 9);
  assert.equal(pitchClass('B'), 11);
  assert.equal(pitchClass('H'), null);
  assert.equal(pitchClass('bemol'), null);
});

test('semitones take the short way round, derived from the two keys', () => {
  assert.equal(semitones('C', 'Bb'), -2);
  assert.equal(semitones('C', 'D'), 2);
  assert.equal(semitones('C', 'F#'), -6);
  assert.equal(semitones('Bb', 'si bemol'), 0);
  assert.equal(semitones(null, 'Bb'), null);
});

test('section times read as seconds or m:ss', () => {
  assert.equal(seconds(42), 42);
  assert.equal(seconds('0:42'), 42);
  assert.equal(seconds('1:05.5'), 65.5);
  assert.ok(Number.isNaN(seconds('soon')));
});

test('LRC parses into timed lines and drops metadata tags', () => {
  assert.deepEqual(parseLrc('[ar:Djavan]\n[00:12.17]Valei-me, Deus\n[00:14.48]É o fim do nosso amor\n[00:20.00]'), [
    { t: 12.17, text: 'Valei-me, Deus' },
    { t: 14.48, text: 'É o fim do nosso amor' },
    { t: 20, text: '' },
  ]);
  assert.deepEqual(parseLrc(null), []);
});

test('the song type validates its required fields and shapes, in one line', () => {
  assert.deepEqual(TYPES.song.required, ['title', 'artist']);
  assert.equal(TYPES.song.review, 'none', 'a song is kept, not recalled: nothing goes to FSRS');
  assert.equal(validateSong({ title: 'Flor de Lis', artist: 'Djavan' }), null);
  assert.equal(validateSong({ title: 'Flor de Lis' }), 'a song needs "artist"');
  assert.match(validateSong({ title: 'x', artist: 'y', status: 'due' }) ?? '', /status/);
  assert.match(validateSong({ title: 'x', artist: 'y', originalKey: 'H' }) ?? '', /key "H"/);
  assert.match(validateSong({ title: 'x', artist: 'y', spotify: 'spotify:track:1' }) ?? '', /https/);
  assert.match(validateSong({ title: 'x', artist: 'y', sections: [{ name: 'Refrão', start: '1:05', end: '0:42' }] }) ?? '', /start < end/);
  assert.match(validateSong({ title: 'x', artist: 'y', versions: [{ kind: 'karaoke', file: 'a.m4a' }] }) ?? '', /kind/);
  assert.match(validateSong({ title: 'x', artist: 'y', versions: [{ kind: 'guia', file: 'a.m4a', key: 'Z' }] }) ?? '', /key "Z"/);
  assert.equal(validateSong({ status: 'repertoire' }, { patch: true }), null, 'a patch skips required');
  assert.match(validateSong({ title: ' ' }, { patch: true }) ?? '', /can't be empty/);
});

test('song tags are validated like project tags', () => {
  assert.equal(validateSong({ tags: ['voz', 'festa'] }, { patch: true }), null);
  assert.match(validateSong({ tags: 'voz' }, { patch: true }) ?? '', /list/);
  assert.match(validateSong({ tags: ['a,b'] }, { patch: true }) ?? '', /no comma/);
  assert.match(validateSong({ tags: ['x'.repeat(41)] }, { patch: true }) ?? '', /1–40/);
  assert.match(validateSong({ tags: [' '] }, { patch: true }) ?? '', /1–40/);
  assert.match(validateSong({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }, { patch: true }) ?? '', /up to 20/);
});

test('the repertoire has a tag filter, a status switch and chips per song, hidden until the script wakes them', () => {
  /** @param {string} title @param {string[]} tags @param {string} [status] */
  const song = (title, tags, status = 'working') => /** @type {any} */ ({ id: `id-${title}`, title, artist: 'x', slug: title.toLowerCase(), status, tags, createdAt: '2026-09-01' });
  const html = renderRepertoire({ topic: 'Canto' }, [song('Wave', ['Voz', 'bossa']), song('Aquarela', ['voz']), song('Samba', [], 'retired')], 'pt-BR');
  assert.match(html, /<p class="filter" role="group" aria-label="Mostrar" hidden><button type="button" data-filter="" aria-pressed="true">todas<\/button><button type="button" data-filter="bossa" aria-pressed="false">bossa<\/button><button type="button" data-filter="voz" aria-pressed="false">Voz<\/button><\/p>/);
  assert.match(html, /<li data-song="id-Wave" data-status="working" data-tags="\[&quot;Voz&quot;,&quot;bossa&quot;\]">/);
  assert.match(html, /<p class="manage" hidden><span class="status" role="group"><button type="button" data-status="working" aria-pressed="true">Em trabalho<\/button><button type="button" data-status="repertoire" aria-pressed="false">Repertório<\/button><button type="button" data-status="retired" aria-pressed="false">Guardada<\/button><\/span> <span class="chips"><\/span> <input class="tag"[^>]*placeholder="\+ nova etiqueta"/);
  assert.doesNotMatch(renderRepertoire({ topic: 'Canto' }, [song('Samba', [])], 'fr'), /class="filter"/, 'no tags, no filter');
  assert.match(renderRepertoire({ topic: 'Canto' }, [song('Samba', ['x'])], 'fr'), />toutes<\/button>[\s\S]*>Rangée<\/button>/);
});
