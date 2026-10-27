// The wait band: one due card above the prompt while Claude works. Type an
// answer, reveal the back, rate it. No count, no streak; Skip leaves the card
// unscored. Needs a Claude Code build that loads hooks modules (mods).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Card } from '../types'

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

type Rating = 'again' | 'hard' | 'good'

export const register: Register = (on, options) => {
  const topics = String(options.waitTopics ?? '').split(',').map(t => t.trim()).filter(Boolean)

  // One card per main-loop turn, fetched only when none is in progress.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, card)) === null) {
      // No topics: whatever is due first. Topics: a random one, then the rest in order.
      const start = Math.floor(Math.random() * topics.length)
      const due = await firstDue($, topics.length ? topicOrder(topics, start) : [undefined])
      if (due) await update($, card, () => ({ id: due.id, front: due.front, typed: '' }))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = await read($, card)
    if (c === null || e.props.hasSurvey) return next(e)

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
      await update($, card, cur => isThis(cur) && cur ? { ...cur, typed: typed ?? cur.typed, back: shown.back } : cur)
    }
    const skip = () => claim()
    const rate = async (rating: Rating) => {
      const taken = await claim()
      if (!taken) return
      if (!(await cli($, ['rate', c.id, rating, '--clear-cue']))) {
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
    return (
      <Box flexDirection="column" width={width} paddingX={2} paddingY={1}>
        {front}
        {c.typed && <Text dimColor>you: {c.typed}</Text>}
        {Markdown ? <Markdown key="back" text={c.back} /> : <Text>{c.back}</Text>}
        <Box gap={2}>
          <Button key="missed" label="Missed" hotkey="1" onPress={() => rate('again')} />
          <Button key="shaky" label="Shaky" hotkey="2" onPress={() => rate('hard')} />
          <Button key="gotit" label="Got it" hotkey="3" variant="primary" onPress={() => rate('good')} />
          <Button key="skip" label="Skip" onPress={skip} />
        </Box>
      </Box>
    )
  })
}
