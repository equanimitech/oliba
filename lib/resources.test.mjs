// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, pitchClass, semitones, seconds, parseLrc, validateSong } from './resources.mjs';

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
