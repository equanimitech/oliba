// @ts-check
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INSTALL_HINT, sonaArgs, tidyTranscript, transcribe, transcriber, vocabulary } from './classes.mjs';

/** @type {string} */
let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'oliba-classes-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/**
 * A stand-in for sona: records its arguments, prints what whisper printed on
 * a real mock class (speech, a looping sung line, the backing as "Música").
 * @param {string} folder @param {number} [code]
 */
const fakeSona = (folder, code = 0) => {
  const cmd = join(folder, 'sona');
  const model = join(folder, 'model.bin');
  writeFileSync(model, 'weights');
  writeFileSync(cmd, `#!${process.execPath}
require('node:fs').writeFileSync(${JSON.stringify(join(folder, 'args.json'))}, JSON.stringify(process.argv.slice(2)));
if (${code}) { console.error('Error: failed to decode audio'); process.exit(${code}); }
console.log(' Bom dia! Hoje vamos começar com o vocalize de terça e dó maior. Presta atenção: não respira antes do refrão. E o meu jardim da vida dessecou. E o meu jardim da vida dessecou. E o meu jardim da vida dessecou. Muito bem. Música Música Música Música');
`);
  chmodSync(cmd, 0o755);
  return { cmd, model };
};

test('Vibe is the default transcriber; config.transcriber overrides it', () => {
  assert.equal(transcriber({}).cmd, '/Applications/vibe.app/Contents/MacOS/sona');
  assert.match(transcriber({}).model, /Application Support\/github\.com\.thewh1teagle\.vibe\/ggml-large-v3-turbo\.bin$/);
  assert.deepEqual(transcriber({ transcriber: { cmd: '/x/sona', model: '/x/m.bin' } }), { cmd: '/x/sona', model: '/x/m.bin' });
});

test('sona gets the language as two letters (auto when unknown), a short text context and the vocabulary', () => {
  assert.deepEqual(sonaArgs({ model: 'm.bin', audio: 'a.m4a', language: 'pt-BR', prompt: 'vocalize, Flor de Lis' }),
    ['transcribe', 'm.bin', 'a.m4a', '-l', 'pt', '--max-text-ctx', '64', '--prompt', 'vocalize, Flor de Lis']);
  assert.deepEqual(sonaArgs({ model: 'm.bin', audio: 'a.m4a' }), ['transcribe', 'm.bin', 'a.m4a', '-l', 'auto', '--max-text-ctx', '64']);
  assert.equal(vocabulary(['Vocalizes', 'Transposição', 'vocalizes', '', 'Flor de Lis']), 'Vocalizes, Transposição, Flor de Lis');
  assert.ok(vocabulary(Array.from({ length: 50 }, (_, i) => `Nó número ${i}`)).length <= 220);
});

test('the transcript reads one sentence per line, with whisper loops folded', () => {
  assert.equal(
    tidyTranscript(' Bom dia! Hoje vamos cantar. E o meu jardim da vida dessecou. E o meu jardim da vida dessecou. E o meu jardim da vida dessecou. Muito bem. Música Música Música Música'),
    'Bom dia!\nHoje vamos cantar.\nE o meu jardim da vida dessecou. (…)\nMuito bem.\nMúsica (…)\n',
  );
  assert.equal(
    tidyTranscript('Na semana que vem a gente transpõe a música E a gente transpõe a música E a gente transpõe a música E a gente transpõe a música Bom dia!'),
    'Na semana que vem a gente transpõe a música E (…) a gente transpõe a música Bom dia!\n',
    'a phrase loop with no punctuation',
  );
  assert.equal(tidyTranscript('Que amei, que amei.'), 'Que amei, que amei.\n', 'said twice is not a loop');
});

test('transcribe runs the tool on the audio; a missing tool or model is the install line; a failure is one line', () => {
  const sona = fakeSona(dir);
  const text = transcribe('/a/aula.m4a', { ...sona, language: 'pt-BR', prompt: 'vocalize' });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'args.json'), 'utf8')), ['transcribe', sona.model, '/a/aula.m4a', '-l', 'pt', '--max-text-ctx', '64', '--prompt', 'vocalize']);
  assert.match(text, /^Bom dia!\nHoje vamos começar com o vocalize de terça e dó maior\.\nPresta atenção: não respira antes do refrão\.\nE o meu jardim da vida dessecou\. \(…\)\nMuito bem\.\nMúsica \(…\)\n$/);
  assert.throws(() => transcribe('/a.m4a', { cmd: join(dir, 'nope'), model: sona.model }), { message: INSTALL_HINT });
  assert.throws(() => transcribe('/a.m4a', { cmd: sona.cmd, model: join(dir, 'nope.bin') }), { message: INSTALL_HINT });
  const broken = fakeSona(mkdtempSync(join(dir, 'b-')), 1);
  assert.throws(() => transcribe('/a.m4a', broken), { message: 'the transcriber failed: Error: failed to decode audio' });
});

// A real run of Vibe's sona on a sentence macOS speaks. Opt in: OLIBA_REAL_SONA=1 node --test lib/classes.test.mjs
test('real: sona transcribes spoken Portuguese on this Mac', { skip: process.env.OLIBA_REAL_SONA !== '1' && 'set OLIBA_REAL_SONA=1 to run' }, () => {
  const tool = transcriber({});
  assert.ok(existsSync(tool.cmd) && existsSync(tool.model), INSTALL_HINT);
  const audio = join(dir, 'fala.aiff');
  execFileSync('say', ['-v', 'Luciana', '-o', audio, 'Hoje vamos fazer o vocalize e depois transpor a música um tom abaixo.']);
  const text = transcribe(audio, { ...tool, language: 'pt-BR', prompt: 'vocalize, transposição' });
  assert.match(text, /vocalize/i);
  assert.match(text, /tom abaixo/i);
});
