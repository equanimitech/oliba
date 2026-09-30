---
name: class
description: Turn the recording of a class (a Voice Memo AirDropped to ~/Downloads) into notes on the learner's songs, cards and learning records, transcribed on the Mac with Vibe's whisper model so nothing leaves the machine. Proposes each item from what was said in class and asks one question per item. Use when the user runs /class, says "I recorded my class", "transcribe the lesson", "grab the notes from today's class", "a aula de hoje", "gravei a aula", or has a long recording in Downloads that /song flagged as a class.
---

# /class — what was said in class, kept

A class recording holds the corrections that evaporate by next week. You transcribe it on this Mac, read it, and propose what to keep, one item at a time: a note on a song, a card, a corrected belief. The learner confirms each. Nothing leaves the machine.

If `node` is not found, tell the user in one line to install the Node.js LTS from nodejs.org, then restart Claude Code, and stop.

Speak the project's `language` throughout (the singing project is pt-BR). The person who teaches is "they" in your head; in pt-BR say "quem dá a aula", or just "na aula" ("isso apareceu na aula"), unless the learner has said "a professora" or "o professor": then use what they said.

## Which project

Same as `/song`: if `node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" songs` lists any, use that `projectId`; otherwise take the one music project from `project-list` (for this learner: "Teoria musical para cantores", `2a2619ef-b358-4f6b-a4ff-df4f14071c77`). Several candidates: ask once with `AskUserQuestion`.

## Consent, once per project

Read the project (`project-get <projectId>`). If `classConsent` is not `true`, ask **one** `AskUserQuestion`, in `language`:

- "Quem dá a aula sabe que ela é gravada e que a gravação fica só no seu Mac?" Options: "Sim", "Ainda não".

"Sim":

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" class-consent <projectId>
```

Never ask again for this project. "Ainda não": one line ("Sem problema: nada foi transcrito. Quando combinarem, é só rodar `/class` de novo.") and stop. Transcribe nothing.

## Find the recording

`$ARGUMENTS` may be a path to the audio: use it. Otherwise:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" inbox
```

Take the groups with `kind: "class"` (a recording of 10 minutes or more, from the last 14 days, not yet filed). One: use it. Several: ask which with one `AskUserQuestion` (the file names). None: "Nenhuma gravação de aula em Downloads. No iPhone: Gravador → Compartilhar → AirDrop para o Mac, depois `/class` de novo." and stop. Never look in the Voice Memos folder: macOS blocks it.

## Transcribe

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" class-add <projectId> "<path>"
```

Run it with a 10-minute timeout: a 45-minute class takes about a minute. It transcribes with Vibe's `sona` (whisper.cpp, large-v3-turbo) on this Mac, copies the audio and writes `transcript.txt` under `~/.oliba/classes/<topic>/<date>-<name>/`, adds the transcript to the project's `sources` (so `/teach` reads it too) and prints `{ dir, audio, transcript, source }`. The download stays in `~/Downloads` and `inbox` no longer lists it.

A failure is one line: say it in `language` and stop. "Transcribing needs Vibe: brew install --cask vibe…" means Vibe or its model is missing: pass the install line on as is.

## Read

Read `transcript` in full, beside:

- `project-get <projectId>`: `nodes` (titles and ids), the `records` whose `supersededBy` is null, `termLanguage`;
- `songs`, then `song-get <songId>` for each song the class talked about (its `notes`, `sections`).

The transcript is one sentence per line. Whisper can't tell voices apart and can't transcribe singing well:

- Lines of lyrics, repeated syllables ("lá lá lá", vocalize runs), `Música (…)` and anything marked `(…)` (a loop) are singing or playing. Skip them.
- Keep only what was said: instructions, corrections, explanations, praise with a reason.
- Words are sometimes misheard ("terça e dó maior" for "terças em dó maior"). Fix a word only when the project's node or song titles make it certain; otherwise quote it as heard and let the learner correct it in their answer.
- Never invent a key, a time, a section or a song that the transcript doesn't name.

## Propose, one question per item

List the items to yourself first, in class order, then ask **one** `AskUserQuestion` per item (one question per call), in `language`. Quote the words from the class; say where it would go. Options: "Guardar", "Pular". The learner types their own wording via "Other"; keep theirs.

| Heard in class | Ask | On "Guardar" |
|---|---|---|
| a note on a song ("não respira antes do refrão") | "Flor de Lis: anotar 'não respira antes do refrão'?" | `song-set <songId> --notes "<old notes>\n<new line>"`: the old notes stay, the new line goes at the end, in the class's words |
| a part of a song named with its times | "Flor de Lis: trecho 'Ponte' de 1:32 a 1:50?" | `song-set <songId> < patch.json` with every section, old and new. No times in the transcript: ask the learner for them in the same question, or skip |
| a fact or a rule they taught ("de dó para si bemol é um tom abaixo") | "Virar cartão? Frente: 'De dó para si bemol, quantos tons?' Verso: 'Um tom inteiro abaixo.'" | `add --source class --tags project:<projectId>,node:<nodeId>,class:<date> --front "…" --back "…"` with the node whose title matches (Vocalizes, Transposição, Tons e semitons). No node matches: leave out `node:` |
| a correction of the learner ("você desafinou no si bemol") | "Registrar: 'desafina no si bemol da ponte'? Vira um cartão de contraste." | `record <projectId> --kind misconception --text "<the mistake>" --evidence "<their words from the class>" [--node <nodeId>] --front "<contrast question>" --back "<the right way, in their words>"`. It adds the card itself: no `add` |
| praise with a reason ("agora o apoio está certo") | "Registrar como conquista: 'sustenta o apoio na frase longa'?" | `record <projectId> --kind insight --text "…" --evidence "<their words>" [--node <nodeId>]` |

`<date>` is the `YYYY-MM-DD` at the start of the class folder's name. Cards are production questions answerable from memory, as in `/teach`: no options, the term kept as said in class.

Stop proposing when the items run out. If the learner answers "Pular" several times in a row, ask once whether to stop.

## Close

One line, in `language`: where the transcript is, and the next `/teach` when a node came up in class and has no lesson yet: "Transcrição em `<transcript>`. Próximo `/teach`: Transposição, que apareceu na aula." No summary, no count of notes, cards or classes.

## Rules (hard constraints)

- Local only. Never send the audio or the transcript to any service; never suggest a cloud transcriber.
- Nothing is transcribed before consent. Consent is asked once per project, never again.
- Never move, rename or delete the learner's downloads, and never read the Voice Memos folder.
- Every item is confirmed by one question. Nothing from a sung or played passage.
- Don't add syllabus nodes: the transcript is in `sources`; re-mapping is `/syllabus`'s job.
- No class page, no player for the recording, no sharing.
- Anti-guilt: no count of classes, notes or cards, no "last class", no "you haven't recorded", no streaks, no reminders.
