// @ts-check
// Pre-rename migration (lull-n-learn -> oliba), always against a temp HOME.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SESSION_START = join(dirname(fileURLToPath(import.meta.url)), 'session-start.mjs');

/** @type {string} */
let home;
const oldDir = () => join(home, '.lull-n-learn');
const newDir = () => join(home, '.oliba');
const settingsFile = () => join(home, 'claude', 'settings.json');

/** Run session-start with a temp HOME and no data-dir override. */
const sessionStart = () => {
  const { OLIBA_DIR, LULL_N_LEARN_DIR, ...env } = process.env;
  return execFileSync(process.execPath, [SESSION_START], {
    env: { ...env, HOME: home, CLAUDE_CONFIG_DIR: join(home, 'claude') },
    encoding: 'utf8',
  });
};

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), 'oliba-home-')));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

test('moves ~/.lull-n-learn to ~/.oliba and leaves a symlink behind', () => {
  mkdirSync(oldDir());
  writeFileSync(join(oldDir(), 'cards.json'), '{"a":1}');
  sessionStart();
  assert.equal(readFileSync(join(newDir(), 'cards.json'), 'utf8'), '{"a":1}');
  assert.ok(lstatSync(oldDir()).isSymbolicLink());
  assert.equal(readlinkSync(oldDir()), newDir());
  assert.ok(existsSync(join(newDir(), 'statusline.mjs')));
});

test('when both exist, uses ~/.oliba and leaves the old folder untouched', () => {
  mkdirSync(oldDir());
  mkdirSync(newDir());
  writeFileSync(join(oldDir(), 'cards.json'), '{"old":1}');
  writeFileSync(join(newDir(), 'cards.json'), '{"new":1}');
  sessionStart();
  assert.ok(!lstatSync(oldDir()).isSymbolicLink());
  assert.equal(readFileSync(join(oldDir(), 'cards.json'), 'utf8'), '{"old":1}');
  assert.equal(readFileSync(join(newDir(), 'cards.json'), 'utf8'), '{"new":1}');
  assert.ok(!existsSync(join(oldDir(), 'statusline.mjs')));
});

test('when neither exists, creates only ~/.oliba', () => {
  sessionStart();
  assert.ok(existsSync(newDir()));
  assert.ok(!existsSync(oldDir()));
});

test('repoints a status line aimed at the old shim, with a backup', () => {
  mkdirSync(join(home, 'claude'));
  const before = { model: 'opus', statusLine: { type: 'command', command: `"node" "${oldDir()}/statusline.mjs"`, padding: 1 } };
  writeFileSync(settingsFile(), JSON.stringify(before));
  const out = sessionStart();
  const after = JSON.parse(readFileSync(settingsFile(), 'utf8'));
  assert.equal(after.statusLine.command, `"node" "${newDir()}/statusline.mjs"`);
  assert.equal(after.model, 'opus');
  assert.equal(after.statusLine.padding, 1);
  assert.deepEqual(JSON.parse(readFileSync(`${settingsFile()}.oliba.bak`, 'utf8')), before);
  assert.doesNotMatch(out, /statusline-install/);
});

test('leaves other status lines alone, with no backup', () => {
  mkdirSync(join(home, 'claude'));
  const raw = JSON.stringify({ statusLine: { type: 'command', command: 'my-line' } });
  writeFileSync(settingsFile(), raw);
  sessionStart();
  assert.equal(readFileSync(settingsFile(), 'utf8'), raw);
  assert.ok(!existsSync(`${settingsFile()}.oliba.bak`));
});
