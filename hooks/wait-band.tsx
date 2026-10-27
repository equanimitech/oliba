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

export const register: Register = (on, options) => {
  const topics = String(options.waitTopics ?? '').split(',').map(t => t.trim()).filter(Boolean)

  // One card per main-loop turn, fetched only when none is in progress.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, card)) === null) {
      // No topics: whatever is due first. Topics: a random one, then the rest.
      const order = topics.length ? [...topics].sort(() => Math.random() - 0.5) : [undefined]
      let due
      for (const tag of order) {
        ;[due] = (await cli($, ['due', '--limit', '1', '--hide-back'].concat(tag ? ['--tag', tag] : []))) ?? []
        if (due) break
      }
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

    const reveal = async (typed: string) => {
      const shown = await cli($, ['reveal', c.id])
      if (!shown) return update($, card, () => null)
      await update($, card, cur => cur && { ...cur, typed, back: shown.back })
    }
    const rate = async (rating: string) => {
      await cli($, ['rate', c.id, rating])
      const cue = await cli($, ['current-cue'])
      if (cue?.id === c.id) await cli($, ['clear-cue'])
      await update($, card, () => null)
    }

    if (c.back === undefined) {
      return (
        <Box flexDirection="column" width={width} paddingX={2} paddingY={1}>
          <Text wrap="truncate-end">🦉 {c.front}</Text>
          <Box gap={2}>
            {Input && <Input
              key="answer"
              placeholder="your answer"
              submitLabel="reveal"
              onInput={typed => void update($, card, cur => cur && { ...cur, typed })}
              onSubmit={typed => void reveal(typed)}
            />}
            <Button key="reveal" label="Reveal" variant="primary" onPress={() => reveal(c.typed)} />
            <Button key="skip" label="Skip" onPress={() => update($, card, () => null)} />
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" width={width} paddingX={2} paddingY={1}>
        <Text wrap="truncate-end">🦉 {c.front}</Text>
        <Text wrap="truncate-end" dimColor>you: {c.typed || '(blank)'}</Text>
        <Text wrap="truncate-end">back: {c.back}</Text>
        <Box gap={2}>
          <Button key="again" label="Again" hotkey="1" onPress={() => rate('again')} />
          <Button key="hard" label="Hard" hotkey="2" onPress={() => rate('hard')} />
          <Button key="good" label="Good" hotkey="3" variant="primary" onPress={() => rate('good')} />
        </Box>
      </Box>
    )
  })
}
