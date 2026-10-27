#!/usr/bin/env node
// @ts-check
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importDownloads } from './results.mjs';
import { writeAllPages } from './home.mjs';
import { migrateDataDir, restoreStatusLine, readProjects, dataDir } from './store.mjs';

migrateDataDir();
/** @type {string | null} */
let note = null;
try { note = restoreStatusLine(); } catch { /* retried next session */ }
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

const SKILLS = "oliba active. Skills: /oliba:map (see a whole topic first), /oliba:learn (learn something new: one skill per sitting by Socratic questions, written up as an HTML lesson), /oliba:review (keep what you have: retrieval; /oliba:review grill me on <topic> drills weak spots), /oliba:config (settings, archive and tag topics). While Claude works, the wait band offers one due card above the prompt. Spaced repetition grounded in Scott Young's Ultralearning. Data: ~/.oliba/";
process.stdout.write(`${SKILLS}\n`);
if (note) process.stdout.write(`Tell the user once, in one line: ${note}\n`);
