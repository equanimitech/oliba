// @ts-check
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dataDir,
  readCollection,
  writeCollection,
  readCards,
  writeCards,
  readProjects,
  writeProjects,
  writeCue,
  readCue,
} from './store.mjs';

/** @type {string} */
let tempRoot;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'lull-n-learn-store-'));
  process.env.LULL_N_LEARN_DIR = join(tempRoot, 'data');
});

afterEach(() => {
  delete process.env.LULL_N_LEARN_DIR;
  rmSync(tempRoot, { recursive: true, force: true });
});

test('dataDir honors the LULL_N_LEARN_DIR override', () => {
  assert.equal(dataDir(), join(tempRoot, 'data'));
});

test('reading a collection that does not exist returns an empty object', () => {
  assert.deepEqual(readCollection('cards'), {});
  assert.deepEqual(readCards(), {});
});

test('writeCollection creates the directory and round-trips', () => {
  const card = { id: 'a1', front: 'What is a monoid?', back: 'A set with an associative op and identity.' };
  writeCards({ [card.id]: card });
  assert.ok(existsSync(join(dataDir(), 'cards.json')));
  assert.deepEqual(readCards(), { a1: card });
});

test('files are pretty-printed JSON a human can read and edit', () => {
  writeCollection('cards', { a: { id: 'a' } });
  const raw = readFileSync(join(dataDir(), 'cards.json'), 'utf8');
  assert.ok(raw.includes('\n  '), 'expected 2-space indentation');
  assert.ok(raw.endsWith('\n'), 'expected trailing newline');
});

test('readProjects returns empty when no file exists', () => {
  assert.deepEqual(readProjects(), {});
});

test('writeProjects round-trips project data', () => {
  const project = { id: 'p1', topic: 'rust ownership', nodes: [] };
  writeProjects({ p1: project });
  assert.ok(existsSync(join(dataDir(), 'projects.json')));
  assert.deepEqual(readProjects(), { p1: project });
});

test('projects are separate from cards', () => {
  writeCards({ a: { id: 'a' } });
  writeProjects({ c: { id: 'c' } });
  assert.deepEqual(Object.keys(readCards()), ['a']);
  assert.deepEqual(Object.keys(readProjects()), ['c']);
});

test('readCue returns null when no cue has been written', () => {
  assert.equal(readCue(), null);
});

test('writeCue and readCue round-trip the card id', () => {
  writeCue('card-42');
  const cue = readCue();
  assert.equal(cue.cardId, 'card-42');
  assert.ok(cue.ts);
});

test('writeCue overwrites the previous cue', () => {
  writeCue('first');
  writeCue('second');
  assert.equal(readCue().cardId, 'second');
});
