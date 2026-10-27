// The wait band: one due card above the prompt while Claude works. Type an
// answer, reveal the back, rate it. No count, no streak; Skip leaves the card
// unscored. Needs a Claude Code build that loads hooks modules (mods).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Card, Rating } from '../types'

const card = atom({ plugin: 'oliba', key: 'card' } as const, null, { shape: 'card-1' })

// node from PATH, as the shell hooks use it; any failure draws nothing.
const cli = async ($: EngineInterface, args: string[]) => {
  try {
    const { exitCode, stdout } = await $.process.run(['node', `${$.plugin.root}/lib/cli.mjs`, ...args])
    return exitCode === 0 ? JSON.parse(stdout) : undefined
  } catch {
    return undefined
  }
}

// The first card due under the first tag that has one; undefined, no tag.
const firstDue = async ($: EngineInterface, tags: (string | undefined)[]) => {
  for (const tag of tags) {
    // An ambiguous tag answers { ambiguous, projects }: nothing due for it.
    const result = await cli($, ['due', '--limit', '1', '--hide-back'].concat(tag ? ['--tag', tag] : []))
    if (Array.isArray(result) && result[0]) return result[0] as { id: string; front: string }
  }
  return undefined
}

// Every topic once, from `start` round to the one before it.
export const topicOrder = (topics: string[], start: number) => [...topics.slice(start), ...topics.slice(0, start)]

const RATINGS: readonly Rating[] = ['again', 'hard', 'good']
const LABELS: Record<Rating, string> = { again: 'Missed', hard: 'Shaky', good: 'Got it' }

// A suggested grade for a typed answer, or undefined on any failure: then the
// learner rates alone and nothing is shown.
const suggest = async ($: EngineInterface, front: string, back: string, typed: string) => {
  try {
    const r = await $.model.complete({
      model: 'haiku',
      maxTokens: 120,
      system: 'You grade one flashcard answer. Reply with JSON only.',
      prompt: [
        `Card front: ${front}`,
        `Correct answer: ${back}`,
        `Learner's answer: ${typed}`,
        'Reply {"rating": "again" | "hard" | "good", "why": "..."}: again = wrong or missing the point, hard = partly right, good = right in substance.',
        '"why": at most 12 words, in the card\'s language, neutral, no scores or numbers.',
      ].join('\n'),
    })
    if (!r.isAnswered) return undefined
    const json = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? '')
    if (!RATINGS.includes(json.rating) || typeof json.why !== 'string') return undefined
    return { suggested: json.rating as Rating, why: json.why.split(/\s+/).slice(0, 12).join(' ') }
  } catch {
    return undefined
  }
}

export const register: Register = (on, options) => {
  const topics = String(options.waitTopics ?? '').split(',').map(t => t.trim()).filter(Boolean)

  // 0.19 retired the status-line cue: its topics (oliba config cueTags) become
  // waitTopics, once, unless waitTopics is already set.
  on('session.start', async ($, e, next) => {
    if (!topics.length) {
      const config = await cli($, ['config-get'])
      const tags: string[] = [config?.cueTags ?? []].flat().filter(Boolean)
      if (tags.length && !config.cueTagsMoved) {
        const value = tags.join(', ')
        const { deny } = await $.config.set({ key: 'oliba.waitTopics', value })
        if (deny) $.ui.toast(`oliba: set waitTopics to "${value}" in /config`)
        await cli($, ['config-set', 'cueTagsMoved', 'true'])
      }
    }
    return next(e)
  })

  // One card per main-loop turn, fetched only when none is in progress. The
  // turn starts first (next(e) resolves at the start, not the end), so the
  // fetch never delays it.
  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && (await read($, card)) === null) {
      // No topics: whatever is due first. Topics: a random one, then the rest in order.
      const start = Math.floor(Math.random() * topics.length)
      const due = await firstDue($, topics.length ? topicOrder(topics, start) : [undefined])
      if (due) await update($, card, () => ({ id: due.id, front: due.front, typed: '' }))
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = await read($, card)
    if (c === null || e.props.hasSurvey) return next(e)
    // The band leaves when the turn ends, unless the learner is mid-card; the
    // card stays in the atom and returns on the next turn.
    if (!e.props.isWorking && !c.typed.trim() && c.back === undefined) return next(e)

    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    // The mobile app draws no Input: reveal only there.
    const Input = 'Input' in els ? els.Input : undefined
    const width = e.props.bodyColumns

    // Every write checks the card is still this one: a press can land after
    // another press, or after a new card, has already changed it.
    const isThis = (cur: Card | null) => cur?.id === c.id
    // Takes the card off the band; the card taken, or undefined when a press
    // before this one already took it.
    const claim = async () => {
      let taken: Card | undefined
      await update($, card, cur => {
        taken = isThis(cur) && cur ? cur : undefined
        return taken ? null : cur
      })
      return taken
    }
    const reveal = async (typed?: string) => {
      const shown = await cli($, ['reveal', c.id])
      if (!shown) return update($, card, cur => isThis(cur) ? null : cur)
      const now = await update($, card, cur => isThis(cur) && cur ? { ...cur, typed: typed ?? cur.typed, back: shown.back } : cur)
      // A typed answer gets a suggested grade; a blank one is self-rated.
      const answer = isThis(now) ? now?.typed.trim() : ''
      if (!answer) return
      const graded = await suggest($, c.front, shown.back, answer)
      if (graded) await update($, card, cur => isThis(cur) && cur?.back !== undefined ? { ...cur, ...graded } : cur)
    }
    const skip = () => claim()
    const rate = async (rating: Rating) => {
      const taken = await claim()
      if (!taken) return
      if (!(await cli($, ['rate', c.id, rating]))) {
        await update($, card, cur => cur ?? taken)
        return $.ui.toast('oliba: not saved, try again')
      }
    }

    const front = <Text>🦉 {c.front}</Text>
    if (c.back === undefined) {
      return (
        <Box flexDirection="column" width={width} paddingX={2} paddingY={1}>
          {front}
          <Box gap={2}>
            {Input && <Input
              key="answer"
              placeholder="your answer"
              submitLabel="reveal"
              onInput={typed => void update($, card, cur => isThis(cur) && cur ? { ...cur, typed } : cur)}
              onSubmit={typed => void reveal(typed)}
            />}
            <Button key="reveal" label="Reveal" variant="primary" onPress={() => reveal()} />
            <Button key="skip" label="Skip" onPress={skip} />
          </Box>
        </Box>
      )
    }

    // Backs hold markdown; the band scrolls past maxRows, so nothing is cut here.
    const Markdown = 'Markdown' in els ? els.Markdown : undefined
    // Self-assessment is the learner's call: Got it is primary, nothing is
    // focused, whatever Haiku suggested. The suggestion is only the dim line.
    const grade = (key: string, label: string, hotkey: string, rating: Rating) => (
      <Button key={key} label={label} hotkey={hotkey} onPress={() => rate(rating)}
        {...(rating === 'good' ? { variant: 'primary' as const } : {})} />
    )
    return (
      <Box flexDirection="column" width={width} paddingX={2} paddingY={1}>
        {front}
        {c.typed && <Text dimColor>you: {c.typed}</Text>}
        {Markdown ? <Markdown key="back" text={c.back} /> : <Text>{c.back}</Text>}
        {c.why && c.suggested && <Text dimColor>{LABELS[c.suggested]}? {c.why}</Text>}
        <Box gap={2}>
          {grade('missed', 'Missed', '1', 'again')}
          {grade('shaky', 'Shaky', '2', 'hard')}
          {grade('gotit', 'Got it', '3', 'good')}
          <Button key="skip" label="Skip" onPress={skip} />
        </Box>
      </Box>
    )
  })
}
