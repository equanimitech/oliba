// @ts-check
/**
 * Typed resources: things a project keeps beside its lessons, in
 * `project.resources: [{ id, type, ... }]`. The type decides the schema, the
 * page template, the `<oliba-*>` tags that page uses and what the page hands
 * back for review. Claude fills the JSON; the CLI renders every page.
 *
 * ponytail: one entry makes TYPES a named object, not a plugin system; it earns
 * its name when lessons move in as `type: 'lesson'`.
 */
import { escapeHtml, fold } from './text.mjs';

/**
 * @typedef {'guia' | 'base' | 'original'} VersionKind
 * @typedef {{ kind: VersionKind, file: string, key: string | null, duration: number | null, source: string | null }} SongVersion
 * @typedef {{ name: string, start: number, end: number }} Section
 * @typedef {'working' | 'repertoire' | 'retired'} SongStatus
 * @typedef {Object} Song
 * @property {string} id
 * @property {'song'} type
 * @property {string} slug fixed at creation; the page folder's name
 * @property {string} title
 * @property {string} artist
 * @property {string | null} spotify
 * @property {string | null} originalKey
 * @property {Section[]} sections
 * @property {string | null} lyrics plain text
 * @property {string | null} syncedLyrics LRC, timed to the LRCLIB record
 * @property {number | null} lrclibId
 * @property {number | null} lyricsDuration seconds, of the LRCLIB record
 * @property {string | null} cifra
 * @property {string | null} notes
 * @property {SongVersion[]} versions key lives here: the teacher re-sends songs in new keys
 * @property {SongStatus} status
 * @property {string} createdAt
 */

export const VERSION_KINDS = /** @type {const} */ (['guia', 'base', 'original']);
export const SONG_STATUSES = /** @type {const} */ (['working', 'repertoire', 'retired']);
/** Fields `song-set` may change. Versions change through `song-version`. */
export const SONG_EDITABLE = ['title', 'artist', 'spotify', 'originalKey', 'sections', 'lyrics', 'cifra', 'notes', 'status'];

// --- Keys and times ---

const LETTERS = /** @type {Record<string, number>} */ ({ c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 });
const SOLFEGE = /** @type {Record<string, number>} */ ({ do: 0, re: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 });

/**
 * Pitch class of a key name: letters (Bb, F#m, A♭) or pt solfège (si bemol, fá#).
 * @param {string | null | undefined} key
 * @returns {number | null} 0–11, or null when it can't be read
 */
export const pitchClass = (key) => {
  const k = fold(key ?? '').replace(/♯/g, '#').replace(/♭/g, 'b');
  const m = k.match(/^(do|re|mi|fa|sol|la|si)\s*(sustenido|bemol|#|b)?/) ?? k.match(/^([a-g])(#|b)?(?![a-z]{2})/);
  if (!m) return null;
  const base = SOLFEGE[m[1]] ?? LETTERS[m[1]];
  const shift = m[2] === '#' || m[2] === 'sustenido' ? 1 : m[2] ? -1 : 0;
  return (base + shift + 12) % 12;
};

/**
 * Semitones from one key to another, the short way round (−6 to +5).
 * Derived at render, never stored.
 * @param {string | null} from @param {string | null} to
 */
export const semitones = (from, to) => {
  const a = pitchClass(from);
  const b = pitchClass(to);
  return a === null || b === null ? null : ((b - a + 18) % 12) - 6;
};

/**
 * Seconds from 42, "42", "0:42" or "1:05.5".
 * @param {unknown} t
 * @returns {number}
 */
export const seconds = (t) => {
  if (typeof t === 'number') return t;
  const m = String(t ?? '').trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : NaN;
};

/** 62.5 → "1:02". @param {number} t */
export const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * LRC lines → [{ t, text }], in time order; metadata tags like [ar:...] dropped.
 * @param {string | null} lrc
 */
export const parseLrc = (lrc) =>
  (lrc ?? '').split('\n')
    .map((line) => line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/))
    .filter((m) => m !== null)
    .map((m) => ({ t: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() }))
    .sort((a, b) => a.t - b.t);

// --- Validation ---

/** @param {unknown} v */
const blank = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim());

/**
 * Check a song, or a patch to one. Returns the first problem, in one line.
 * @param {Record<string, any>} song
 * @param {{ patch?: boolean }} [opts] a patch skips `required`
 * @returns {string | null}
 */
export const validateSong = (song, { patch = false } = {}) => {
  if (!patch) {
    for (const field of TYPES.song.required) if (blank(song[field])) return `a song needs "${field}"`;
  }
  for (const field of ['title', 'artist']) {
    if (field in song && blank(song[field])) return `"${field}" can't be empty`;
  }
  if (!blank(song.spotify) && !/^https:\/\//.test(song.spotify)) return '"spotify" must be an https link';
  if (!blank(song.originalKey) && pitchClass(song.originalKey) === null) return `can't read the key "${song.originalKey}": use Bb, F#m or si bemol`;
  if (song.status !== undefined && !SONG_STATUSES.includes(song.status)) return `"status" must be one of: ${SONG_STATUSES.join(', ')}`;
  if (song.sections !== undefined) {
    if (!Array.isArray(song.sections)) return '"sections" must be a list of { name, start, end }';
    for (const s of song.sections) {
      if (blank(s?.name)) return 'every section needs a "name"';
      const [start, end] = [seconds(s.start), seconds(s.end)];
      if (!(start >= 0) || !(end > start)) return `section "${s.name}" needs start < end, in seconds or m:ss`;
    }
  }
  if (song.versions !== undefined) {
    if (!Array.isArray(song.versions)) return '"versions" must be a list of { kind, file, key }';
    for (const v of song.versions) {
      if (!VERSION_KINDS.includes(v?.kind)) return `a version's "kind" must be one of: ${VERSION_KINDS.join(', ')}`;
      if (blank(v.file)) return 'every version needs a "file"';
      if (!blank(v.key) && pitchClass(v.key) === null) return `can't read the key "${v.key}": use Bb, F#m or si bemol`;
    }
  }
  return null;
};

// --- Rendering (HTML fragments; cli.mjs wraps them in the page template) ---

const LABELS = {
  pt: {
    guia: 'Guia', base: 'Base', original: 'Original', originalKey: 'Tom original', sameKey: 'tom original',
    speed: 'Velocidade', clear: 'Sem loop', sections: 'Trechos', lyrics: 'Letra', cifra: 'Cifra', notes: 'Notas',
    offset: 'Atraso da letra (s)', noAudio: 'Nenhum áudio ainda.', unplayable: 'Este navegador não toca este arquivo:',
    footer: 'A página toca os áudios da própria pasta: para levar ou enviar, leve a pasta inteira.',
    repertoire: 'Repertório', working: 'Em trabalho', repertoireGroup: 'Repertório', retired: 'Guardadas',
  },
  en: {
    guia: 'Guide', base: 'Backing', original: 'Original', originalKey: 'Original key', sameKey: 'original key',
    speed: 'Speed', clear: 'No loop', sections: 'Sections', lyrics: 'Lyrics', cifra: 'Chords', notes: 'Notes',
    offset: 'Lyrics delay (s)', noAudio: 'No audio yet.', unplayable: "This browser can't play this file:",
    footer: 'The page plays the audio in its own folder: to move or send it, take the whole folder.',
    repertoire: 'Repertoire', working: 'Working on', repertoireGroup: 'Repertoire', retired: 'Put away',
  },
};

/** @param {string | null | undefined} lang */
export const labels = (lang) => (fold(lang ?? '').startsWith('pt') ? LABELS.pt : LABELS.en);

/**
 * "Guia · Bb (−2 st)": the version's kind, its key and its distance from the original.
 * @param {SongVersion} v @param {string | null} originalKey @param {typeof LABELS.pt} L
 */
const versionLabel = (v, originalKey, L) => {
  const st = semitones(originalKey, v.key);
  const shift = st === null ? '' : st === 0 ? ` (${L.sameKey})` : ` (${st > 0 ? '+' : '−'}${Math.abs(st)} st)`;
  return `${L[v.kind]}${v.key ? ` · ${v.key}${shift}` : ''}`;
};

/**
 * Synced lyrics highlight only where their timing can be trusted: the original
 * recording, or a version within 3 s of the LRCLIB record's length.
 * @param {SongVersion} v @param {Song} song
 */
const inSync = (v, song) => v.kind === 'original'
  || (v.duration != null && song.lyricsDuration != null && Math.abs(v.duration - song.lyricsDuration) <= 3);

/**
 * The song page body: header, `<oliba-player>`, lyrics or cifra, notes.
 * Relative `src`: the page sits next to its audio.
 * @param {Song} song @param {string | null | undefined} lang
 */
const renderSong = (song, lang) => {
  const L = labels(lang);
  const e = escapeHtml;
  const lines = parseLrc(song.syncedLyrics);
  const figures = song.versions.map((v) =>
    `<figure${song.syncedLyrics && inSync(v, song) ? ' data-sync' : ''}>\n<figcaption>${e(versionLabel(v, song.originalKey, L))}</figcaption>\n<audio controls preload="metadata" src="${e(encodeURI(v.file))}"></audio>\n</figure>`);
  const sections = song.sections.map((s) =>
    `<button type="button" data-start="${s.start}" data-end="${s.end}">${e(s.name)} <span class="gloss">${clock(s.start)}–${clock(s.end)}</span></button>`);
  const player = song.versions.length
    ? [
      `<oliba-player data-unplayable="${e(L.unplayable)}">`,
      ...figures,
      '<p class="transport" hidden>',
      '<output class="clock">0:00.0</output>',
      `<label>${L.speed} <input class="rate" type="range" min="0.5" max="1" step="0.05" value="1"> <output class="rate">1.00×</output></label>`,
      '</p>',
      '<p class="loop" hidden>',
      `<button type="button" class="mark-a">A</button> <button type="button" class="mark-b">B</button> <button type="button" class="clear">${L.clear}</button> <output class="range"></output>`,
      '</p>',
      sections.length ? `<p class="sections" hidden>\n${sections.join('\n')}\n</p>` : '',
      '</oliba-player>',
    ].filter(Boolean).join('\n')
    : `<p class="note">${L.noAudio}</p>`;
  const lyrics = lines.length
    ? `<section class="lyrics">\n<h2>${L.lyrics}</h2>\n<div class="lrc">\n${lines.map((l) => `<p data-t="${l.t}">${e(l.text)}</p>`).join('\n')}\n</div>\n<p class="offset" hidden><label>${L.offset} <input class="offset" type="number" step="0.1" value="0"></label></p>\n</section>`
    : song.lyrics ? `<section class="lyrics">\n<h2>${L.lyrics}</h2>\n<pre>${e(song.lyrics)}</pre>\n</section>` : '';
  const originalKey = song.originalKey ? ` · ${L.originalKey}: ${e(song.originalKey)}` : '';
  return [
    `<p class="kicker"><a href="../index.html">${L.repertoire}</a></p>`,
    `<h1>${e(song.title)}</h1>`,
    `<p class="mission">${e(song.artist)}${originalKey}${song.spotify ? ` · <a href="${e(song.spotify)}">Spotify</a>` : ''}</p>`,
    '<div class="song">',
    `<div class="deck">\n${player}\n${song.cifra ? `<section class="cifra">\n<h2>${L.cifra}</h2>\n<pre>${e(song.cifra)}</pre>\n</section>` : ''}\n${song.notes ? `<section class="notes">\n<h2>${L.notes}</h2>\n<p>${e(song.notes).replace(/\n/g, '<br>')}</p>\n</section>` : ''}\n</div>`,
    lyrics,
    '</div>',
    `<p class="ask">${L.footer}</p>`,
  ].filter(Boolean).join('\n');
};

/**
 * The project's repertoire: songs grouped by status only. No dates, no counts.
 * @param {{ topic: string }} project @param {Song[]} songs @param {string | null | undefined} lang
 */
export const renderRepertoire = (project, songs, lang) => {
  const L = labels(lang);
  const e = escapeHtml;
  const groups = /** @type {const} */ ([['working', L.working], ['repertoire', L.repertoireGroup], ['retired', L.retired]]);
  const sections = groups.map(([status, name]) => {
    const items = songs
      .filter((s) => s.status === status)
      .sort((a, b) => fold(a.title).localeCompare(fold(b.title)))
      .map((s) => `  <li><a href="${e(s.slug)}/index.html">${e(s.title)}</a> <span class="gloss">${e(s.artist)}</span></li>`);
    return items.length ? `<h2>${name}</h2>\n<ul class="songs">\n${items.join('\n')}\n</ul>` : '';
  });
  return [
    `<p class="kicker"><a href="../../index.html">òliba</a> · ${e(project.topic)}</p>`,
    `<h1>${L.repertoire}</h1>`,
    ...sections,
  ].filter(Boolean).join('\n');
};

/**
 * The registry. `review: 'none'`: a song is a skill you keep, not a fact you
 * recall, so its page hands nothing back (lessons: quiz results → FSRS).
 */
export const TYPES = {
  song: {
    required: ['title', 'artist'],
    dir: 'songs',
    tags: ['oliba-player'],
    scripts: ['player.js'],
    review: 'none',
    validate: validateSong,
    render: renderSong,
  },
};
