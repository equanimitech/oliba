#!/usr/bin/env node
// @ts-check
// UserPromptSubmit hook: import any lesson results, and any archive or tag
// changes from the index page, that the pages saved to ~/Downloads.
// Silent always; never blocks the prompt.
import { importDownloads } from './results.mjs';
import { importActionDownloads } from './actions.mjs';

try { importDownloads(); } catch { /* never block the prompt */ }
try { importActionDownloads(); } catch { /* never block the prompt */ }
