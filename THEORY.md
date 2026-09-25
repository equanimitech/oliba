# Theoretical Foundation

This plugin is grounded in **Scott Young's Ultralearning** framework.

## Source Material

- **Book:** *Ultralearning: Master Hard Skills, Outsmart the Competition, and Accelerate Your Career* by Scott Young (HarperBusiness, 2019)
- **AI update:** ["I Wrote Ultralearning. This is What I'd Change Because of AI"](https://www.scotthyoung.com/blog/2026/04/29/ultralearning-ai/) by Scott Young (April 29, 2026)

This project is inspired by Young's framework. It is not affiliated with or endorsed by Scott Young.

## The 9 Principles and How This Plugin Maps to Them

### 1. Metalearning: First Draw a Map

Before learning a skill, research how it works, what subtopics exist, and what order to tackle them. AI has dramatically reduced the cost of this research.

**Plugin feature:** `/syllabus <topic>` dispatches a workflow that maps the territory, sequences subtopics, and generates starter cards straight into the deck. It deepens nothing up front.

### 2. Focus: Sharpen Your Knife

Learning requires undistracted time. The attentional ecosystem has only gotten worse.

**Plugin feature:** Not the plugin's job. It never demands attention, only offers it. The anti-guilt design means there is no daily contract pulling at your focus.

### 3. Directness: Go Straight Ahead

Practice the skill you want to get good at. Do the real thing, avoid substitutes. AI can make this harder by offering comfortable simulations instead of uncomfortable reality.

**Plugin features (teaching surface):**
- `/teach <topic>` starts from a one-line **mission** (why you are learning this) and wins one skill per sitting, aimed at it. The skill is something you can *do* in the mission's world, and the lesson ends with an applied step taken from it: a real decision or calculation, not a summary.
- The sitting is Socratic. The agent asks what you think before explaining anything, then asks, waits, probes with why, what-if and counter-examples, and reveals only what you couldn't reach. It teaches *from* one primary source rather than dumping it.
- The sitting is written up as one self-contained HTML lesson: think-first prompts, contrast notes for the misconceptions you corrected, instant-feedback quizzes. It is a record you can reopen, practise in and share as a single file. Each quiz item is rewritten as a production card, so the page's recognition practice continues as recall in `/study`. One button at the end hands the first attempts back (a download, plus a copied prompt): a miss brings its card back sooner. Only the first attempt counts, because that one shows what you knew before the page told you.
- A map node is researched only when `/teach` reaches it: directness at the point of use, not a curriculum built up front. No map is needed at all.
- Together they close the acquisition gap: `/syllabus` maps → `/teach` acquires → `/study` retrieves.

This lesson design (mission first, evidence-gated learning records, one short single-file lesson per skill with in-page quizzes, a glossary earned by correct use with terms to avoid) is learned from [Matt Pocock's `/teach` skill](https://github.com/mattpocock/skills/tree/main/skills/productivity/teach). See the README's Acknowledgements.

### 4. Drill: Attack Your Weakest Point

Break down a complex skill into parts, practice them in isolation. AI can generate infinite variations of practice problems.

**Plugin feature:** `/study` resurfaces weak cards first. `/study grill me on <topic>` drills the weakest points in isolation: your recorded, still-open misconceptions and the cards you've forgotten. For each it climbs explain-back → why → what-if → transfer to a fresh case, and every gap it finds becomes a record and a card.

### 5. Retrieval: Test to Learn

Memory is strengthened more by recall than by review. Practice remembering, not just looking.

**Plugin feature:** The core of `/study`. Cards demand typed answers (production), not multiple choice (recognition). The status-line cue during processing is a retrieval prompt.

### 6. Feedback: Don't Dodge the Punches

Sparse or incomplete feedback slows learning. AI can enhance feedback in symbolic domains.

**Plugin feature:** Agent scores your answers, reveals gaps, asks follow-up questions. Feynman escalation checks your explanations against the real answer.

**Plugin features (teaching surface):**
- During `/teach`, probes catch misconceptions in real time, and a counter-example lets you repair your own model before anything is revealed.
- **Learning records** keep what you've shown: a prior you stated, a belief you held and corrected, an insight you used. Each needs evidence; having covered something is not evidence. A better model supersedes an old record without erasing it. Every corrected misconception also becomes a contrast card (wrong model against right), the most valuable card there is, because it predicts where you'd stumble again.
- A light trace (`readTrace`) records comprehension signals and specific gaps. `/study` uses these to prioritize cards from weak nodes, closing the feedback loop between teaching and retrieval.

### 7. Retention: Don't Fill a Leaky Bucket

Spacing and mnemonics combat forgetting. An AI agent can manage the logistical nightmare of tracking what you've learned and ensuring regular re-exposure.

**Plugin feature:** FSRS algorithm schedules reviews at optimal intervals. The status-line cue resurfaces knowledge ambient during work sessions.

From Young's 2026 reflection:

> "I can easily imagine a future where an AI agent helps you manage your workload by resurfacing questions and ideas from material you've recently studied."

### 8. Intuition: Dig Deep Before Building Up

Understanding is built through self-explanation. The Feynman Technique: write out an explanation, find where you get stuck, go back and learn that part.

**Plugin feature:** Feynman escalation in `/study` asks you to explain concepts, checks your explanation, and reveals gaps you didn't know you had.

**Plugin features (teaching surface):**
- A `/teach` sitting opens with questions, not explanations: what do you think this means, what happens if. You commit to a model first, so the lesson has something to build on or break.
- Probes test mental models ("what would happen if..."), not definitions. The lesson's think-first prompts keep the same order on the page: predict, then open the answer.
- Grill mode's explain-back rung is the Feynman technique: put it in your own words, and the gaps show.

From Young's 2026 reflection:

> "The risk of using AI to learn is that not learning at all is always the lowest effort strategy, and most models are designed to allow you to do exactly that."

The plugin resists this by demanding production (you type the answer) before showing the correct response.

### 9. Experimentation: Explore Outside Your Comfort Zone

Try different approaches, figure out what works.

**Plugin feature:** Multiple learning modes (review, drill, Feynman, metalearning). The user experiments with what serves their learning best.

## Anti-Guilt Design

Inspired by [Unwait](https://unwait.ai/)'s insight: "The guilt is optional. It was always optional."

People quit spaced repetition tools because of the implied daily contract, not the algorithm. This plugin has no review debt counter, no streak, no daily obligation. Cards are due when they are due. Skipped cards reappear later, unscored. The tool is a place you want to be, not a wall you hit.
