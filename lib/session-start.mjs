#!/usr/bin/env node
// @ts-check
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importDownloads } from './results.mjs';
import { writeAllPages } from './home.mjs';
import { readSessionStart, writeSessionStart, clearStudyLock, clearCueCooldown, readConfig, claudeSettingsPath, writeStatusLineShim, migrateDataDir, migrateStatusLinePath, readProjects, dataDir } from './store.mjs';

migrateDataDir();
migrateStatusLinePath();
try { importDownloads(); } catch { /* lesson results wait for the next prompt */ }

// After an upgrade, re-render every generated page so none is left in the old
// shape. Pages only, from the store: fast enough for the hook (tens of ms for
// dozens of songs). A failure retries next session.
const here = dirname(fileURLToPath(import.meta.url));
const pagesVersion = join(dataDir(), '.pages-version');
try {
  const running = JSON.parse(readFileSync(join(here, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version;
  const stored = existsSync(pagesVersion) ? readFileSync(pagesVersion, 'utf8').trim() : null;
  if (running && stored !== running) {
    writeAllPages(readProjects());
    writeFileSync(pagesVersion, running);
  }
} catch { /* pages rebuild next session */ }

const existing = readSessionStart();
const GRACE_MS = 10 * 60_000;
if (!existing || Date.now() - new Date(existing).getTime() > GRACE_MS) {
  writeSessionStart();
}
clearStudyLock();
clearCueCooldown();
const shim = writeStatusLineShim();

const SKILLS = "oliba active. Skills: /oliba:syllabus (map a topic), /oliba:teach (one skill per sitting by Socratic questions, written up as an HTML lesson), /oliba:study (retrieval; answers the status-line cue; /oliba:study grill me on <topic> drills weak spots), /oliba:config (settings, status line). Spaced repetition grounded in Scott Young's Ultralearning. Data: ~/.oliba/";
process.stdout.write(`${SKILLS}\n`);

/** @returns {any} */
const readSettings = () => {
  try { return JSON.parse(readFileSync(claudeSettingsPath(), 'utf8')); } catch { return {}; }
};

const installed = String(readSettings().statusLine?.command ?? '').includes(shim);
if (!installed && !readConfig().statusLineOffered) {
  const cli = join(here, 'cli.mjs');
  process.stdout.write(
    `oliba status line is not set up. Once, at a natural moment in this session, offer the user in one line to show one due card in the status line. ` +
    `On yes, run: node "${cli}" statusline-install (it keeps any status line they already have). ` +
    `On no, run: node "${cli}" config-set statusLineOffered true. Never raise it again after they answer.\n`,
  );
}
