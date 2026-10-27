---
tag: pitch
appetite: small
status: draft
source: conversation 2026-10-27, after the wait band shipped (v0.17.0)
slice_id: C
hard_dependency: pitch A (three plain verbs) merged first; both touch cli.mjs, session-start.mjs, README
---

# Pitch: the status line retires

**Bet:** Remove the status-line cue in a day, give every user their own status line back, and fold `cueTags` into `waitTopics`.

**Why it matters:** The wait band does what the cue did and more, and the owner had the cue off anyway. The cue's machinery (a `settings.json` rewrite, a shim, a pinned cue, three settings, a first-run offer) is the most invasive thing oliba installs.

---

## Boundaries

**JBTD:** As someone who said yes to the status line, I want my own status line back untouched when oliba drops its cue, so updating never breaks my terminal. Baseline today: `settings.json` `statusLine` points at `~/.oliba/statusline.mjs`, which runs the previous one (`statusLinePrevious`) and appends a card.

**Out:**
- Any change to the wait band beyond dropping `--clear-cue`.
- A replacement ambient cue (toast, sound).
- Touching a `statusLine` that doesn't point at oliba's shim.

## Elements

- **Give the status line back, once** (`lib/store.mjs:239`, the existing settings-rewrite pattern). At session start, if `statusLine.command` contains the shim path: back up `settings.json`, restore `statusLinePrevious` as the command (or delete the key when there was none), then delete the shim. Idempotent. Silent unless it fails; on failure leave everything as is and say so in one line.
- **Delete the cue** (`lib/statusline.mjs`, its test, `lib/store.mjs:120-165` cue and cooldown, `lib/cli.mjs:1204` `current-cue`, `clear-cue`, `statusline-install`, study lock if only the cue used it). `rate` loses `--clear-cue` (`lib/cli.mjs:246`), and the band stops passing it (`hooks/wait-band.tsx:112`).
- **One topics setting.** `cueTags` values migrate into `waitTopics` when `waitTopics` is empty; `cueEnabled`, `cueDelayMinutes`, `statusLineOffered` leave config. `/oliba:config` and the review skill lose their cue sections (`skills/config/SKILL.md:3`, review's cue-answer mode).
- **First-run offer goes** (`lib/session-start.mjs:45`). Session start no longer asks about a status line.

## Risks

**Rabbit holes:** `study-resolve` orders grill, topic, cue answer, plain. Dropping the cue branch must not change how a topic argument resolves.

**Domain knowledge:**
- `cueTags` lives in oliba's own `config.json`; `waitTopics` is a plugin userConfig in Claude Code settings. Confirm a hook can write `pluginConfigs` safely, or migrate by telling the user the one value to set.
- Users who installed the shim from lull-n-learn days: the existing migration at `lib/store.mjs:240` already moved them to `.oliba`. Check the restore covers both paths.

## Acceptance

1. With `statusLine` pointing at the shim and a `statusLinePrevious`, one session start leaves `statusLine.command` equal to the previous command, a backup beside `settings.json`, and no shim file.
2. With the shim and no previous, the `statusLine` key is gone; a `statusLine` that isn't oliba's is byte-for-byte unchanged.
3. No `statusline`, `current-cue`, `clear-cue` or `cue*` setting in code, skills or README; `rate` takes no `--clear-cue`.
4. `waitTopics` carries the old `cueTags` values (or the user was told once how to set them).
5. `node --test lib/*.test.mjs` and `claude plugin test .` pass; version 0.19.0, which also removes pitch A's alias skills.

---

_Drafted by Claude (scribe)._
