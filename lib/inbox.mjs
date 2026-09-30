// @ts-check
/**
 * Audio files on disk: their length, and (for `cli.mjs inbox`) which new ones
 * in Downloads could belong to a song.
 */
import { execFileSync } from 'node:child_process';

/**
 * Seconds of audio, read with macOS's `afinfo`; null elsewhere or when it can't tell.
 * ponytail: macOS only; the page reads `audio.duration` itself, so other systems just lose grouping by length.
 * @param {string} file
 * @returns {number | null}
 */
export const audioDuration = (file) => {
  if (process.platform !== 'darwin') return null;
  try {
    const info = execFileSync('afinfo', [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });
    const m = info.match(/estimated duration:\s*([\d.]+)/);
    return m ? Math.round(Number(m[1]) * 100) / 100 : null;
  } catch {
    return null;
  }
};
