# The AI Wait Gap

When an AI agent processes your request, you wait. Seconds stretch. Your hands idle. The impulse fires: open a browser tab, check Slack, scroll something. The gap is dead time, and it happens dozens of times a day.

This document synthesizes the research behind oliba's approach to the gap, drawing on Unwait's pioneering thesis, Scott Young's Ultralearning framework, and the landscape of tools that have tried to fill idle moments with learning.

## The Gap Is Real and Growing

AI-assisted work is increasingly agent-driven: Claude Code, Codex, Cursor, Devin. These tools do substantive work that takes time. The user's role shifts from typing to reviewing, and between instruction and review sits a gap.

The gap is:

- **Frequent.** Dozens of times per session, from seconds to minutes.
- **Unpredictable.** You don't know when it ends.
- **Cognitively idle.** Your hands and attention are unoccupied, but you can't start deep work because the agent will finish soon.
- **Impulse-prone.** The default behavior is to open a browser, check social media, or context-switch to another app.

## Unwait's Thesis: The Contract Is the Problem

[Unwait](https://unwait.ai/) identified the gap first and built a macOS menu bar app that shows a flashcard while Claude Code or Codex processes. Their key insight, from their blog post "Spaced Repetition for Programmers Who Quit Anki":

> "The algorithm was never the problem. The contract is."

People quit Anki not because spaced repetition doesn't work, but because Anki imposes a daily contract. Miss four days during a crunch, come back to 437 due cards. The guilt compounds. The tool punishes irregular schedules, which is exactly the schedule most knowledge workers have.

Unwait's design response:

- **Due-first ordering without debt.** Past-due cards surface first, but no backlog ledger exists.
- **Only completed cards reschedule.** Skipped cards reappear in 10 minutes unscored. No punishment for honest hesitation.
- **Bounded sessions.** Sessions end naturally. No quota.
- **Fixed interval ladder** (1d/3d/7d/16d/30d) instead of SM-2. Rationale: "when the arrival of review opportunities is random, an optimal interval and a decent interval land on the same day in practice."
- **"The guilt is optional. It was always optional."**

This thesis is correct and load-bearing. oliba adopts it fully.

## Scott Young's Update: What AI Changes About Learning

Scott Young's [April 2026 reflection](https://www.scotthyoung.com/blog/2026/04/29/ultralearning-ai/) on his own Ultralearning framework identifies the specific principles AI can amplify and the risks it introduces:

**AI enhances:**

- **Metalearning** (principle 1): AI dramatically reduces the cost of mapping a new territory. "I fire up ChatGPT and get it to start with a Deep Research on the topic."
- **Drill** (principle 4): AI generates infinite practice variations. Flashcards that place vocabulary in novel sentences. Conjugation exercises with variable input/output.
- **Retention** (principle 7): "I can easily imagine a future where an AI agent helps you manage your workload by resurfacing questions and ideas from material you've recently studied."
- **Intuition** (principle 8): AI as Socratic tutor. Uploading explanations and asking "what am I getting wrong?"

**AI endangers:**

- **Directness** (principle 3): "There's a temptation to do AI-mediated practice rather than engaging in the hard, scary, and sometimes uncomfortable, real-world skill."
- **Retrieval** (principle 5): AI can generate quizzes, but the value of retrieval comes from selecting WHAT to retrieve. A quiz on every fact in a text is worse than free recall of the big ideas.
- **The core risk:** "The risk of using AI to learn is that not learning at all is always the lowest effort strategy, and most models are designed to allow you to do exactly that."

This is the equanimitech tension: the tool must make the hard thing (retrieval, self-explanation) easy to reach without making it easy to skip the mental work.

## The Landscape (August 2026)

Our research surveyed the tools that attempt to fill idle moments with learning:

### Agent-native tools (Claude Code ecosystem)

| Tool | Approach | Gap |
|---|---|---|
| **Unwait** | macOS overlay during AI waits, fixed SR ladder, three content types | Closed-source, no card extraction, no Ultralearning, paid |
| **agent-tutor-skill** | Teaching loop with FSRS, desirable difficulty, source-aware | Lives inside work sessions, not a separate learning surface |
| **learn-faster-kit** | FASTER framework coaching via system prompts | Agent-adjacent (Python scripts), not agent-native |
| **Learning Opportunities** (Dr. Cat Hicks) | Post-commit exercises grounded in learning science | One-shot, not SR-scheduled |
| **Anthropic's learning-output-style** | SessionStart hook forcing code production at decision points | Not SR; directness only |

### Browser-based micro-learning

| Tool | Approach | Gap |
|---|---|---|
| **FlashTabs** | New tab = flashcard, SR algorithm | No AI, interception fatigue, 3.6-star UX complaints |
| **Carden** | In-context card creation while browsing, SM-2, gamification | Manual capture, review is separate from capture |
| **Studylib** | "Toll booth" model: 2-3 cards before you can browse | Interception fatigue, no AI |
| **AnkiTab** | Bridge to existing Anki decks on new tab | Inherits Anki's guilt contract |

### Key finding

Three gaps nobody fills:

1. **Nobody auto-extracts cards from Claude sessions into an SR inbox.** Carden lets you highlight text manually; agent-tutor-skill tracks concepts Claude teaches; but nobody mines the conversation automatically.
2. **Nobody grounds an agent learning tool in Ultralearning explicitly.** agent-tutor-skill comes closest (cognitive science, teaching loop) but doesn't implement metalearning, directness, or the Feynman Technique.
3. **Nobody combines agent-native delivery with anti-guilt SR design.** Unwait is anti-guilt but not agent-native (it's a macOS app). The agent tools have no anti-guilt philosophy.

## oliba: The Solution

oliba is an open-source Claude Code plugin that fills the AI wait gap with agent-native spaced repetition, grounded in Scott Young's Ultralearning, built on Unwait's anti-guilt thesis.

### What it takes from Unwait

- Anti-guilt design: no debt counter, no streak, no daily contract
- One card at a time in the status line during processing (never a count)
- Skipped cards reappear unscored
- The tool is a place you want to be, not a wall you hit

### What it takes from Young

- 9 Ultralearning principles as the theoretical framework
- Production over recognition: you type answers, not pick from options
- Metalearning: `/oliba:syllabus <topic>` maps the territory before generating cards
- The Feynman Technique: explain it, get checked, discover what you don't know
- The core constraint: the tool must not make it easy to skip the mental work

### What it adds that neither has

- **Agent-extracted card funnel.** Cards born from real work conversations, triaged deliberately.
- **Topic-based card generation.** `/oliba:syllabus Code de la route` maps the topic with starter cards; `/oliba:teach` wins one skill per sitting and turns it into cards.
- **Open source, local-first, zero-config.** `claude plugin install oliba@oliba`. Data in `~/.oliba/` as plain JSON. No account, no server, no macOS-only limitation.
- **FSRS-5 algorithm.** State of the art (trained on 700M reviews, 20-30% fewer reviews than SM-2), not a fixed ladder. Better scheduling without the complexity tax on the user.
- **Equanimitech alignment.** Sovereignty (you own your data, you choose what to learn). Awareness (cues surface without demanding). Equanimity (no guilt, no pressure, no score).

### The behavioral model

The gap is a behavioral moment. The user's attention is free. The default is to reach for the browser.

The plugin does not intercept this impulse (new-tab overrides cause fatigue). It does not demand a dedicated time slot (that's Anki's failed contract). Instead:

1. **During the gap:** the wait band offers one due card above the prompt: type the answer, reveal, rate it (a suggested grade when you typed one). Skip is free. Where mods are unavailable, the status line shows the card's question instead: a retrieval cue, not a demand.
2. **When you choose to learn:** open a dedicated Claude Code session. `/oliba:study` for retrieval practice. `/oliba:syllabus` or `/oliba:teach` to map and learn a new topic. Stop whenever you want.

The gap plants the seed. The dedicated session harvests it. Neither surface guilts you.

## Attribution

- **Unwait** ([unwait.ai](https://unwait.ai/)): pioneered the AI wait gap concept and anti-guilt SR design for developers. Their blog post "Spaced Repetition for Programmers Who Quit Anki" is the foundational text for the anti-guilt thesis.
- **Scott Young** ([scotthyoung.com](https://www.scotthyoung.com/)): *Ultralearning* (2019) provides the 9-principle theoretical framework. His [April 2026 AI reflection](https://www.scotthyoung.com/blog/2026/04/29/ultralearning-ai/) grounds the specific adaptations for agent-native learning.
- **Dr. Cat Hicks** ([github.com/DrCatHicks/learning-opportunities](https://github.com/DrCatHicks/learning-opportunities)): identified the five documented learning risks of AI-assisted coding and built exercise types that address them.
- **FSRS / Open Spaced Repetition** ([github.com/open-spaced-repetition](https://github.com/open-spaced-repetition)): the scheduling algorithm, trained on 700M reviews.

oliba is inspired by these works. It is not affiliated with or endorsed by any of them.
