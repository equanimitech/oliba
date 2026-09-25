export const meta = {
  name: 'syllabus',
  description: 'Map a topic into ordered modules with prerequisites and starter cards. With args.targetNode, deepen that one node instead (used by /teach). Returns data only and saves nothing: /syllabus and /teach persist the result with `cli.mjs lesson-save`.',
  phases: [
    { title: 'Calibrate', detail: 'Assess existing knowledge and work context' },
    { title: 'Scout', detail: 'Research the topic from multiple angles' },
    { title: 'Map', detail: 'Synthesize into a knowledge graph' },
    { title: 'Deepen', detail: 'Only with targetNode: research one node and generate cards' },
  ],
}

// --- Args normalization ---
// Handle: plain string ("topic"), object {topic}, or object {topic, existingProject: {id}}
// The skill passes full args; direct Workflow() calls may pass a string or partial object.

if (typeof args === 'string') {
  args = { topic: args }
}
if (!args.topic) {
  throw new Error('syllabus requires a topic — pass it as args or args.topic')
}

// When existingProject is just {id: "..."}, load the full project from disk via an agent.
if (args.existingProject && args.existingProject.id && !args.existingProject.nodes) {
  const loaded = await agent(
    `Read the oliba project with ID "${args.existingProject.id}" from disk.

Run this command:
\`\`\`bash
node -e 'const d=process.env.OLIBA_DIR||process.env.LULL_N_LEARN_DIR||require("os").homedir()+"/.oliba";const p=require(d+"/projects.json")[process.argv[1]];console.log(JSON.stringify(p??null))' '${args.existingProject.id}'
\`\`\`

Return the FULL project JSON as-is. If not found, return null.`,
    { label: 'load-project', schema: { type: 'object', properties: { project: {} }, required: ['project'] } }
  )
  if (loaded && loaded.project) {
    args.existingProject = loaded.project
  }
}

const CALIBRATION_SCHEMA = {
  type: 'object',
  properties: {
    knownConcepts: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concepts the learner already knows, inferred from cards and work context',
    },
    gaps: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concepts the learner is missing or weak on',
    },
    needsScout: {
      type: 'boolean',
      description: 'True if this is a new topic or the existing map is stale and needs fresh research',
    },
    levelAssessment: {
      type: 'string',
      description: 'One-sentence assessment of the learner\'s current level on this topic',
    },
    isLibraryOrFramework: {
      type: 'boolean',
      description: 'Whether the topic is a specific library or framework (affects Context7 usage)',
    },
  },
  required: ['knownConcepts', 'gaps', 'needsScout', 'levelAssessment', 'isLibraryOrFramework'],
}

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          prerequisites: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'description'],
      },
    },
    sourcesCited: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['web', 'context7', 'agent-knowledge', 'user-file'] },
          reference: { type: 'string' },
          contribution: { type: 'string' },
        },
        required: ['type', 'reference', 'contribution'],
      },
    },
  },
  required: ['concepts', 'sourcesCited'],
}

const MAP_SCHEMA = {
  type: 'object',
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          starterCards: {
            type: 'array',
            description: '1-2 starter cards: what the node is and how it relates to a neighbour',
            items: {
              type: 'object',
              properties: {
                front: { type: 'string' },
                back: { type: 'string' },
              },
              required: ['front', 'back'],
            },
          },
        },
        required: ['id', 'title', 'description', 'starterCards'],
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Prerequisite node ID' },
          to: { type: 'string', description: 'Dependent node ID' },
        },
        required: ['from', 'to'],
      },
    },
    suggestedStart: { type: 'string', description: 'Node ID of the best starting point' },
  },
  required: ['nodes', 'edges', 'suggestedStart'],
}

const DEEPEN_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          front: { type: 'string' },
          back: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          layer: { type: 'string', enum: ['starter', 'comprehension', 'application', 'analysis'] },
        },
        required: ['front', 'back', 'tags', 'layer'],
      },
    },
    guide: {
      type: 'string',
      description: 'Markdown study guide section for this node (200-500 words)',
    },
    research: {
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['web', 'context7', 'agent-knowledge', 'user-file'] },
              reference: { type: 'string' },
              contribution: { type: 'string' },
            },
            required: ['type', 'reference', 'contribution'],
          },
        },
        synthesis: { type: 'string' },
        excluded: { type: 'array', items: { type: 'string' } },
        references: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['image', 'video', 'diagram'] },
              url: { type: 'string', description: 'Source URL (image/video) or empty for diagrams' },
              alt: { type: 'string', description: 'Descriptive alt text' },
              title: { type: 'string', description: 'For videos: the video title' },
              timestamp: { type: 'string', description: 'For videos: start timestamp (e.g. "2:34")' },
              svg: { type: 'string', description: 'For diagrams: inline SVG markup' },
              contribution: { type: 'string', description: 'What this reference adds to the node' },
            },
            required: ['type', 'contribution'],
          },
          description: 'Visual references: images found via web, videos from YouTube/educational platforms, agent-generated diagrams',
        },
      },
      required: ['sources', 'synthesis', 'excluded', 'references'],
    },
  },
  required: ['cards', 'guide', 'research'],
}

// --- Phase 1: Calibrate ---

phase('Calibrate')

const calibration = await agent(
  `You are calibrating a learner's knowledge level on "${args.topic}".

Analyze these inputs and produce a structured assessment:

EXISTING CARDS (what the learner has already studied):
${JSON.stringify(args.existingCards || [], null, 2)}

EXISTING PROJECT STATE (prior syllabus work on this topic):
${JSON.stringify(args.existingProject || null, null, 2)}

WORK CONTEXT (what the learner has been building recently):
${args.workContext || 'No work context available.'}

TARGET NODE (user-requested focus, if any): ${args.targetNode || 'None — choose autonomously.'}

SCOPE (confirmed with the user — follow it exactly, never narrow or widen it): ${args.scope || 'The full topic as named.'}

USER-STATED LEVEL (from pre-flight question, if provided): ${args.userLevel || 'Not provided — infer from cards, project state, and work context.'}

Rules:
- When userLevel is provided, use it as the primary signal for levelAssessment. It overrides inferences from cards/context.
- Set needsScout=true if no project exists or the map needs expanding.
- Use work context to infer what the learner has been exposed to even without cards.
- isLibraryOrFramework=true if the topic names a specific technology (React, FSRS, Elixir, etc).`,
  { label: 'calibrate', schema: CALIBRATION_SCHEMA }
)

log(`Level: ${calibration.levelAssessment}`)
log(`Known: ${calibration.knownConcepts.length} concepts | Gaps: ${calibration.gaps.length}`)

// --- Phase 2: Scout (conditional) ---

// Deepening a node of an existing map (/teach): the map stays as it is.
const deepenOnly = Boolean(args.targetNode && args.existingProject && args.existingProject.nodes && args.existingProject.nodes.length)

let scoutResults = []

if (calibration.needsScout && !deepenOnly) {
  phase('Scout')
  log(`Scouting "${args.topic}" from multiple angles`)

  const scoutTasks = [
    () => agent(
      `Broad survey of "${args.topic}". Map the conceptual landscape: what are the core subtopics, how do they relate, what does a learner need to know? Draw on your training knowledge.

The learner's current level: ${calibration.levelAssessment}
Known concepts: ${calibration.knownConcepts.join(', ') || 'None'}
Gaps: ${calibration.gaps.join(', ') || 'Unknown'}

Return the key concepts you identify with their descriptions and prerequisites.`,
      { label: 'survey', phase: 'Scout', schema: SCOUT_SCHEMA }
    ),
    () => agent(
      `Search the web for the concept landscape of "${args.topic}". Find authoritative sources, prerequisite relationships, and concepts that a ${calibration.levelAssessment} learner should know.

Use WebSearch (via ToolSearch) to find current information. Focus on:
- Authoritative tutorials and documentation
- Concept maps or learning paths others have created
- Common prerequisites and learning sequences
${(args.preferredSources && args.preferredSources.length > 0) ? `\nPRIORITY SOURCES (user-requested — search these first and weight them heavily):\n${args.preferredSources.map(s => `- ${s}`).join('\n')}\n` : ''}
Return the concepts found with source citations.`,
      { label: 'web-search', phase: 'Scout', schema: SCOUT_SCHEMA }
    ),
  ]

  if (calibration.isLibraryOrFramework) {
    scoutTasks.push(() => agent(
      `Look up current documentation for "${args.topic}" using Context7.

Use ToolSearch to find the context7 tools (resolve-library-id then query-docs). If the library isn't found, return what you know from training.

Extract the key concepts, API surface, and learning sequence from the docs.`,
      { label: 'context7', phase: 'Scout', schema: SCOUT_SCHEMA }
    ))
  }

  for (const source of (args.sources || [])) {
    scoutTasks.push(() => agent(
      `Read and summarize "${source}" for concepts relevant to "${args.topic}".

Use the Read tool to read the file. Extract:
- Key concepts explained in the source
- How they relate to each other
- What prerequisite knowledge the source assumes

Return the concepts with citations back to the source file.`,
      { label: `read:${source.split('/').pop()}`, phase: 'Scout', schema: SCOUT_SCHEMA }
    ))
  }

  scoutResults = (await parallel(scoutTasks)).filter(Boolean)
  log(`${scoutResults.length} scouts returned`)
}

// --- Phase 3: Map ---

const existingNodes = args.existingProject ? JSON.stringify(args.existingProject.nodes) : 'None'
const existingEdges = args.existingProject ? JSON.stringify(args.existingProject.edges) : 'None'

if (!deepenOnly) phase('Map')
const mapResult = deepenOnly
  ? { nodes: args.existingProject.nodes, edges: args.existingProject.edges || [] }
  : await agent(
  `Synthesize a knowledge graph for "${args.topic}".

SCOUT RESULTS (research from multiple angles):
${JSON.stringify(scoutResults, null, 2)}

EXISTING NODES (from prior project, if any):
${existingNodes}

EXISTING EDGES:
${existingEdges}

SCOPE (confirmed with the user — the map must cover exactly this): ${args.scope || 'The full topic as named.'}

CALIBRATION:
- Level: ${calibration.levelAssessment}
- Known: ${calibration.knownConcepts.join(', ') || 'None'}
- Gaps: ${calibration.gaps.join(', ') || 'Unknown'}

Rules:
- Each node is a concept subtopic (not too broad, not too narrow — "ownership rules" not "Rust" or "the Drop trait's implementation details").
- Edges are prerequisite relationships: from → to means "from" should be studied before "to".
- Generate short UUIDs for node IDs (8 hex chars, like "a1b2c3d4").
- If updating an existing graph, preserve existing node IDs and add new nodes. Don't remove nodes that have cards attached.
- starterCards: 1-2 per NEW node (none for existing nodes): "What is X?" and "How does X relate to Y?". The front demands production, the back is 1-2 sentences. No project: or node: tags.
- suggestedStart: the best first node (fewest prerequisites, foundational).
- Node descriptions: one sentence, what the learner will understand after deepening this node.`,
  { label: 'synthesize', schema: MAP_SCHEMA }
)

if (!deepenOnly) log(`Map: ${mapResult.nodes.length} nodes, ${mapResult.edges.length} edges`)

// --- Phase 4: Deepen (pipeline) ---

// Map only, unless a target node is named: then deepen exactly that one (k=1).
const target = args.targetNode
  ? mapResult.nodes.find(n => n.id === args.targetNode) ||
    mapResult.nodes.find(n => String(n.title || '').toLowerCase().includes(String(args.targetNode).toLowerCase()))
  : null
if (args.targetNode && !target) log(`No node matches "${args.targetNode}"; nothing deepened`)
const toDeepen = target ? [{ id: target.id, title: target.title }] : []

if (toDeepen.length > 0) {
  phase('Deepen')
  log(`Deepening ${toDeepen[0].title}`)

  const deepened = await pipeline(
    toDeepen,
    (node) => agent(
      `Deep research on "${node.title}" within the topic "${args.topic}".

Node description from the map: ${(mapResult.nodes.find(n => n.id === node.id) || {}).description || node.title}

The learner's level: ${calibration.levelAssessment}
What they already know: ${calibration.knownConcepts.join(', ') || 'Nothing yet'}

Research this concept thoroughly:
- Use WebSearch (via ToolSearch) for authoritative, current sources
- If this is a library/framework concept, try Context7 (via ToolSearch) for docs
- Draw on your training knowledge for foundational explanations
${(args.preferredSources && args.preferredSources.length > 0) ? `\nPRIORITY SOURCES (user-requested — search these first and weight them heavily):\n${args.preferredSources.map(s => `- ${s}`).join('\n')}\n` : ''}
Return a comprehensive but focused research summary. This will feed card generation and a study guide, so include:
- Core definitions and mental models
- How this concept connects to related concepts in the graph
- Concrete examples and worked problems
- Common mistakes and misconceptions
- Edge cases or subtle points

Be thorough but stay focused on this one node.

Additionally, search for visual references that would help a learner understand this concept:
- IMAGES: Search for diagrams, illustrations, or reference images. For regulatory/exam topics, look for official signs and symbols. For cooking/craft topics, look for technique photos. For games/strategy, generate board-state diagrams as SVG.
- VIDEOS: Search for YouTube or educational videos that explain this concept well. Include the video title, URL, and a useful start timestamp if the video is long.
- DIAGRAMS: For spatial or structural concepts, generate an inline SVG diagram that illustrates the key relationships or positions.

Use WebFetch (via ToolSearch) to verify that image URLs are valid before including them.

Return references in the research.references array. Each entry needs a type (image/video/diagram), the contribution it makes, and the URL or SVG content. Aim for 1-3 references per node — quality over quantity. Skip references if no genuinely useful visual exists for this concept.`,
      { label: `research:${node.title}`, phase: 'Deepen' }
    ),
    (research, node) => agent(
      `Generate spaced-repetition cards and a study guide section for "${node.title}" (topic: "${args.topic}").

RESEARCH:
${research}

LEARNER LEVEL: ${calibration.levelAssessment}
KNOWN CONCEPTS: ${calibration.knownConcepts.join(', ') || 'None'}
EXISTING CARD FRONTS (avoid duplicates): ${(args.existingCards || []).map(c => c.front).join(' | ') || 'None'}

CARD GENERATION RULES:
- Layer cards by difficulty:
  - starter: "What is X?" definitional + "How does X relate to Y?" relational (2-3 cards)
  - comprehension: paraphrase, explain in own words, identify components (2-3 cards)
  - application: procedural drills, "given X, what happens?", worked examples (1-2 cards)
  - analysis: compare/contrast, edge cases, "why not Y instead?" (1-2 cards)
- Each card: one atomic idea. The front is a question that demands production (not recognition).
- The back is a concise, correct answer (2-4 sentences max).
- Tag each with 1-2 short kebab-case theme tags (e.g. "garantie-decennale"). Do NOT add project: or node: tags; the save step adds the canonical ones.
- Skip anything covered by existing card fronts.
- Card fronts and backs can contain markdown (links, code blocks, emphasis).

STUDY GUIDE RULES:
- Write for a learner returning to refresh, not a first-time reader (they'll have the cards).
- Use markdown: headers, lists, tables, code blocks, inline links.
- For visual domains, use mermaid diagrams or ASCII art.
- Keep it 200-500 words.
- Include links to authoritative sources (web URLs).
- Cover: key concepts, relationships, worked examples, common mistakes.
- If the research includes visual references (research.references), mention them in the guide:
  - For images: reference them by alt text ("See the diagram of X")
  - For videos: include a markdown link with title and timestamp
  - For diagrams: embed the SVG inline in the guide markdown

RESEARCH TRANSPARENCY:
- List every source consulted with what it contributed.
- Explain how you combined the sources.
- Note what you considered and excluded, with reasons.`,
      { label: `generate:${node.title}`, phase: 'Deepen', schema: DEEPEN_SCHEMA }
    )
  )

  const validDeepened = deepened
    .map((result, i) => result && { nodeId: toDeepen[i].id, nodeTitle: toDeepen[i].title, ...result })
    .filter(Boolean)

  log(`Generated ${validDeepened.reduce((sum, d) => sum + d.cards.length, 0)} cards across ${validDeepened.length} nodes`)

  return {
    saved: false,
    persist: 'NOT SAVED YET. Pipe this result to: node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" lesson-save --topic "<topic>" (or --project <id>), then confirm with project-get.',
    calibration: {
      levelAssessment: calibration.levelAssessment,
      knownConcepts: calibration.knownConcepts,
      gaps: calibration.gaps,
    },
    map: mapResult,
    deepened: validDeepened,
    isNew: calibration.needsScout,
  }
}

return {
  saved: false,
  persist: 'NOT SAVED YET. Pipe this result to: node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" lesson-save --topic "<topic>" (or --project <id>), then confirm with project-get.',
  calibration: {
    levelAssessment: calibration.levelAssessment,
    knownConcepts: calibration.knownConcepts,
    gaps: calibration.gaps,
  },
  map: mapResult,
  deepened: [],
  isNew: calibration.needsScout,
}
