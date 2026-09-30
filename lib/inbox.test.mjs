// @ts-check
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAudioName, editDistance, scanInbox } from './inbox.mjs';

/** @type {string} */
let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oliba-inbox-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

test('a file name gives the song title and the recording role', () => {
  assert.deepEqual(parseAudioName('flor de lis - sem voz.mpeg'), { title: 'flor de lis', role: 'base' });
  assert.deepEqual(parseAudioName('flor de liz - com voz.mpeg'), { title: 'flor de liz', role: 'guia' });
  assert.deepEqual(parseAudioName('Aquarela (Playback).m4a'), { title: 'Aquarela', role: 'base' });
  assert.deepEqual(parseAudioName('Aquarela - GUIA (1).m4a'), { title: 'Aquarela', role: 'guia' });
  assert.deepEqual(parseAudioName('Garota de Ipanema_karaoke.mp3'), { title: 'Garota de Ipanema', role: 'base' });
  assert.deepEqual(parseAudioName('Wave no vocals.wav'), { title: 'Wave', role: 'base' });
  assert.deepEqual(parseAudioName('Wave with vocals.wav'), { title: 'Wave', role: 'guia' });
  assert.deepEqual(parseAudioName('Wave instrumental.opus'), { title: 'Wave', role: 'base' });
  assert.deepEqual(parseAudioName('Samba de uma nota só.m4a'), { title: 'Samba de uma nota só', role: null });
});

test('edit distance counts a typo as one', () => {
  assert.equal(editDistance('flor de lis', 'flor de liz'), 1);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('aquarela', 'aquarela'), 0);
});

test('scanInbox groups loose name matches of the same length, skipping claimed, old and non-audio files', () => {
  /** @type {Record<string, number>} */
  const lengths = {
    'flor de lis - sem voz.mpeg': 223.24,
    'flor de liz - com voz.mpeg': 223.24,
    'Flor de Lis (novo tom) - com voz.m4a': 231.8,
    'Aquarela - guia.m4a': 190,
    'Aquarela - playback.m4a': 190.3,
    'old.m4a': 100,
    'claimed.m4a': 100,
  };
  for (const name of [...Object.keys(lengths), 'oliba-results-x.json', 'notes.txt']) writeFileSync(join(dir, name), 'x');
  const old = new Date(Date.now() - 30 * 86_400_000);
  utimesSync(join(dir, 'old.m4a'), old, old);

  const groups = scanInbox({ dir, claimed: new Set([join(dir, 'claimed.m4a')]), duration: (f) => lengths[f.split('/').pop() ?? ''] ?? null });
  const shape = groups.map((g) => [g.title, g.files.map((f) => `${f.name}:${f.role}`)]);
  assert.deepEqual(shape, [
    ['Aquarela', ['Aquarela - guia.m4a:guia', 'Aquarela - playback.m4a:base']],
    ['Flor de Lis (novo tom)', ['Flor de Lis (novo tom) - com voz.m4a:guia']],
    ['flor de lis', ['flor de lis - sem voz.mpeg:base', 'flor de liz - com voz.mpeg:guia']],
  ]);
  assert.equal(groups[2].files[0].path, join(dir, 'flor de lis - sem voz.mpeg'));
  assert.equal(groups[2].files[0].duration, 223.24);
});

test('scanInbox groups by name alone when a length is unknown, and a missing folder is empty', () => {
  writeFileSync(join(dir, 'Wave - com voz.m4a'), 'x');
  writeFileSync(join(dir, 'wave - sem voz.m4a'), 'x');
  assert.equal(scanInbox({ dir, duration: () => null }).length, 1);
  assert.deepEqual(scanInbox({ dir: join(dir, 'nope') }), []);
});

test('a recording of 10 minutes or more is a class of its own, never grouped with a song', () => {
  /** @type {Record<string, number>} */
  const lengths = { 'Aula 30 set.m4a': 2700, 'aula 30 set - com voz.m4a': 223, 'Flor de Lis.m4a': 223.2, 'Nove minutos.m4a': 599 };
  for (const name of Object.keys(lengths)) writeFileSync(join(dir, name), 'x');
  const groups = scanInbox({ dir, duration: (f) => lengths[f.split('/').pop() ?? ''] ?? null });
  assert.deepEqual(groups.map((g) => [g.kind, g.files.map((f) => f.name)]), [
    ['class', ['Aula 30 set.m4a']],
    ['song', ['Flor de Lis.m4a']],
    ['song', ['Nove minutos.m4a']],
    ['song', ['aula 30 set - com voz.m4a']],
  ]);
});
