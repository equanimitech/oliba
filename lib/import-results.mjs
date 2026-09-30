#!/usr/bin/env node
// @ts-check
// UserPromptSubmit hook: import any lesson results the page saved to
// ~/Downloads. Silent always; never blocks the prompt.
import { importDownloads } from './results.mjs';

try { importDownloads(); } catch { /* never block the prompt */ }
