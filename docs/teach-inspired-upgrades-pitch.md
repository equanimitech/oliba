---
tag: pitch
appetite: two pitches, one week each (A ships first, B depends on A)
status: draft
source: docs/2026-09-25-field-report-teach-lessons.md; .claude/attently/teach-skill-comparison.md (Reversed / Decisions 2026-09-25; Distribution, syllabus, language); ~/.claude/skills/teach/
supersedes: [teach-inspired-upgrades-pitch.md (v2, one "big" pitch)]
hard_dependency: /deep-lesson v0.6.2 fixes (persist, project-update merge, scope follow-up, /study name lookup) land before A
---

# Pitches: four skills that install in one step, then /teach lessons

The v2 scope (skill cut + HTML lessons + grill + glossary) was already one full week. Adding install, `/syllabus` and language pushes it past a week, so it splits in two:

| | Pitch | Appetite | Slices | Ships |
|---|---|---|---|---|
| **A** | Install + four-skill cut + `/syllabus` | 1 week | 3: install · skill cut with terminal `/teach` · lazy syllabus | first |
| **B** | `/teach` HTML lessons, mission + language, records, grill, glossary | 1 week | 4: mission/language/records · lesson loop + quiz→card · follow-up · grill + glossary | after A |

A goes first. It is what a new user sees on day one, and B's `/teach` builds on A's skill names, hook text and lazy deepen.

---

## Pitch A: install in one step, four skills, `/syllabus`

**Bet:** In one week, a non-developer (Rafa's cofounder) installs lull alone from a 3-line README, gets offered the status line on first run, and sees four skills: `/syllabus`, `/teach`, `/study`, `/config`. `/syllabus` maps a topic without deepening it up front.

**Why it matters:** Today, installing means hand-editing JSON twice, once for `extraKnownMarketplaces` and once for a `statusLine` path into a versioned cache dir (`README.md:11-60`). The SessionStart hook still advertises `/answer`, `/sift`, `/card` and `/harvest` (`hooks/hooks.json:8`), and those three capture skills produced 0 of 533 cards. `/deep-lesson` deepens k nodes up front, which cost ~1.44M tokens for a map that never landed. The cofounder can't get past step one.

### Boundaries

**JBTD:** When someone tells me to try lull, I want to paste one thing and say yes once, so that I'm learning in the same session without asking a developer. Baseline: two manual `settings.json` edits, and a status-line path that breaks on every version bump (the cache path is `~/.claude/plugins/cache/equanimitech/lull-n-learn/<version>/`).

**Scope tiers:**

| Tier | Items |
|---|---|
| **must-have** | One-step install. First-run status-line offer and `/config` setup that composes with an existing status line. Node guard. Hook text lists the four skills. README install section of 3 lines or fewer. Skill cut: delete `/harvest` `/sift` `/card`, merge `/answer` into `/study`, merge `/read` + `/lesson` into a terminal `/teach`. Rename `/deep-lesson` → `/syllabus`, map only. `/teach` deepens one node lazily. |
| **should-have** | Replace the `python3` one-liner in the workflow with `cli.mjs project-get`, so Node is the only runtime. |
| **nice-to-have** | Status-line removal from `/config` (restores the previous command). |

**Out:**
- The Vercel `skills` CLI. It installs SKILL.md folders only, with no hooks, no status line, no `${CLAUDE_PLUGIN_ROOT}` and no Workflow. It is a later, lighter channel.
- `~/.lull-n-learn` → `~/.oliba`. It belongs to the òliba rename pitch, which stays a follow-up.
- Bundling or installing Node for the user.
- Everything in Pitch B (HTML lessons, mission, language, records, grill, glossary).

### Elements

- **One-step install** (`README.md`). The local CLI has `claude plugin marketplace add <source>` and `claude plugin install <plugin>@<marketplace>`. That gives one pasteable line: `claude plugin marketplace add equanimitech/claude-plugins && claude plugin install lull-n-learn@equanimitech`. In-session alternative: `/plugin marketplace add equanimitech/claude-plugins`, then `/plugin install lull-n-learn@equanimitech`. README install = the shell line, the slash-command line, and "restart Claude Code and say yes when it offers the status line." The `extraKnownMarketplaces` JSON and the status-line JSON block are deleted.
- **First-run offer** (`lib/session-start.mjs`, `hooks/hooks.json`). `session-start.mjs` reads `~/.claude/settings.json`. If `statusLine.command` doesn't reference `.lull-n-learn/statusline.mjs` and `config.statusLineOffered` is unset, it prints one line for Claude: offer once to show a due card in the status line, and on a yes run `/config statusline`. A no sets `statusLineOffered` and the offer never comes back. The echo becomes: `Skills: /syllabus (map a topic), /teach (learn one piece), /study (retrieval; also answers the status-line cue), /config (settings, status line).` *PDP: suggestion at the opportune moment, asked once, never nagging.*
- **Stable status-line path.** Each session start, the hook writes `~/.lull-n-learn/statusline.mjs`, a one-line shim that imports `${CLAUDE_PLUGIN_ROOT}/lib/statusline.mjs`. Settings point at the shim, so version bumps never break the path.
- **`/config statusline`** (`skills/config/SKILL.md`, new `cli.mjs statusline-install`). The CLI writes `statusLine` to `~/.claude/settings.json` as `"<process.execPath>" "~/.lull-n-learn/statusline.mjs"`, using the absolute Node path so nvm, pnpm and Homebrew all work. If a `statusLine` already exists, it saves that command to `config.statusLinePrevious` and doesn't overwrite it. `statusline.mjs` runs the previous command with the same stdin and prints `<theirs>  ↻ <cue>`. It back-ups `settings.json` before writing, writes atomically, and leaves every other key alone.
- **Node guard.** The native installer is a standalone binary (`~/.local/bin/claude` is Mach-O) and doesn't provide Node. The hook becomes `command -v node >/dev/null 2>&1 && node … || echo "lull-n-learn needs Node.js: tell the user in one line to install the LTS from nodejs.org, then restart Claude Code."` The status line is only installed when Node resolves. Skills that shell out to `cli.mjs` stop at the same message.
- **Four-skill cut** (`skills/{harvest,sift,card,answer,read,lesson}/`, `lib/cli.mjs:242-316,558`, `lib/store.mjs:54`, `.claude-plugin/plugin.json`, `THEORY.md`). Delete the six folders and the `inbox-*` commands, helpers and tests. Leave `inbox.json` on disk. `/study` resolves its arguments in a fixed order: `grill me on …` → grill (lands in B; until then, say it's coming), a known tag or project → filtered session, an active cue → score it (the old `/answer` body), otherwise a plain session. `/teach` in A is the `/read` Socratic loop plus `/lesson`'s prerequisite walk, in the terminal. Rewrite the plugin description ("cards extracted from your real work sessions" is false). In THEORY.md, drop Directness-by-harvest and move `/read`/`/lesson` mentions to `/teach`. Bump to `0.7.0`.
- **`/syllabus`** (`skills/deep-lesson/` → `skills/syllabus/`, `workflows/deep-lesson.js` → `workflows/syllabus.js`). It keeps Calibrate, Scout and Map, then stops: ordered modules, prerequisites, starter cards. The Deepen phase only runs when `args.targetNode` is set, with k=1. When `/teach` reaches a `mapped` node, it runs the workflow in that mode, persists the node, and teaches it. Weak-spot drill is not here. It is `/study` grill in B. *Ultralearning: metalearning map up front, directness at the point of use.*

### Risks

**Rabbit holes:**
- Composing status lines. A slow or failing previous command must not blank the cue. Give it a timeout (~500 ms). On error, print the cue alone.
- Writing `~/.claude/settings.json`. It's the user's file. Back it up, write atomically, touch only `statusLine`, and test with a fixture that has comments-free JSON plus unknown keys.
- `/study` has several entry points. Keep the fixed order, ask one question on a tie, and test the resolver.

**Off-sides:** Detecting and installing Node. A `/config` UI for every setting. Keeping `/deep-lesson` as an alias.

**Fat cut:** A migration for existing `/deep-lesson` projects (the data shape doesn't change). A settings.json schema validator.

**Domain knowledge:**
- The shell line assumes `claude` is on PATH. The native installer puts it in `~/.local/bin`. Verify this on a clean user account before calling it one step.
- `/teach` collides with Rafa's personal `~/.claude/skills/teach`. Check what a bare `/teach` resolves to.
- Plugin hooks run with `${CLAUDE_PLUGIN_ROOT}`, but `settings.json` doesn't expand it. That's why the shim exists.

### Acceptance

1. On a fresh macOS user with Claude Code (native installer) and Node, the cofounder follows the README alone and runs `/syllabus <topic>` in the same session. No JSON edited by hand.
2. The README install section is 3 lines or fewer.
3. The first session after install offers the status line once. Yes → `settings.json` has `statusLine` pointing at `~/.lull-n-learn/statusline.mjs`. No → the offer never appears again.
4. With an existing `statusLine`, both outputs show, and `config.statusLinePrevious` holds the old command.
5. After bumping the plugin version, the status line still works with no edits.
6. Without Node on PATH, the first session prints the one-line Node message and nothing crashes.
7. `skills/` contains exactly `syllabus`, `teach`, `study`, `config`. `cli.mjs` has no `inbox-*` command. The hook text, README table and plugin description name only those four. Tests pass. `plugin.json` reads `0.7.0`.
8. With a cue showing, `/study <answer text>` rates that card and clears the cue.
9. `/syllabus <topic>` deepens no node. `/teach` on a `mapped` node deepens that node only, then teaches it.

---

## Pitch B: `/teach` mission-first HTML lessons, in the learner's language

**Bet:** In one week, `/teach` gains a mission and two language fields, asked once. It teaches one skill per lesson as a single shareable HTML file with instant-feedback quizzes. Quiz items and corrected misconceptions become cards, and `/study` grill drills the weak spots.

**Why it matters:** The field run showed a ~30k-token lesson that Rafa used and shared beat the ~1.44M-token map. Lessons in French law also need terms kept as they are (« rupture brutale ») while teaching in the learner's language. Today `/read` just mirrors the node content's language.

### Boundaries

**JBTD:** When I need to get good at something by a date (six French legal domains before a discovery call), I want a short lesson aimed at my goal, in my language with the domain's own terms, that I can practise in the browser and share, with what I got wrong carried into `/study`, so that I get one win per sitting and keep it. Baseline: pre-flight asks level and sources, never *why* (`skills/deep-lesson/SKILL.md:31`). `read-trace` overwrites one grade per node (`lib/cli.mjs:485`), so corrected misconceptions vanish.

**Scope tiers** (cut from the bottom):

| Tier | Items |
|---|---|
| **must-have** | `project.mission`, `project.language`, `project.termLanguage`, asked once together. Learning records, evidence-gated, with supersession. Misconception → card. HTML lesson loop: self-contained file, inlined `lull.css` + `quiz.js`, instant feedback, `<details>` fallback, quiz item → card, local `index.html` per project. Follow-up mode. |
| **should-have** | Grill mode in `/study`, driven by records (Ultralearning's drill). Bilingual glossary: per project plus a derived global index, `_Avoid_` aliases, promoted on correct use. *Cut order: global index, then per-project glossary, then grill.* |
| **nice-to-have** | One printable reference sheet per project. One Wisdom/communities line per project. |

**Out:**
- Syncing quiz results from the page to FSRS. The page is stateless.
- Per-cwd workspace files or asset folders. State lives in `~/.lull-n-learn`, assets in the plugin.
- Progress bars, streaks, "lesson 3 of 8", and counts of anything.
- The full MISSION.md template. The mission is one line.
- Interactive boards and simulators.
- The òliba rename and `~/.oliba`.

### Elements

- **Mission + language** (`lib/cli.mjs:352,403,459`). `project-create --mission --language --term-language` and `project-set`. The first `/teach` or `/syllabus` on a project with no mission asks one `AskUserQuestion` with three questions: why, which language to be taught in, and which language the domain terms stay in (default: the source's). Lessons, questions and feedback use `language`. Domain terms appear in `termLanguage` with a translation next to them: « rupture brutale » (abrupt termination). *BCT 1.1 goal setting; PDP tailoring.*
- **Learning records.** `record <projectId> --kind prior|misconception|insight|mission-shift --text --evidence [--node|--lesson] [--supersedes <id>]` appends to `project.records[]`. Superseding marks the old record instead of deleting it. A record needs evidence: a correct use, a stated prior, or a corrected belief. Coverage is not evidence. A `misconception` also runs `add` with a card that contrasts the wrong model with the right one. *BCT 2.2 feedback on behaviour.*
- **Lesson loop** (`skills/teach/SKILL.md`, new `assets/lull.css`, `assets/quiz.js`). `/teach <topic>` finds or creates the project, and no map is required. It reads mission and records to pick one skill in the zone of proximal development, finds one primary source, and writes: knowledge, then quizzes, then an applied last step, then "ask me anything: `/teach <topic> ?`". `lesson-write <projectId> --title` reads the body from stdin and wraps it in one template string with the CSS and JS inlined. It writes `~/.lull-n-learn/lessons/<slug>/NNNN-<name>.html`, appends to `project.lessons[]`, regenerates the local `lessons/<slug>/index.html`, and `open`s the file (or prints the path when `open` isn't available). *PDP reduction.*
- **Quiz → card** (`lib/cli.mjs:148`). `quiz.js` handles `<fieldset class="quiz" data-answer>`: a click shows right or wrong plus a one-line reason, with no network and no storage. Every quiz also carries a `<details>` answer, so it still works where JS is stripped (email). For each item, `add --source teach --tags project:<slug>,lesson:<n> --ref <file>#q<n>`, with the front rewritten as a production question in `language`. The back expects the original term where the term is the point.
- **Follow-up mode** (from `skills/read/SKILL.md:55-101`, already merged in A). `/teach <topic> ?` runs the Socratic loop, in `language`. It still calls `read-trace` on map nodes (`traceBoost`, `lib/cli.mjs:118`). Every correction goes through `record`.
- **Grill + glossary** *(should-have)*. `/study grill me on <project|node>` picks targets from `misconception` records and weak cards. It asks for explain-back, then why and what-if chains, then transfer. Answers are typed and never scored aloud. Each gap becomes a record plus a card. `project.glossary[]` holds `{term, translation, definition, avoid[]}` and only gets an entry after correct use. `glossary-render` writes `lessons/<slug>/glossary.html` and a derived `~/.lull-n-learn/glossary.html` showing both languages. *BCT 8.1 rehearsal; 4.1 instruction on how.*

### Risks

**Rabbit holes:**
- A 4-option quiz item can't become a card by copying it. A bad rewrite becomes a trivia card. Put one worked example in SKILL.md.
- Language drift. A lesson may be sourced in French and taught in Portuguese, and the model might translate the terms. Put one worked example in SKILL.md showing a term kept in the original with its gloss.
- Template drift. Keep one template string. Lessons don't write `<head>`.

**Off-sides:** Page-to-FSRS sync. Grill as its own skill. Enforcing glossary terms inside card text. Missions tied to a zenborg area. Per-card language overrides.

**Fat cut:** ADR-style record numbering. A stored global glossary. Rewriting `traceBoost` to read records.

**Domain knowledge:**
- Inline `<script>` must run from `file://`. The `<details>` fallback covers email clients that strip JS.
- A published claude.ai artifact can't open `file://` links, which is why the index is local.

### Acceptance

1. The first `/teach <new topic>` asks mission, teaching language and term language once. `project-get` shows all three, and a second `/teach` asks nothing.
2. The lesson text is in `language`. Domain terms appear in `termLanguage` with a translation next to them.
3. `lesson-write` produces one `.html` file that works offline, with no external requests, and still works when copied anywhere alone. With JS disabled, every quiz answer is still reachable via `<details>`.
4. Each quiz item adds one card tagged `project:` + `lesson:`, with a no-options front in `language`. `index.html` links every lesson.
5. `record --kind misconception` appends a record and one contrast card. `--supersedes` keeps the old record, marked. Tests are in `lib/cli.test.mjs`.
6. No skill output shows a count of lessons, records, misconceptions or terms.
7. *(should-have)* `/study grill me on <project>` targets recorded misconceptions. A gap it finds leaves one record and one card.
8. *(should-have)* The glossary lists each term in the original with its translation. Terms appear only after correct use.

---

_Supersedes v2 (one "big" pitch). Follow-ups: òliba rename pitch (including `~/.lull-n-learn` → `~/.oliba`); a skills-only channel via the Vercel `skills` CLI; store tag cleanup (awaiting approval); reference sheet. Related: #7 (links in card content). Drafted by Claude (scribe)._
