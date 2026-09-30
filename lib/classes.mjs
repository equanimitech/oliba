// @ts-check
/**
 * A class recording becomes a transcript, on this Mac: Vibe's `sona` CLI
 * (whisper.cpp, https://github.com/thewh1teagle/vibe) on the large-v3-turbo
 * model Vibe already downloaded. Nothing leaves the machine.
 * Checked 2026-09-30: `sona transcribe <model> <audio> -l pt` prints the text
 * to stdout, exit 1 on a missing model; `-l auto` detects the language.
 * A 7.9 min mock class (speech, sung guide, backing) took 9 s on Metal.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fold } from './text.mjs';

export const INSTALL_HINT = 'Transcribing needs Vibe: brew install --cask vibe, then open Vibe once and download the large-v3-turbo model.';

/**
 * Where the transcriber lives: Vibe's defaults, or `config.transcriber`.
 * @param {{ transcriber?: { cmd?: string, model?: string } }} config
 * @returns {{ cmd: string, model: string }}
 */
export const transcriber = (config) => ({
  cmd: config.transcriber?.cmd ?? '/Applications/vibe.app/Contents/MacOS/sona',
  model: config.transcriber?.model ?? join(homedir(), 'Library', 'Application Support', 'github.com.thewh1teagle.vibe', 'ggml-large-v3-turbo.bin'),
});

/**
 * The words to prime whisper with: the project's node and song titles, so
 * "vocalize" or "Flor de Lis" come out spelled as the learner knows them.
 * @param {string[]} titles
 */
export const vocabulary = (titles) => {
  const seen = new Set();
  const words = titles.filter((t) => t?.trim() && !seen.has(fold(t)) && seen.add(fold(t)));
  let prompt = '';
  for (const w of words) {
    if (prompt.length + w.length > 220) break;
    prompt = prompt ? `${prompt}, ${w.trim()}` : w.trim();
  }
  return prompt;
};

/**
 * sona's arguments. `--max-text-ctx 64` keeps whisper from looping a sung
 * line for minutes (measured: ~90 repeats become ~30).
 * @param {{ model: string, audio: string, language?: string | null, prompt?: string }} opts
 */
export const sonaArgs = ({ model, audio, language, prompt }) => [
  'transcribe', model, audio,
  '-l', language ? language.split('-')[0].toLowerCase() : 'auto',
  '--max-text-ctx', '64',
  ...(prompt ? ['--prompt', prompt] : []),
];

/**
 * One sentence per line, with whisper's loops folded: a phrase of up to 12
 * words said three times or more running ("Música Música Música", a sung line
 * over and over, "A CIDADE NO BRASIL" hallucinated over a backing track) and a
 * sentence repeated back to back become one, marked "(…)". Sung passages
 * mostly are such loops.
 * @param {string} text
 */
export const tidyTranscript = (text) => {
  const words = `${text.replace(/\s+/g, ' ').trim()} `.replace(/(?<!\S)((?:\S+ ){1,12}?)\1{2,}/giu, '$1(…) ').trim();
  /** @type {string[]} */
  const lines = [];
  for (const sentence of words.split(/(?<=[.!?…)])\s+(?=\p{Lu})/u)) {
    const prev = lines.at(-1);
    if (prev !== undefined && fold(prev.replace(/ \(…\)$/, '')) === fold(sentence)) {
      if (!prev.endsWith(' (…)')) lines[lines.length - 1] = `${prev} (…)`;
    } else lines.push(sentence);
  }
  return `${lines.join('\n')}\n`;
};

/**
 * Transcribe a recording. Throws one line: the install hint when the tool or
 * the model is missing, else what the tool said.
 * @param {string} audio
 * @param {{ cmd: string, model: string, language?: string | null, prompt?: string }} opts
 */
export const transcribe = (audio, { cmd, model, language, prompt }) => {
  if (!existsSync(cmd) || !existsSync(model)) throw new Error(INSTALL_HINT);
  const run = spawnSync(cmd, sonaArgs({ model, audio, language, prompt }), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.error || run.status !== 0) {
    const reason = run.error?.message ?? (run.stderr.trim().split('\n')[0] || `exit ${run.status}`);
    throw new Error(`the transcriber failed: ${reason}`);
  }
  return tidyTranscript(run.stdout);
};

/**
 * Downloads already filed as classes: the `source` in each
 * `classes/<project>/<class>/class.json`.
 * @param {string} dir the classes folder
 * @returns {string[]}
 */
export const classSources = (dir) => {
  /** @param {string} path */
  const subdirs = (path) => {
    try {
      return readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(path, d.name));
    } catch {
      return [];
    }
  };
  return subdirs(dir).flatMap(subdirs).flatMap((d) => {
    try {
      return [JSON.parse(readFileSync(join(d, 'class.json'), 'utf8')).source];
    } catch {
      return [];
    }
  });
};
