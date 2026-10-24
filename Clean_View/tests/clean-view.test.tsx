import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cleanName } from '../hooks/clean-view'

const PLAN = 'mcp__clean-view__plan_steps'
const PROGRESS = 'mcp__clean-view__report_progress'

const BAND = {
  plugin: 'clean-view',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 70,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

// Nothing sits beneath the plugin: these hooks stand for the engine.
function engine(on: On) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__clean-view__${e.name}` } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('model.complete', () => ({
    value: {
      isAnswered: true,
      text: 'Build my landing page',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  }))
  on('classic.Notification', () => ({}))
  return clock
}

async function startJob($: Parameters<Parameters<typeof test>[1]>[0], on: On) {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'Make me a landing page', turnId: 't1' })
  await clock.settle()
  return clock
}

async function texts($: Parameters<Parameters<typeof test>[1]>[0], surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ ...BAND, surface })
  const all = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  return all
}

test('1. names are cleaned to plain English', async () => {
  expect(cleanName('Build the pricing section in `src/Pricing.tsx`')).toBe('Build the pricing section in')
  expect(cleanName('update src/app/page.tsx with the new copy')).toBe('Update with the new copy')
  expect(cleanName('fix Pricing.tsx styles')).toBe('Fix styles')
  const long = cleanName('Write a very long description of the thing that keeps going and going past forty')
  expect(long.length <= 40).toBe(true)
  expect(long.endsWith('…')).toBe(true)
  expect(cleanName('`npm run build`')).toBe('Working on it')
})

test('2. a to-do list plus a 60% report renders done, active, next and up next', async ($, on) => {
  await startJob($, on)
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Read your brand notes', status: 'completed', activeForm: 'Reading' },
      { content: 'Build the pricing section', status: 'in_progress', activeForm: 'Building' },
      { content: 'Add the contact form', status: 'pending', activeForm: 'Adding' },
      { content: 'Polish the footer', status: 'pending', activeForm: 'Polishing' },
    ],
  })
  await $.tool.call({ tool: PROGRESS, task: 'Build the pricing section', percent: 60 })

  for (const surface of ['terminal', 'desktop'] as const) {
    const all = (await texts($, surface)).join('\n')
    expect(all).toMatch(/✓ Read your brand notes\s+█{10} Done/)
    expect(all).toMatch(/▶ Build the pricing section\s+█{6}░{4} 60%/)
    expect(all).toMatch(/○ Add the contact form\s+░{10} Next/)
    expect(all).toMatch(/○ Polish the footer\s+░{10} Up next/)
    expect(all).toMatch(/Build my landing page/)
  }
})

test('3. a permission prompt shows Needs you', async ($, on) => {
  await startJob($, on)
  await $.tool.call({ tool: PLAN, steps: ['Build the page', 'Check the page'] })
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const all = (await texts($, surface)).join('\n')
    expect(all).toMatch(/Needs you/)
    expect(all).toMatch(/Claude needs your OK to continue/)
    expect(all).toMatch(/‖ Build the page/)
  }
})

test('4. /simple off hides the band but keeps the button', async ($, on) => {
  await startJob($, on)
  await $.tool.call({ tool: PLAN, steps: ['Build the page', 'Check the page'] })
  await $.command.run({ command: 'simple', args: 'off' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const all = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    expect(all).not.toMatch(/Build the page/)
    expect((await ui.find({ key: 'clean-view-toggle' }))?.props.label).toBe('○ Clean View: OFF')
    await ui.unmount()
  }
})

test('5. plan_steps then report_progress at 100 checks off step one and starts step two', async ($, on) => {
  await startJob($, on)
  const planned = await $.tool.call({ tool: PLAN, steps: ['Read your notes', 'Build the page', 'Check the page'] })
  expect(planned.result).toBe('Planned 3 steps. The first one has started.')
  const reported = await $.tool.call({ tool: PROGRESS, task: 'Read your notes', percent: 140 })
  expect(reported.result).toBe('Progress noted: 100%.')

  const all = (await texts($, 'terminal')).join('\n')
  expect(all).toMatch(/✓ Read your notes\s+█{10} Done/)
  expect(all).toMatch(/▶ Build the page\s+[░▓]{10} Working/)
  expect(all).toMatch(/○ Check the page\s+░{10} Next/)
})

test('6. tools are denied before a plan exists and allowed after', async ($, on) => {
  await startJob($, on)
  const before = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(before.deny ?? '').toMatch(/plan_steps first/)
  const search = await $.tool.call({ tool: 'ToolSearch', query: 'select:x', max_results: 1 })
  expect(search.deny).toBeUndefined()

  await $.tool.call({ tool: PLAN, steps: ['Look around', 'Answer the question'] })
  const after = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(after.deny).toBeUndefined()
})

test('done shows All done, then shrinks to one line after 5 seconds', async ($, on) => {
  const clock = await startJob($, on)
  await $.tool.call({ tool: PLAN, steps: ['Answer the question'] })
  await $.tool.call({ tool: PROGRESS, task: 'Answer the question', percent: 100 })
  await clock.advance(2000)
  await $.turn.complete({ answer: 'Here you go', durationMs: 2000, isAborted: false, turnId: 't1', reason: 'answer' })

  let all = (await texts($, 'terminal')).join('\n')
  expect(all).toMatch(/✓ All done/)
  expect(all).toMatch(/took 2s/)
  expect(all).toMatch(/Answer the question/)

  await clock.advance(5000)
  all = (await texts($, 'terminal')).join('\n')
  expect(all).toMatch(/✓ All done/)
  expect(all).not.toMatch(/█/)
})

test('options: /simple set changes them and they are published for a control panel', async ($, on) => {
  const clock = await startJob($, on)

  // Plan first off: tools run without a plan.
  expect((await $.command.run({ command: 'simple', args: 'set plan off' })).text).toBe('Clean View: plan is now off.')
  expect((await $.tool.call({ tool: 'Bash', command: 'ls' })).deny).toBeUndefined()

  // An unknown option says which ones exist.
  expect((await $.command.run({ command: 'simple', args: 'set colour blue' })).text).toMatch(/collapse 5\|15\|never/)

  // Never shrink: "All done" keeps its rows.
  await $.command.run({ command: 'simple', args: 'set collapse never' })
  await $.tool.call({ tool: PLAN, steps: ['Answer the question'] })
  await $.tool.call({ tool: PROGRESS, task: 'Answer the question', percent: 100 })
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(20000)
  expect((await texts($, 'terminal')).join('\n')).toMatch(/Answer the question\s+█{10} Done/)
})

test('options: hide technical rows off shows tool rows again', async ($, on) => {
  // Stands for the engine's own drawing of a tool row.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  await startJob($, on)
  const TOOL_ROW = {
    plugin: 'clean-view',
    component: 'ToolResult',
    surface: 'terminal',
    props: {},
  } as const
  const mountRow = () => $.ui.mount(TOOL_ROW as unknown as Parameters<typeof $.ui.mount>[0])

  let ui = await mountRow()
  expect(await ui.find({ type: 'Text', text: /engine row/ })).toBeUndefined()
  await ui.unmount()

  await $.command.run({ command: 'simple', args: 'set hide off' })
  ui = await mountRow()
  expect(await ui.find({ type: 'Text', text: /engine row/ })).toBeDefined()
  await ui.unmount()
})

test('version: published for the Mods menu, and /simple version says it', async ($, on) => {
  const published: Record<string, unknown> = {}
  on('state.set', (_, e, next) => {
    const w = e as { plugin: string; key: string; value: unknown }
    if (w.plugin === 'clean-view') published[w.key] = w.value
    return next(e)
  })
  await startJob($, on)
  expect(published.version).toBe('0.1.1')
  expect((await $.command.run({ command: 'simple', args: 'version' })).text).toBe('Clean View version 0.1.1')
})
