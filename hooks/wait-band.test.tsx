import { expect, test } from 'claude-code/testing'

const band = (surface: 'terminal' | 'desktop') => ({
  plugin: 'oliba',
  component: 'AbovePrompt',
  surface,
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 10,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
}) as const

const ok = (value: unknown) => ({ value: { exitCode: 0, stdout: JSON.stringify(value), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: front, typed answer, reveal, rate`, async ($, on) => {
    const argvs: string[][] = []
    const answers: Record<string, unknown> = {
      due: [{ id: 'c1', front: 'What owns a Rust value?' }],
      reveal: { id: 'c1', back: 'exactly **one** owner' },
      rate: { id: 'c1' },
      'current-cue': { id: 'c1' },
      'clear-cue': {},
    }
    on('process.run', (_, e) => (argvs.push([...e.argv]), ok(answers[e.argv[2] ?? ''])))
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine</Text>
    })
    on('turn.start', (_, e) => ({ turnId: e.turnId }))

    await $.turn.start({ text: 'hi', turnId: 't1' })
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ type: 'Text', text: /owns a Rust/ })).toBeDefined()

    await ui.input({ key: 'answer', text: 'one owner' })
    expect(await ui.find({ type: 'Text', text: /you: one owner/ })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', key: 'back' })).toBeDefined()
    expect((await ui.find({ key: 'gotit' }))?.text).toBe('Got it')

    await ui.press({ key: 'gotit' })
    expect(argvs[0]?.[0]).toBe('node')
    expect(argvs[0]?.[1]).toMatch(/\/lib\/cli\.mjs$/)
    expect(argvs.map(a => a.slice(2).join(' '))).toEqual([
      'due --limit 1 --hide-back', 'reveal c1', 'rate c1 good', 'current-cue', 'clear-cue',
    ])
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    await ui.unmount()
  })
}

test('waitTopics: tries each topic, draws nothing when none is due', { options: { waitTopics: 'italiano, code-de-la-route' } }, async ($, on) => {
  const tags: string[] = []
  on('process.run', (_, e) => (tags.push(e.argv.at(-1) ?? ''), ok([])))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(band('terminal'))
  expect([...tags].sort()).toEqual(['code-de-la-route', 'italiano'])
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('a blank answer hides the you: line', async ($, on) => {
  const answers: Record<string, unknown> = {
    due: [{ id: 'c1', front: 'front' }],
    reveal: { id: 'c1', back: 'back' },
  }
  on('process.run', (_, e) => ok(answers[e.argv[2] ?? '']))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(band('terminal'))
  await ui.press({ key: 'reveal' })
  expect(await ui.find({ key: 'missed' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /you:/ })).toBeUndefined()
  await ui.unmount()
})

test('an ambiguous topic counts as nothing due; the next topic is tried', { options: { waitTopics: 'it, code-de-la-route' } }, async ($, on) => {
  on('process.run', (_, e) => ok(e.argv.at(-1) === 'it'
    ? { ambiguous: true, projects: [{ id: 'a' }, { id: 'b' }] }
    : [{ id: 'c2', front: 'Panneau triangulaire ?' }]))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(band('terminal'))
  expect(await ui.find({ type: 'Text', text: /Panneau/ })).toBeDefined()
  await ui.unmount()
})

// Takes a mounted band from its front to its back view.
type Band = { press: (t: { key: string }) => Promise<unknown>; find: (q: { key: string }) => Promise<unknown> }
const revealed = async (ui: Band) => {
  await ui.press({ key: 'reveal' })
  expect(await ui.find({ key: 'gotit' })).toBeDefined()
}

test('two fast presses rate once', async ($, on) => {
  const rates: string[] = []
  on('process.run', (_, e) => {
    if (e.argv[2] === 'rate') rates.push(e.argv.slice(3).join(' '))
    return ok(({ due: [{ id: 'c1', front: 'front' }], reveal: { id: 'c1', back: 'back' }, rate: { id: 'c1' } } as Record<string, unknown>)[e.argv[2] ?? ''])
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(band('terminal'))
  await revealed(ui)
  await Promise.all([ui.press({ key: 'gotit' }), ui.press({ key: 'missed' })])
  expect(rates).toHaveLength(1)
  await ui.unmount()
})

test('a failed rating keeps the card and says so', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('process.run', (_, e) => e.argv[2] === 'rate'
    ? { value: { exitCode: 1, stdout: '', stderr: 'disk full', isStdoutTruncated: false, isStderrTruncated: false } }
    : ok(({ due: [{ id: 'c1', front: 'front' }], reveal: { id: 'c1', back: 'back' } } as Record<string, unknown>)[e.argv[2] ?? '']))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(band('terminal'))
  await revealed(ui)
  await ui.press({ key: 'gotit' })
  expect(await ui.find({ key: 'gotit' })).toBeDefined()
  expect(toasts).toEqual(['oliba: not saved, try again'])
  await ui.unmount()
})

test('skip on the back view leaves the card unscored', async ($, on) => {
  const calls: string[] = []
  on('process.run', (_, e) => {
    calls.push(e.argv[2] ?? '')
    return ok(({ due: [{ id: 'c1', front: 'front' }], reveal: { id: 'c1', back: 'back' } } as Record<string, unknown>)[e.argv[2] ?? ''])
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(band('terminal'))
  await revealed(ui)
  await ui.press({ key: 'skip' })
  expect(calls).toEqual(['due', 'reveal'])
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('a failing CLI draws nothing of its own', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'boom', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(band('terminal'))
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
