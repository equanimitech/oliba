---
name: syllabus
description: Map a topic into ordered modules with prerequisites and starter cards, published as a study-guide artifact. Deepens nothing up front; /teach researches each node when the learner reaches it. Use when the user runs /syllabus, says "let's learn about X", "map this topic", "I want to study X", or "what should I learn first about X".
---

# /syllabus — draw the map first

The user names a topic, one pre-flight question calibrates level and sources, then the workflow researches and maps it: ordered modules, prerequisites, one or two starter cards per node. It stops there. Nodes are deepened one at a time by `/teach`, when the learner gets to them.

If `node` is not found, tell the user in one line to install the Node.js LTS from nodejs.org, then restart Claude Code, and stop.

## 1. Gather context

Run these in parallel to build the workflow args:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-list
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" list
git log --oneline -20 2>/dev/null
```

Parse the user's input:
- `/syllabus <topic>` → topic is the argument
- `/syllabus <topic> --sources file1,file2` → topic + source file paths
- `/syllabus <topic>: <node>` → the user wants to learn one node: say "`/teach <topic>: <node>` teaches it." and stop
- `/syllabus` with no argument → extend the map of the most recent project (use its topic)

If a project exists for this topic, also run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-get <projectId>
```

## 2. Pre-flight

Before dispatching, ask with `AskUserQuestion` — two questions in one call:

**Question 1 — Level** (single select):
- Header: "Level"
- Question: "How well do you know **<topic>**?"
- Options:
  - "Starting fresh" — never studied it, maybe heard the name
  - "Know the basics" — familiar with the main ideas but gaps in details
  - "Intermediate" — can discuss specific concepts, want to deepen
  - "Advanced" — looking to fill specific gaps or go deeper on subtopics

**Question 2 — Sources** (single select):
- Header: "Sources"
- Question: "Any specific sources to anchor on? (sites, books, URLs)"
- Options:
  - "No preference (Recommended)" — use best available
  - "Official docs / wiki" — prioritize canonical references

The user can always type a custom answer via "Other" (e.g. "lichess.org", "Marcella Hazan's cookbook").

Map the answers:
- `userLevel`: the selected level label (e.g. "Know the basics") or their custom text
- `preferredSources`: empty array if "No preference", otherwise parse the answer into a list of source names/URLs

**Scope is the user's call, never the workflow's.** Settle what the project covers before dispatching: one project for everything named, one project per part, or just one part. If the request or any reply about scope is ambiguous (e.g. "maybe a single one?" when several modules were named — a single project? a single module?), ask **one** follow-up with `AskUserQuestion` offering the concrete readings as options, then pass the confirmed answer as `scope`. Never forward a vague reply for the workflow to interpret.

**Mission and languages (once per project).** If there is no project yet, or its `mission` is null, first ask three questions in one `AskUserQuestion`, the first three `/teach` asks (not its "Sources": pre-flight Question 2 covers that): "Why" ("What do you want to be able to do with **<topic>**?", one line), "Language" ("Which language should I teach you in?", the conversation's language recommended) and "Terms" ("Which language should the field's own terms stay in?", the sources' language recommended). Store languages as BCP 47 codes (`fr`, `pt-BR`); "the sources' language" is left unset until `/teach` picks a primary source. Ask them even when the rest of the pre-flight is skipped, and never again once `mission` is set. Save them after step 4 with `project-set <projectId> --mission "<why>" --language <code> [--term-language <code>]`, or right away for an existing project.

**Skip the pre-flight** (dispatch immediately) when:
- Extending an existing project (`/syllabus` with no argument, or a topic whose project exists) — the project already encodes the level
- The user provided `--sources` explicitly on the command line

## 3. Dispatch the workflow

Say: "Mapping **<topic>**." (nothing else — no questions, no waiting)

Use the Workflow tool with the plugin workflow's name (never a `scriptPath`), passing `args` as a JSON object, not a string:
```
name: "oliba:syllabus-map"
args: {
  topic: "<topic>",
  sources: ["<path1>", "<path2>"],        // optional, from --sources flag
  existingProject: <project JSON or null>,
  existingCards: <cards array>,
  workContext: "<git log output + ls summary>",
  scope: "<confirmed scope, in plain words>", // from step 2; the workflow treats it as fixed
  userLevel: "<level from pre-flight>",    // optional, from step 2
  preferredSources: ["lichess.org", ...]   // optional, from step 2
}
```

## 4. Persist results

The workflow saves nothing. Its result carries `saved: false`; nothing exists in the store until this step succeeds. Always run this step when the workflow returns, even if you launched the workflow some other way.

Write the workflow result to a temp file and pipe it to `lesson-save`, which creates or updates the project, merges the map, creates every starter card with the canonical `project:<id>` and `node:<id>` tags, and links cards to nodes in one step:

```bash
# new project (no existing project for this topic)
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" lesson-save --topic "<topic>" --sources "<--sources paths and preferredSources, comma-separated>" < result.json
# existing project
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" lesson-save --project <projectId> < result.json
```

Decide new vs. existing from step 1 (`project-list`), not from `result.isNew`. It prints `{ projectId, created, nodeCount, cardCount, cardsAdded }`. A non-zero exit means nothing was saved: report the error and stop.

**Verify before going further.** Read it back:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-get <projectId>
```

Confirm the project exists, its `nodes` length equals `nodeCount`, and the sum of `nodes[].cardIds` lengths equals `cardCount`. If anything is missing, say plainly what didn't save and stop: do not publish, do not report success. Never report numbers you didn't read back from `project-get`.

## 5. Publish the artifact

Build and publish the knowledge map artifact from the verified `project-get` output, following the **Artifact Design** section below. If the project already has an `artifactUrl`, republish to the same file path (same URL). Otherwise publish a new artifact and save the URL to the project (`project-update` merges, so send only the changed field):

```bash
echo '{"artifactUrl":"<url>"}' | node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-update <projectId>
```

## 6. Report

Say: "**<topic>** — N nodes, M starter cards. [link to artifact] `/teach <topic>` starts at the beginning." with N and M taken from the verified `project-get` read-back.

Nothing else. The user comes back when ready.

---

## Artifact Design

The artifact is a **study guide**. Mapped nodes show title + description. Deepened nodes expand to show guide content and research transparency. The artifact is what you open between review sessions.

Use the `artifact-design` skill before building it.

**Key constraints:**
- Google Fonts for Inter and JetBrains Mono
- Mermaid graph at top (`<pre class="mermaid">`) showing concept nodes + prerequisite edges
- Node list below as hairline-bordered cells in a 1px-gap grid
- Deepened nodes expand via `<details>` to show: guide content first, then research transparency
- Each node gets an `id` attribute matching its node ID for anchor linking from card refs
- Theme-aware: light palette on `:root`, dark overrides per artifact convention
- Anti-guilt: no progress bars, no completion percentages, no "X of Y" counts
- Square corners, hairline rules, flat at rest, no shadows

**Palette (OKLCH):**

| Token | Value | Role |
|---|---|---|
| stone-50 | `oklch(0.985 0.003 60)` | Page ground (light) |
| stone-200 | `oklch(0.923 0.005 60)` | Hairline rules, borders |
| stone-400 | `oklch(0.709 0.008 60)` | Faint text, unmapped nodes |
| stone-600 | `oklch(0.444 0.010 60)` | Muted text, labels |
| stone-900 | `oklch(0.216 0.007 60)` | Body text |
| stone-950 | `oklch(0.147 0.005 60)` | Dark-mode ground |
| clay | `oklch(0.62 0.100 60)` | Accent, suggested node |
| enso-sage | `oklch(0.66 0.033 142)` | Mastered nodes |

**Node status styling:**

| Status | Light | Dark |
|---|---|---|
| unmapped | stone-400 text, stone-200 border | stone-400 text, stone-600 border |
| mapped | stone-900 text, stone-200 border | stone-50 text, stone-600 border |
| deepened | stone-900 text, clay border | stone-50 text, clay border |
| learning | stone-900 text, clay fill 10% | stone-50 text, clay fill 10% |
| mastered | stone-900 text, sage border | stone-50 text, sage border |
| suggested | clay border, clay text label | clay border, clay text label |

**Typography:** Inter for prose, JetBrains Mono for labels. Prose capped at 62ch.

**Layout:** Single centered track at 79ch. Phi spacing: `1.618rem` between nodes, `2.618rem` between sections.

**Structure:**

```html
<title>Syllabus: {topic}</title>

<pre class="mermaid">
  graph TD
    node1["Node Title"] --> node2["Node Title"]
</pre>

<section>
  <details id="{nodeId}">
    <summary>
      <span class="status-badge">mapped</span>
      <span class="node-title">Node Title</span>
      <span class="card-count">3 cards</span>
    </summary>
    <p class="description">One-line description...</p>

    <div class="guide">
      <!-- Rendered from node.guide markdown -->
    </div>

    <details class="research">
      <summary>Sources & reasoning</summary>
      <ul class="sources">
        <li><span class="source-type">web</span> Reference: contribution</li>
      </ul>
      <p class="synthesis">How sources were combined...</p>
      <details class="excluded">
        <summary>What was considered and excluded</summary>
        <ul>...</ul>
      </details>
    </details>
  </details>
</section>
```

Apply Mermaid `classDef` for status colors. Mark the suggested starting node distinctly.

**Guide content styling:** Prose in Inter, code in JetBrains Mono. Tables get hairline borders. Links use clay accent. Mermaid blocks render natively. Guide content capped at 62ch.
