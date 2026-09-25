#!/usr/bin/env node
// @ts-check
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSessionStart, writeSessionStart, clearStudyLock, clearCueCooldown, readConfig, claudeSettingsPath, writeStatusLineShim } from './store.mjs';

const existing = readSessionStart();
const GRACE_MS = 10 * 60_000;
if (!existing || Date.now() - new Date(existing).getTime() > GRACE_MS) {
  writeSessionStart();
}
clearStudyLock();
clearCueCooldown();
const shim = writeStatusLineShim();

const SKILLS = "lull-n-learn active. Skills: /syllabus (map a topic), /teach (learn one piece), /study (retrieval; also answers the status-line cue), /config (settings, status line). Spaced repetition grounded in Scott Young's Ultralearning. Data: ~/.lull-n-learn/";
process.stdout.write(`${SKILLS}\n`);

/** @returns {any} */
const readSettings = () => {
  try { return JSON.parse(readFileSync(claudeSettingsPath(), 'utf8')); } catch { return {}; }
};

const installed = String(readSettings().statusLine?.command ?? '').includes(shim);
if (!installed && !readConfig().statusLineOffered) {
  const cli = join(dirname(fileURLToPath(import.meta.url)), 'cli.mjs');
  process.stdout.write(
    `lull-n-learn status line is not set up. Once, at a natural moment in this session, offer the user in one line to show one due card in the status line. ` +
    `On yes, run: node "${cli}" statusline-install (it keeps any status line they already have). ` +
    `On no, run: node "${cli}" config-set statusLineOffered true. Never raise it again after they answer.\n`,
  );
}
