import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { applyStepTool, badgeFor, costOf, duration, modelName, money, priceOf, tokenCount } from '../hooks/logic'

type Engine = Parameters<Parameters<typeof test>[1]>[0]

const PANE = {
  plugin: 'team-tracker',
  component: 'Pane',
  requestId: 'team',
  props: {
    title: 'Team',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// 200K input + 20K output on Sonnet 5.5 ($2 / $10 per million): $0.40 + $0.20.
const SONNET_RUN = { input_tokens: 200_000, output_tokens: 20_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

type World = { status: Array<string | undefined>; opened: string[]; published: Record<string, unknown> }

// Nothing sits beneath the plugin: these hooks stand for the engine, the helpers and Clean View.
function engine(on: On, cleanView?: unknown) {
  const world: World = { status: [], opened: [], published: {} }
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('state.set', (_, e, next) => {
    const w = e as { plugin: string; key: string; value: unknown }
    if (w.plugin === 'team-tracker') world.published[w.key] = w.value
    return next(e)
  })
  on('state.get', (_, e, next) => {
    if (e.plugin !== 'clean-view') return next(e)
    return { value: cleanView === undefined ? { value: undefined, version: 0 } : { value: cleanView, version: 1 } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.status', (_, e) => {
    world.status.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_, e) => {
    world.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('agent.list', () => ({ value: [] }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  // The helpers: a foreground call finishes with its totals; a background one answers with its id at once.
  on('tool.call', (_, e) => {
    const call = e as unknown as { tool: string; description?: string; run_in_background?: boolean }
    if (call.tool !== 'Agent') return { result: {}, text: 'ok' }
    if (call.description === 'Check the links') return { result: { agentId: 'bg-1' }, text: 'started' }
    return {
      result: { agentId: 'fg-1', resolvedModel: 'claude-sonnet-5-5', totalTokens: 220_000, totalDurationMs: 95_000, usage: SONNET_RUN },
      text: 'done',
    }
  })
  return { ...world, clock }
}

async function boot($: Engine, on: On, cleanView?: unknown) {
  const world = engine(on, cleanView)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  return world
}

async function pane($: Engine, surface: 'terminal' | 'desktop' = 'terminal', columns = 60) {
  const ui = await $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns: columns } })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  await ui.unmount()
  return text
}

// ---------------------------------------------------------------------------

test('cost at API list prices, by model', () => {
  expect(priceOf('claude-opus-5-5')).toEqual({ input: 4, output: 20, cacheRead: 0.2 })
  expect(priceOf('opus').input).toBe(4) // an alias means the current model
  expect(priceOf('claude-opus-4-8').input).toBe(5)
  expect(priceOf('claude-sonnet-5-5').input).toBe(2)
  expect(priceOf('claude-sonnet-4-6').input).toBe(3)
  expect(priceOf('claude-haiku-5-5').output).toBe(0.5)
  expect(priceOf('claude-haiku-4-5').output).toBe(5)
  expect(priceOf('claude-fable-5-1').output).toBe(50)
  expect(priceOf(undefined).input).toBe(2) // unknown: like the current Sonnet
  const c = costOf({ input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 }, 'opus')
  expect(c.tokens).toBe(4_000_000)
  expect(Math.round(c.usd * 100) / 100).toBe(29.2)
})

test('how numbers read', () => {
  expect(duration(45_000)).toBe('45s')
  expect(duration(95_000)).toBe('1m 35s')
  expect(duration(3_725_000)).toBe('1h 02m')
  expect(tokenCount(950)).toBe('950')
  expect(tokenCount(220_000)).toBe('220K')
  expect(tokenCount(1_250_000)).toBe('1.3M')
  expect(money(0.004)).toBe('under $0.01')
  expect(money(0.6)).toBe('$0.60')
  expect(modelName('claude-sonnet-5-5')).toBe('Sonnet')
  expect(modelName(undefined)).toBeUndefined()
  expect([badgeFor(0), badgeFor(2), badgeFor(26)]).toEqual(['A', 'C', 'AA'])
})

test('steps follow Claude\'s to-do tools', () => {
  let steps = applyStepTool([], 'TodoWrite', { todos: [{ content: 'Read notes', status: 'completed' }, { content: 'Build page', status: 'in_progress' }] }, 'x')
  expect(steps.map(s => s.status)).toEqual(['completed', 'in_progress'])
  steps = applyStepTool([], 'mcp__ccd_turn__update_plan', { items: [{ content: 'A', status: 'in_progress' }, { content: 'B', status: 'pending' }] }, 'x')
  steps = applyStepTool(steps, 'mcp__ccd_turn__update_plan', { advance: true }, 'x')
  expect(steps.map(s => s.status)).toEqual(['completed', 'in_progress'])
  steps = applyStepTool([], 'TaskCreate', { subject: 'Write tests' }, 'task-1')
  steps = applyStepTool(steps, 'TaskUpdate', { taskId: '1', status: 'completed' }, 'x')
  expect(steps).toEqual([{ id: 'task-1', content: 'Write tests', status: 'completed' }])
})

test('a finished helper shows with its time, model, tokens and cost, on every surface', async ($, on) => {
  const world = await boot($, on)
  await $.tool.call({ tool: 'Agent', description: 'Write the pricing copy', prompt: '...', model: 'sonnet' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const text = await pane($, surface)
    expect(text).toMatch(/ A [\s\S]*Write the pricing copy/)
    expect(text).toMatch(/done[\s\S]*1m 35s · Sonnet · 220K tokens · ≈ \$0\.60/)
    expect(text).toMatch(/1 helper · ≈ \$0\.60 at API prices · 1m 35s/)
  }
  expect(world.published.version).toBe('0.1.0')
})

test('a background helper runs, then its own turn finishes it and counts its cost', async ($, on) => {
  const world = await boot($, on)
  await $.tool.call({ tool: 'Agent', description: 'Check the links', prompt: '...', run_in_background: true })
  await world.clock.advance(30_000)
  let text = await pane($)
  expect(text).toMatch(/running[\s\S]*30s/)
  expect(world.status.at(-1)).toBe('Team: 1 running, 0 done')

  await $.turn.complete({
    agentId: 'bg-1',
    answer: 'All links work',
    durationMs: 30_000,
    isAborted: false,
    turnId: 'h1',
    reason: 'answer',
    usage: { ...SONNET_RUN, model: 'claude-haiku-5-5' },
  })
  text = await pane($)
  // 200K in + 20K out on Haiku 5.5 ($0.10 / $0.50): $0.02 + $0.01.
  expect(text).toMatch(/done[\s\S]*30s · Haiku · 220K tokens · ≈ \$0\.03/)
  expect(world.status.at(-1)).toBeUndefined()
})

test('a new job starts fresh: earlier helpers clear once nothing is running', async ($, on) => {
  await boot($, on)
  await $.tool.call({ tool: 'Agent', description: 'Write the pricing copy', prompt: '...' })
  await $.turn.start({ text: 'Now the footer', turnId: 't2' })
  await $.tool.call({ tool: 'Agent', description: 'Design the footer', prompt: '...' })
  const text = await pane($)
  expect(text).toMatch(/ A [\s\S]*Design the footer/)
  expect(text).not.toMatch(/pricing copy/)
})

test('steps come from Clean View\'s checklist when it is running one', async ($, on) => {
  const checklist = {
    phase: 'working',
    tasks: [
      { id: 'step-1', name: 'Read your notes', status: 'done' },
      { id: 'step-2', name: 'Build the page', status: 'active' },
      { id: 'step-3', name: 'Check the page', status: 'upcoming' },
    ],
  }
  await boot($, on, checklist)
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Something else', status: 'pending', activeForm: 'x' }] })
  const text = await pane($)
  expect(text).toMatch(/1 of 3 done/)
  expect(text).toMatch(/Now: Build the page/)
  expect(text).not.toMatch(/Something else/)
})

test('/team: version, options, off', async ($, on) => {
  const world = await boot($, on)
  expect((await $.command.run({ command: 'team', args: 'version' })).text).toBe('Team Tracker version 0.1.0')
  expect((world.published.options as Array<{ key: string }>).map(o => o.key)).toEqual(['open', 'cost', 'status'])
  expect((await $.command.run({ command: 'team', args: 'set cost off' })).text).toBe('Team Tracker: cost is now off.')
  expect((await $.command.run({ command: 'team', args: 'set colour blue' })).text).toMatch(/cost on\|off/)
  await $.tool.call({ tool: 'Agent', description: 'Write the pricing copy', prompt: '...' })
  let text = await pane($)
  expect(text).toMatch(/220K tokens/)
  expect(text).not.toMatch(/\$/)

  expect((await $.command.run({ command: 'team', args: 'off' })).text).toBe('Team Tracker is off.')
  text = await pane($)
  expect(text).toMatch(/Team Tracker is off/)
  expect((await $.command.run({ command: 'team', args: '' })).text).toBe('Opening the Team pane.')
  await world.clock.settle()
  expect(world.opened).toEqual(['team'])
})

test('rows fit the pane at a narrow and a wide width', async ($, on) => {
  await boot($, on, { phase: 'working', tasks: [{ id: 'step-1', name: 'Build the whole landing page today', status: 'active' }] })
  await $.tool.call({ tool: 'Agent', description: 'Write the pricing copy for every plan we offer', prompt: '...' })
  for (const columns of [26, 120]) {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: columns } })
    for (const t of await ui.findAll({ type: 'Text' })) {
      for (const line of t.text.split('\n')) expect(line.length <= columns).toBe(true)
    }
    await ui.unmount()
  }
})
