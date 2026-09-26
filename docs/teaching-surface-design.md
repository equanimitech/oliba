# Teaching Surface: /read and /lesson

## TL;DR

- **Goal:** Add an acquisition layer between `/deep-lesson` (mapping) and `/study` (retrieval). Two skills: `/read` teaches one deepened node conversationally; `/lesson` walks a learning path across multiple nodes in prerequisite order.
- **Key decisions:** Deepened-only (uses research already produced by `/deep-lesson`, no live research); Socratic walk-through (explain → comprehension check → adjust); light trace persisted per node so `/study` can prioritize recently-read cards; topological sequencing for `/lesson`; no workflows — both skills are pure conversation.
- **Open questions:** Whether the comprehension signal granularity (strong/partial/weak) is enough or if per-chunk signals would be more useful for `/study` prioritization.
- **Cascades:** Adds `readTrace` field to project nodes; modifies `/study` to read traces for card prioritization; adds `read-trace` CLI subcommand.

---

## 1. Theoretical Grounding

Young's Principle #3 (Directness): learn by engaging directly with the material. Principle #6 (Feedback): immediate correction when understanding goes sideways. Principle #8 (Intuition): build mental models through explanation, not memorization.

The current plugin flow has a gap:

```
/deep-lesson  →  [nothing]  →  /study
   map              ???         retrieve
```

`/deep-lesson` researches and maps. `/study` tests recall. Between them, the learner has no way to acquire the knowledge — to actually read, understand, and build a mental model before being quizzed. The study guide artifact is a reference sidebar (200-500 words per node, written "for a learner returning to refresh"), not a teaching experience.

`/read` and `/lesson` fill the gap:

```
/deep-lesson  →  /read or /lesson  →  /study
   map              acquire             retrieve
```

This completes the Ultralearning cycle: metalearning (map) → directness (acquire) → retrieval (test) → retention (schedule).

From Young's 2026 reflection:

> "AI can make this harder [directness] by offering comfortable simulations instead of uncomfortable reality."

The Socratic design is the safeguard: comprehension checks demand thinking, not passive reading. The agent teaches *from* the material, not *at* the learner.

---

## 2. The Two Entry Points

### /read — one node, one conversation

```
/read <topic>: <node title>
/read code de la route: limitations de vitesse
```

Teaches a single deepened node conversationally. Loads the node's `guide` (markdown content) and `research` (sources, synthesis) from the project. The agent teaches from these — it doesn't read them aloud, it uses them as source material for a Socratic walk-through.

**Requires:** The node must be `deepened` (has guide + research). If the node is only `mapped`, the skill says: "That node hasn't been researched yet. Run `/deep-lesson <topic>: <node>` to deepen it first."

**Duration:** 5-15 minutes per node. The learner can stop at any point.

**Output:** A `readTrace` on the node recording what was covered and how it went.

### /lesson — a learning path

```
/lesson <topic>
/lesson code de la route
```

Walks a learning path across multiple deepened nodes in prerequisite order. The thin orchestrator: loads the project, computes the sequence, runs the `/read` teaching logic on each node with natural stopping points between them.

**Sequencing:**
1. Topologically sort all deepened nodes by the prerequisite graph (edges)
2. Filter out nodes already read (`readTrace` exists) and nodes at `mastered` status
3. Present the path: "Three nodes to cover: **Limitations de vitesse** → **Le conducteur** → **Conditions difficiles**. Ready?"
4. Teach each node using the Socratic loop
5. Between nodes: a natural pause — "That's speed limits. Next is the driver — reaction time, alcohol, visual scanning. Continue?"

**Duration:** Variable — however many nodes the learner wants to cover in one sitting. Stopping between any two nodes is always fine.

**When all deepened nodes are read:** "Everything that's been researched is covered. `/deep-lesson <topic>` to deepen more nodes."

---

## 3. The Socratic Walk-Through

For a single node, the teaching interaction follows this loop:

### Step 1: Hook

One concrete scenario or question that makes the concept feel necessary. Not a quiz — an invitation to think.

> "Tu roules à 130 sur l'autoroute et il commence à pleuvoir. Tu dois ralentir — mais à combien ?"

The hook comes from the node's guide content — pick the most surprising or counterintuitive point and lead with it.

### Step 2: Explain

First chunk of the guide content, rewritten conversationally. Not a wall of text — 2-3 paragraphs max per chunk. Use the guide's tables, formulas, and examples but present them in the flow of conversation, not as a reference dump.

The agent draws on:
- `node.guide` — the markdown study guide (primary)
- `node.research.sources` — for authoritative links and context
- `node.research.synthesis` — for how concepts connect

### Step 3: Check

A comprehension question that demands thinking, not yes/no. The question should test whether the learner built the right mental model, not whether they memorized a fact.

Good checks:
- "What do you think happens if you try to use the value after moving it?" (Rust ownership)
- "Tu es en permis probatoire sur l'autoroute par temps de pluie — quelle limite ?" (Code de la route)
- "If Black plays ...a6 before developing, what is Black preventing?" (Sicilian Defense)

Bad checks:
- "Does that make sense?" (yes/no, no production)
- "What's the speed limit on a highway?" (pure recall, that's what `/study` is for)

### Step 4: Adjust

Based on the learner's response:

- **Solid understanding:** Acknowledge, bridge to the next chunk. "Exactly — and this is why [next concept] works the way it does."
- **Partial understanding:** Re-explain from a different angle with a new example. Don't repeat the same explanation louder.
- **Misconception:** Name the misconception directly, explain why it's wrong, then provide the correct model. "That's the most common mistake — people expect the reductions to stack, but the non-cumulation rule says..."

### Step 5: Repeat

Steps 2-4 repeat until the node's material is covered. A typical node (200-500 word guide) breaks into 2-4 chunks.

### Step 6: Bridge

Connect this node to what comes next in the graph. One sentence that plants the seed for the next node without teaching it.

> "C'est pour ça que les distances de sécurité existent — le temps de réaction c'est le sujet du prochain noeud, Le conducteur."

If there is no next node (standalone read), bridge to the cards instead: "Your cards from this node are primed for `/study`."

### Language

The teaching language matches the node's content language. Code de la route nodes are in French → the Socratic loop runs in French. A Rust ownership node in English → the loop runs in English. The agent follows the guide content's language, not the user's prompt language.

### What it is NOT

- Not a quiz (that's `/study`)
- Not scored (no "you got 3/4 right")
- Not a lecture (the agent doesn't monologue — it checks after every chunk)
- Not a wall of text (2-3 paragraphs max between checks)
- Not reading the guide aloud (the agent teaches from it, adapting to responses)

---

## 4. The Light Trace

### Data model

New field on each project node: `readTrace`. Null until the node is read.

```json
{
  "readAt": "2026-08-28T14:00:00Z",
  "chunks": 4,
  "comprehension": "partial",
  "gaps": ["non-cumul probatoire+pluie"]
}
```

| Field | Type | Description |
|---|---|---|
| `readAt` | ISO8601 | When the node was read |
| `chunks` | number | How many chunks the teaching covered |
| `comprehension` | `"strong"` \| `"partial"` \| `"weak"` | Soft signal from the comprehension checks |
| `gaps` | string[] | Specific concepts that needed re-explanation |

**Comprehension levels:**
- `strong` — all comprehension checks passed on the first attempt
- `partial` — needed re-explanation on some chunks but got there
- `weak` — struggled throughout, multiple re-explanations needed

The agent sets comprehension based on the conversation, not a formula. It's a qualitative signal, not a score.

**Gaps** are specific concepts, not categories. "non-cumul probatoire+pluie" is a gap; "speed limits" is not.

### CLI subcommand

```
node cli.mjs read-trace <projectId> <nodeId> \
  --comprehension partial \
  --gaps "non-cumul probatoire+pluie,braking distance formula" \
  --chunks 4
```

Sets the `readTrace` on the node and writes the project back.

### Trace lifecycle

- A node's trace is written once, at the end of a `/read` session for that node
- Running `/read` on an already-read node overwrites the trace (the learner is re-reading, which means the first pass wasn't enough — update the signal)
- `/lesson` writes one trace per node it covers
- The trace is never deleted by the system — only overwritten by a new read

---

## 5. How /study Uses the Trace

Two nudges, both lightweight. FSRS stays the scheduling authority.

### Nudge 1: Recently-read priority

Cards from nodes read in the last 48 hours get sorted to the front of the due batch. When `/study` calls `due --limit 10`, cards with a recent `readTrace.readAt` on their node appear first.

**Why 48 hours:** Strike while the iron is hot. You just learned this — retrieve it now while the memory is fresh. After 48 hours, FSRS scheduling takes over fully.

**Implementation:** The `due` command already sorts by `fsrs.due`. Add a secondary sort: among cards that are due, those whose node has `readTrace.readAt` within 48 hours come first. This requires looking up the card's `project:<id>` and `node:<id>` tags.

### Nudge 2: Weak-comprehension boost

Cards tagged to nodes with `comprehension: "partial"` or `"weak"` get a slight scheduling boost — they appear earlier than FSRS alone would schedule. Cards from nodes with `comprehension: "strong"` get no adjustment.

**Implementation:** When sorting due cards for display, cards from weak-comprehension nodes sort earlier in the batch. No FSRS state is mutated — the card's stored `fsrs.due` stays clean. The sort key is: `[hasRecentTrace, hasWeakTrace, hasGapMatch, fsrs.due]`.

### Nudge 3: Gap-targeted cards

When `readTrace.gaps` names a concept that appears in a card's front or back text, that card gets the same priority boost as Nudge 1 (sorted to front of batch), regardless of when the read happened.

**Implementation:** Fuzzy substring match of each gap string against card front/back text. Only applies to cards in the same node.

### What does NOT change

- FSRS state is never mutated by the trace
- Cards from un-read nodes schedule normally — no penalty for not reading
- The nudges are sort-order and display-time adjustments, not algorithm changes
- If a card isn't due, the trace doesn't make it due early (no new-card-surfacing beyond FSRS)

---

## 6. Skill Files

### skills/read/SKILL.md

```
/read <topic>: <node title>
/read code de la route: limitations de vitesse
```

Steps:

1. Parse `$ARGUMENTS` for topic and node title (split on `:`)
2. Find the project:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-list
   ```
   Match by topic (case-insensitive substring).
3. Load the project:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-get <projectId>
   ```
4. Find the node by title (case-insensitive substring match)
5. **Guard:** If the node's status is not `deepened`, `learning`, or `mastered` — say "That node hasn't been researched yet. Run `/deep-lesson <topic>: <node>` first." and stop.
6. **Guard:** If the node has no `guide` content — say "That node was deepened but has no study guide. Run `/deep-lesson <topic>: <node>` to regenerate." and stop.
7. Lock the status line cue:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-lock
   ```
8. Run the Socratic walk-through (Section 3). Use `node.guide` as primary material, `node.research` for sources and synthesis, `node.description` for context.
9. After the walk-through, write the trace:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" read-trace <projectId> <nodeId> \
     --comprehension <level> --gaps "<gap1>,<gap2>" --chunks <n>
   ```
10. Unlock the status line cue:
    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-unlock
    ```
11. Close: "Your cards from **<node title>** are primed for `/study`." — one line, no summary stats.

If the learner stops mid-way, still write the trace with whatever was covered. Set comprehension based on what was observed so far.

### skills/lesson/SKILL.md

```
/lesson <topic>
/lesson code de la route
```

Steps:

1. Parse `$ARGUMENTS` for topic
2. Find and load the project (same as `/read` steps 2-3)
3. Compute the learning path:
   a. Collect all deepened nodes
   b. Filter out nodes where `readTrace` already exists (unless the user says `/lesson <topic> --all` to re-read everything)
   c. Topologically sort by the prerequisite graph (edges)
   d. If no unread deepened nodes remain: "Everything researched is covered. `/deep-lesson <topic>` to deepen more." and stop.
4. Present the path: "**N nodes** to cover: **Node A** → **Node B** → **Node C**. Ready?"
5. Lock the status line cue
6. For each node in the path:
   a. Run the Socratic walk-through (Section 3)
   b. Write the trace for this node
   c. If not the last node: "That's **<node>**. Next: **<next node>** — <one-line description>. Continue?"
   d. If the learner says stop: write traces for what was covered, unlock, close warmly
7. After the last node: unlock, close: "You've covered **N nodes**. Your cards are primed for `/study`."

### skills/study/SKILL.md (modification)

In the `due` command call, add support for trace-aware sorting. The `/study` skill itself doesn't change its interaction — the prioritization happens in the CLI's `due` command.

After the review session, in the existing project-node suggestion logic: if a card rated `again` or `hard` belongs to a node that was recently read, mention it differently:

> "You read **<node>** earlier. The gap was around **<gap text>**. `/read <topic>: <node>` to revisit."

This replaces the current "/deep-lesson when ready" suggestion for nodes that are already deepened and read.

---

## 7. CLI Additions

### New subcommand: read-trace

```
node cli.mjs read-trace <projectId> <nodeId> \
  --comprehension strong|partial|weak \
  --gaps "gap1,gap2" \
  --chunks 4
```

Sets `node.readTrace` on the specified node and writes the project back.

**Behavior:**
- Overwrites any existing `readTrace` on the node
- `--gaps` is optional (empty string or omitted = no gaps)
- `--chunks` is required
- `--comprehension` is required, must be one of: `strong`, `partial`, `weak`
- Prints the updated project to stdout

### Modified subcommand: due

Add trace-aware sorting when computing due cards:

1. For each due card, look up its `project:<id>` and `node:<id>` tags
2. Sort key: `[hasRecentTrace, hasWeakTrace, hasGapMatch, fsrs.due]`
   - `hasRecentTrace`: node's `readTrace.readAt` within 48 hours
   - `hasWeakTrace`: node's `comprehension` is `"partial"` or `"weak"`
   - `hasGapMatch`: any `readTrace.gaps` entry substring-matches the card's front or back
3. Cards matching any boost criterion sort before cards that don't; within each group, sort by `fsrs.due`

FSRS state is never mutated. These are sort-order adjustments only.

---

## 8. Equanimitech Alignment

| Principle | Verdict | Evidence |
|---|---|---|
| Local-First Ownership | pass | Trace stored in same local `projects.json` |
| Holistic Control | pass | Learner chooses when to read, which node, when to stop |
| Peripheral Presence | pass | Teaching is pull-only — `/read` is deliberate, never pushed |
| Attentional Granularity | pass | Chunks are 2-3 paragraphs; checks break the flow into digestible pieces |
| Bounded Experiences | pass | One node per `/read`; `/lesson` has natural stopping points between nodes |
| Strategic Friction | pass | Comprehension checks slow down passive consumption |
| Fade-by-Design | pass | The Socratic approach teaches the learner to ask their own questions |
| Downstream Allocation | pass | Learner decides topic, node, pace; agent handles pedagogical sequencing |

### Anti-guilt inheritance

- No "you haven't read these nodes yet" messaging
- No progress bars or completion percentages
- Stopping mid-read is always fine
- Re-reading a node is always fine (trace overwrites cleanly)
- `/lesson` names the path but never counts "2 of 5 complete"
- Un-read nodes carry no penalty in `/study` scheduling

---

## 9. Walked Example: Code de la Route

Current state: 16 nodes, 2 deepened (Limitations de vitesse, Le conducteur), 14 mapped.

### /read code de la route: limitations de vitesse

```
Agent: Tu roules à 130 sur l'autoroute et il se met à pleuvoir.
       Tu dois ralentir — mais à combien ?

User:  110 ?

Agent: Exact — 130 → 110 par temps de pluie. La logique : on retire
       20 km/h sur autoroute et voie express, pas en agglomération
       (déjà basse).

       Voici le tableau complet :

       | Type de voie    | Sec | Pluie | Brouillard < 50 m |
       |-----------------|-----|-------|--------------------|
       | Agglomération   | 50  | 50    | 50                 |
       | Hors agglo      | 80  | 80    | 50                 |
       | Voie express    | 110 | 100   | 50                 |
       | Autoroute       | 130 | 110   | 50                 |

       Le brouillard dense écrase tout à 50, partout.

       Maintenant : tu es en permis probatoire, autoroute, pluie.
       Quelle limite ?

User:  100 ? Parce que la pluie réduit encore la limite probatoire ?

Agent: Piège classique — non-cumul. Ta limite probatoire autoroute
       c'est 110. La réduction pluie donnerait aussi 110. On ne
       cumule pas : tu restes à 110. On prend la plus contraignante
       des deux, qui se trouve être la même.

       Maintenant, les distances. À 130 km/h sur route sèche,
       la distance de freinage c'est environ (130 ÷ 10)² = 169 m.
       Et le temps de réaction ajoute ~36 m. Donc distance d'arrêt
       totale ?

User:  ~205 m

Agent: Oui, environ 205 m — plus de deux terrains de foot pour
       s'arrêter complètement. Sur route mouillée, la distance
       de freinage double.

       → readTrace: { comprehension: "partial",
                      gaps: ["non-cumul probatoire+pluie"],
                      chunks: 3 }
```

### /lesson code de la route

```
Agent: Deux noeuds à couvrir :
       Limitations de vitesse → Le conducteur. Prêt ?

User:  Oui

       [Socratic walk-through of Limitations de vitesse]

Agent: Ça c'est la vitesse. Le prochain noeud c'est Le conducteur
       — temps de réaction, alcool, exploration visuelle. On continue ?

User:  Oui

       [Socratic walk-through of Le conducteur]

Agent: Tu as couvert les deux noeuds recherchés. Tes cartes sont
       prêtes pour /study.
```

### /study (after reading)

Cards from Limitations de vitesse and Le conducteur appear first in the due batch (read within 48h). The non-cumul card gets extra priority (it matched a gap). The `/study` interaction itself is unchanged — same loop, same scoring, same anti-guilt rules.

---

## 10. Walked Example: Sicilian Defense (hypothetical)

After `/deep-lesson sicilian defense`, the project might have:

```
Open Sicilian Basics (deepened)
  → Najdorf Variation (deepened)
  → Dragon Variation (mapped)
  → Sveshnikov (mapped)
Anti-Sicilians (deepened)
```

### /read sicilian defense: najdorf

```
Agent: Black plays 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3
       and now ...a6. Why a6 before developing a piece?

User:  To prevent Bb5?

Agent: That's one half. It prevents Bb5+ and Nb5. But ...a6 does
       more — it prepares ...e5 (kicking the knight) and ...b5
       (queenside expansion). It's a multipurpose move that doesn't
       commit to a pawn structure yet.

       The Najdorf is about flexibility. Black delays choosing
       between ...e5 (English Attack territory) and ...e6
       (Scheveningen-like) until White commits first.

       What does Black give up by playing ...a6 instead of
       developing immediately?

User:  A tempo?

Agent: Right — one tempo. In the Sicilian, Black trades tempi for
       structural advantages. The asymmetric pawn structure (c-file
       for Black, d-file for White) means Black gets dynamic
       counterplay that compensates for being slightly behind in
       development.

       → readTrace: { comprehension: "strong", gaps: [], chunks: 3 }
```

### /lesson sicilian defense

```
Agent: Deux noeuds recherchés à couvrir :
       Open Sicilian Basics → Najdorf Variation.
       Anti-Sicilians est aussi recherché mais sans prérequis commun.
       On commence par les bases ? Prêt ?
```

---

## 11. Files Touched

| File | Change |
|---|---|
| `skills/read/SKILL.md` | **New** — per-node Socratic teaching |
| `skills/lesson/SKILL.md` | **New** — multi-node learning path orchestrator |
| `skills/study/SKILL.md` | **Modified** — trace-aware suggestion after weak cards |
| `lib/cli.mjs` | **Modified** — add `read-trace` subcommand, trace-aware `due` sorting |
| `skills/deep-lesson/SKILL.md` | **Modified** — artifact gets `assets` capability declaration |
| `workflows/deep-lesson.js` | **Modified** — Deepen agents fetch references (WebFetch pages, find images/videos, generate diagrams); upload image assets post-publish |
| `.claude-plugin/plugin.json` | **Modified** — bump version |
| `THEORY.md` | **Modified** — add Directness/Feedback/Intuition mapping for /read and /lesson |
| `docs/design.md` | **Modified** — add teaching surface + material pipeline to architecture diagram |

No new data files. `readTrace` lives on each node inside `projects.json`. Visual references live in `node.research.references[]` and as artifact assets.

---

## 12. Material Pipeline (deep-lesson enhancement)

`/read` and `/lesson` teach from whatever material deep-lesson produces. Today that's text-only guides + source citations. To make teaching genuinely effective across domains, deep-lesson's Deepen phase needs to produce richer material.

### What changes in deep-lesson

**Reference fetching.** The Deepen research agents already find URLs via WebSearch. They should also:
1. **WebFetch** the actual pages to extract content — not just cite the URL, but read the source
2. **Find visual references** — images, diagrams, illustrations relevant to the node
3. **Find video references** — educational videos (YouTube, course platforms) that teach the concept well

**New fields on the node's research object:**

```json
{
  "research": {
    "sources": [...],
    "synthesis": "...",
    "excluded": [...],
    "references": [
      {
        "type": "image",
        "url": "https://...",
        "alt": "Panneau de limitation à 50 km/h en agglomération",
        "assetId": "a1b2c3d4...",
        "contribution": "Visual of the standard speed limit sign"
      },
      {
        "type": "video",
        "url": "https://youtube.com/watch?v=...",
        "title": "Les limitations de vitesse expliquées",
        "timestamp": "2:34",
        "contribution": "Clear walkthrough of the probatoire non-cumul rule"
      },
      {
        "type": "diagram",
        "svg": "<svg>...</svg>",
        "alt": "Sicilian Defense: Najdorf position after 5...a6",
        "contribution": "Board position at the key branching point"
      }
    ]
  }
}
```

**Reference types:**

| Type | Source | Stored as |
|---|---|---|
| `image` | WebSearch → WebFetch | Uploaded as artifact asset (`assetId`), referenced by URL in the artifact |
| `video` | WebSearch for YouTube/educational content | URL + title + optional timestamp — linked in the artifact, not embedded |
| `diagram` | Agent-generated (SVG for chess positions, traffic layouts, process flows) | Inline SVG in the guide, also in the artifact |

**Domain heuristics for what to fetch:**

| Domain signal | Visual references to seek |
|---|---|
| Regulatory/exam (code de la route, certifications) | Signs, symbols, dashboard indicators, zone diagrams |
| Cooking/craft | Technique stages, ingredient identification, finished dish appearance |
| Chess/games | Board positions at key moments, piece placement patterns |
| Programming | Architecture diagrams, data flow visualizations |
| Music | Notation, fingering charts, waveform shapes |
| Abstract/conceptual | Agent-generated diagrams (mermaid, SVG) preferred over found images |

### Artifact asset pipeline

The deep-lesson artifact currently declares no capabilities. To carry visual references:

1. Declare the `assets` capability on the artifact
2. During the Deepen phase, when an image reference is found:
   a. WebFetch the image to a temp file
   b. After the artifact is published, upload it via `upload_asset`
   c. Reference it in the artifact HTML by the asset URL
3. For agent-generated diagrams (chess positions, traffic layouts): inline SVG in the HTML — no asset upload needed
4. For videos: render as a linked card in the artifact (thumbnail + title + timestamp), not embedded

### How /read uses visual references

When teaching from a node that has visual references:
- The agent mentions the visual: "Regarde le panneau dans le guide — c'est le panneau de limitation standard."
- Points to the artifact node: "Open the **Limitations de vitesse** node in the study guide to see the diagram."
- For video references: "There's a good video walkthrough of this — the link is in the study guide node."

The terminal stays conversational. The artifact carries the visuals. `/read` bridges between them.

### Video references (future)

Videos are referenced, not consumed, in v0. The Deepen agent finds relevant videos and cites them with title + timestamp. The artifact links to them.

Future: a `/watch` skill that structures video-based learning — watch a segment, pause, discuss what you saw, check comprehension. Same Socratic loop, different medium.

---

## 13. Deferred

- **Adaptive chunking** — automatically adjusting chunk size based on the learner's pace (start with fixed 2-4 chunks per node, calibrate later)
- **Cross-node callbacks** — during `/lesson`, referencing something from a previous node's check ("remember the non-cumul rule? Same principle applies here")
- **Feynman escalation from /read** — if a check fails multiple times, escalate to "explain this concept in your own words" (v1's Feynman mode, wired into the teaching surface)
- **Re-read suggestions** — `/study` proactively suggesting `/read` when a card from a read node is missed multiple times
- **Audio/dictation mode** — for domains where typing is awkward (driving theory while walking)
