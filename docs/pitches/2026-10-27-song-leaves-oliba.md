---
tag: pitch
appetite: medium
status: draft
source: usage audit in equanimitech/.claude/attently/oliba-command-usage.md; Rafa's decisions 2026-10-27
slice_id: B
hard_dependency: name for the new plugin
---

# Pitch: song leaves oliba

**Bet:** Move `/oliba:song`, the song pages and the player into their own small plugin, so oliba is only spaced repetition.

**Why it matters:** Song is a practice player, not spaced repetition. Its 30 songs were filed in a three-week burst, yet it threads singing through oliba's projects, pages and CLI.

---

## Boundaries

**JBTD:** As a singer with a teacher, I want my teacher's recordings, lyrics and loops in one place, so I practise a song without opening a flashcard tool. Baseline today: songs live as resources of the "Teoria musical para cantores" project in `~/.oliba/projects.json`, with pages under `~/.oliba/songs/`.

**Out:**
- New song features.
- Class: pitch A cuts it.
- The music-theory cards. They stay in oliba as an ordinary topic.

## Elements

- **New repo** `equanimitech/<name>`: `skills/song`, `lib/lyrics.mjs`, `lib/inbox.mjs`, and the song parts of `lib/resources.mjs` and `lib/home.mjs`, with its own data folder and marketplace entry.
- **One-shot data move.** On first run, copy `~/.oliba/songs/<topic>/` and the song entries from `projects.json` into the new folder. Leave the originals until the owner has opened every song once.
- **oliba cleanup.** Remove the `song-*`, `songs`, `inbox` commands (`lib/cli.mjs:1369`), the repertoire on the front door (`lib/home.mjs:73`) and `migrateSongs` (`lib/store.mjs:11`).

## Risks

**Rabbit holes:** `lib/resources.mjs` mixes song types with other resource kinds. Split by type, don't rewrite.

**Domain knowledge:**
- Do song pages link to lessons or the glossary? Those links break once the two live apart.
- Which project tags songs carry, so the move finds them all (4 resource entries in `projects.json` today).

## Acceptance

1. All 30 songs open from the new plugin with audio, lyrics, section loops and slowdown working.
2. oliba has no song code, commands or repertoire; `node --test lib/*.test.mjs` passes.
3. `~/.oliba/songs/` stays in place until the owner deletes it.

---

_Drafted by Claude (scribe)._
