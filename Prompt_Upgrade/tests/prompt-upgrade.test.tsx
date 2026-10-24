import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { decideIntercept, parseQuestions, parseRewrite, wrapLines } from '../hooks/logic'

type Engine = Parameters<Parameters<typeof test>[1]>[0]

const ROUGH = 'write a landing page for my bakery that sells sourdough'
const QUESTIONS = JSON.stringify({
  questions: [
    { question: 'Who is the page for?', options: ['Local families', 'Cafes and shops'] },
    { question: 'What should visitors do?', options: ['Order online', 'Visit the shop', 'Call us'] },
  ],
})
const REWRITE = JSON.stringify({
  prompt: 'Write a landing page for [bakery name], a sourdough bakery, for local families. The main goal is online orders.',
  added: ['A clear goal: online orders', 'Who it is for: local families'],
})

const PANE = {
  plugin: 'prompt-upgrade',
  component: 'Pane',
  requestId: 'prompt-upgrade',
  props: {
    title: 'Prompt Upgrade',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

type Seen = { submitted: string[]; filled: string[]; closed: number; models: string[] }

// Nothing sits beneath the plugin: these hooks stand for the engine.
function engine(on: On, replies: { questions?: string | null; rewrite?: string | null } = {}) {
  const seen: Seen = { submitted: [], filled: [], closed: 0, models: [] }
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => {
    seen.closed += 1
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.fill', (_, e) => {
    seen.filled.push(e.text)
    return { isFilled: true, box: { text: e.text, cursor: e.text.length } }
  })
  on('prompt.submit', (_, e) => {
    seen.submitted.push(e.text)
    return { text: e.text }
  })
  on('model.complete', (_, e) => {
    seen.models.push(e.model)
    const text = e.model === 'haiku' ? replies.questions : replies.rewrite
    if (text === null) {
      return { value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE } }
    }
    return { value: { isAnswered: true, text: text ?? (e.model === 'haiku' ? QUESTIONS : REWRITE), usage: USAGE } }
  })
  return { clock, seen }
}

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

async function boot($: Engine, on: On, replies?: { questions?: string | null; rewrite?: string | null }) {
  const world = engine(on, replies)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return world
}

function typed(text: string, extra: Record<string, unknown> = {}) {
  return { text, origin: { kind: 'composer' as const }, wait: false, ...extra }
}

async function pageText($: Engine, columns = 100) {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: columns } })
  const all = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  await ui.unmount()
  return all
}

// ---------------------------------------------------------------------------

test('which prompts are intercepted and which pass through', async () => {
  const base = { originKind: 'composer', hasCommand: false, isMeta: false, hasAttachments: false, isDuringTurn: false }
  expect(decideIntercept({ ...base, text: ROUGH }).kind).toBe('intercept')
  expect(decideIntercept({ ...base, text: '/compact' }).kind).toBe('pass')
  expect(decideIntercept({ ...base, text: ROUGH, hasCommand: true }).kind).toBe('pass')
  expect(decideIntercept({ ...base, text: ROUGH, hasAttachments: true }).kind).toBe('pass')
  expect(decideIntercept({ ...base, text: ROUGH, isDuringTurn: true }).kind).toBe('pass')
  expect(decideIntercept({ ...base, text: 'yes' }).kind).toBe('pass')
  expect(decideIntercept({ ...base, text: 'Keep going!' }).kind).toBe('pass')
  expect(decideIntercept({ ...base, text: ROUGH, originKind: 'plugin' }).kind).toBe('pass')
  expect(decideIntercept({ ...base, text: '> just send this one as it is' })).toEqual({
    kind: 'strip',
    text: 'just send this one as it is',
  })
})

test('the intercept in a session: typed prompts open the pane, the mod\'s own prompts never loop', async ($, on) => {
  const { clock, seen } = await boot($, on)
  await $.command.run({ command: 'better', args: 'on' })

  const dropped = await $.prompt.submit(typed(ROUGH))
  expect('drop' in dropped).toBe(true)
  await clock.settle()
  expect(await pageText($)).toMatch(/Who is the page for\?/)

  const quoted = await $.prompt.submit(typed('> send this exactly as typed please'))
  expect(seen.submitted).toContain('send this exactly as typed please')
  expect('drop' in quoted).toBe(false)

  const fromPlugin = await $.prompt.submit({ text: ROUGH, origin: { kind: 'plugin', name: 'prompt-upgrade' }, wait: false })
  expect('drop' in fromPlugin).toBe(false)
})

test('reading the questions', async () => {
  expect(parseQuestions(QUESTIONS)).toEqual([
    { question: 'Who is the page for?', options: ['Local families', 'Cafes and shops'] },
    { question: 'What should visitors do?', options: ['Order online', 'Visit the shop', 'Call us'] },
  ])
  // Prose around the JSON, a question with one option, and more than three questions.
  const messy = `Sure! ${JSON.stringify({
    questions: [
      { question: 'A?', options: ['x'] },
      { question: 'B?', options: ['1', '2', '3', '4', '5'] },
      { question: 'C?', options: ['1', '2'] },
      { question: 'D?', options: ['1', '2'] },
      { question: 'E?', options: ['1', '2'] },
    ],
  })} Hope that helps.`
  const read = parseQuestions(messy)
  expect(read.map(q => q.question)).toEqual(['B?', 'C?', 'D?'])
  expect(read[0]?.options.length).toBe(4)
  expect(parseQuestions('no json here')).toEqual([])
})

test('reading the rewrite', async () => {
  expect(parseRewrite(REWRITE)?.added).toEqual(['A clear goal: online orders', 'Who it is for: local families'])
  expect(parseRewrite('Just a plain upgraded prompt.')).toEqual({ prompt: 'Just a plain upgraded prompt.', added: [] })
  expect(parseRewrite('   ')).toBe(null)
})

test('the full flow from /better to Run', async ($, on) => {
  const { clock, seen } = await boot($, on)
  const answer = await $.command.run({ command: 'better', args: ROUGH })
  expect(answer.text).toMatch(/Nothing is sent until you press Run it/)
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /0 of 2 answered/ }))).toBeDefined()
  await ui.press({ key: 'q0-o0' })
  await ui.press({ key: 'q1-other' })
  await ui.input({ key: 'q1-input', text: 'Join the bread club' })
  await clock.settle()

  const all = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  expect(all).toMatch(/WHAT I ADDED/)
  expect(all).toMatch(/\[bakery name\]/)
  expect(all).toMatch(/DETAILS ADDED/)
  expect(seen.models).toEqual(['haiku', 'sonnet'])

  await ui.press({ key: 'run' })
  await clock.settle()
  await ui.unmount()
  expect(seen.submitted).toEqual([JSON.parse(REWRITE).prompt])
  expect(seen.closed).toBe(1)

  // It is in the history now.
  await $.command.run({ command: 'better', args: 'history' })
  await clock.settle()
  expect(await pageText($)).toMatch(/write a landing page for my bakery/)
})

test('Cancel puts the original prompt back in the prompt box', async ($, on) => {
  const { clock, seen } = await boot($, on)
  await $.command.run({ command: 'better', args: ROUGH })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'cancel' })
  await ui.unmount()
  expect(seen.filled).toEqual([ROUGH])
  expect(seen.submitted).toEqual([])
})

test('a failed model call shows a calm error card with a way out', async ($, on) => {
  const { clock, seen } = await boot($, on, { questions: null })
  await $.command.run({ command: 'better', args: ROUGH })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Your prompt is safe/ })).toBeDefined()
  await ui.press({ key: 'send-original' })
  await ui.unmount()
  expect(seen.submitted).toEqual([ROUGH])
})

test('the on and off switch', async ($, on) => {
  const { clock, seen } = await boot($, on)
  // Off by default: a typed prompt goes straight through.
  expect('drop' in (await $.prompt.submit(typed(ROUGH)))).toBe(false)
  await $.command.run({ command: 'better', args: 'on' })
  expect('drop' in (await $.prompt.submit(typed(ROUGH)))).toBe(true)
  await clock.settle()
  await $.command.run({ command: 'better', args: 'off' })
  expect('drop' in (await $.prompt.submit(typed(ROUGH)))).toBe(false)
  expect(seen.submitted).toEqual([ROUGH, ROUGH])
})

test('the whole-mod switch: disabled, nothing is intercepted and /better says how to turn it on', async ($, on) => {
  const { clock, seen } = await boot($, on)
  await $.command.run({ command: 'better', args: 'on' })
  const off = await $.command.run({ command: 'better', args: 'disable' })
  expect(off.text).toMatch(/Prompt Upgrade is off/)
  expect('drop' in (await $.prompt.submit(typed(ROUGH)))).toBe(false)
  expect((await $.command.run({ command: 'better', args: ROUGH })).text).toMatch(/better enable/)
  await clock.settle()
  expect(seen.models).toEqual([])

  await $.command.run({ command: 'better', args: 'enable' })
  // Automatic mode was kept while the mod was off.
  expect('drop' in (await $.prompt.submit(typed(ROUGH)))).toBe(true)
})

test('rows fit the pane at a narrow and a wide width', async ($, on) => {
  const { clock } = await boot($, on)
  await $.command.run({ command: 'better', args: ROUGH })
  await clock.settle()
  const check = async () => {
    for (const columns of [36, 140]) {
      const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: columns } })
      for (const t of await ui.findAll({ type: 'Text' })) {
        for (const line of t.text.split('\n')) expect(line.length <= columns).toBe(true)
      }
      await ui.unmount()
    }
  }
  await check() // the questions
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'q0-skip' })
  await ui.press({ key: 'q1-o0' })
  await clock.settle()
  await ui.unmount()
  expect(await pageText($)).toMatch(/WHAT I ADDED/)
  await check() // the review
  expect(wrapLines('one two three four five', 9)).toEqual(['one two', 'three', 'four five'])
})

test('options: questions 0 skips straight to the rewrite, and the chosen model writes it', async ($, on) => {
  const { clock, seen } = await boot($, on)
  expect((await $.command.run({ command: 'better', args: 'set questions 0' })).text).toBe('Prompt Upgrade: questions is now 0.')
  await $.command.run({ command: 'better', args: 'set model opus' })
  await $.command.run({ command: 'better', args: ROUGH })
  await clock.settle()
  expect(seen.models).toEqual(['opus'])
  expect(await pageText($)).toMatch(/WHAT I ADDED/)
  expect((await $.command.run({ command: 'better', args: 'set model gpt' })).text).toMatch(/model haiku\|sonnet\|opus/)
})

test('options: "wait for a button" keeps the questions up until Upgrade now', async ($, on) => {
  const { clock, seen } = await boot($, on)
  await $.command.run({ command: 'better', args: 'set continue wait' })
  await $.command.run({ command: 'better', args: ROUGH })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'q0-o1' })
  await ui.press({ key: 'q1-skip' })
  await clock.settle()
  expect(seen.models).toEqual(['haiku'])
  expect(await ui.find({ type: 'Text', text: /2 of 2 answered/ })).toBeDefined()
  await ui.press({ key: 'upgrade-now' })
  await clock.settle()
  expect(seen.models).toEqual(['haiku', 'sonnet'])
  await ui.unmount()
})

test('options: clear history', async ($, on) => {
  const { clock } = await boot($, on)
  await $.command.run({ command: 'better', args: ROUGH })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'q0-o0' })
  await ui.press({ key: 'q1-o0' })
  await clock.settle()
  await ui.press({ key: 'run' })
  await clock.settle()
  await ui.unmount()
  expect((await $.command.run({ command: 'better', args: 'history' })).text).toBe('Showing your last 1 upgrades.')
  expect((await $.command.run({ command: 'better', args: 'set history clear' })).text).toBe('Prompt Upgrade: history cleared.')
  expect((await $.command.run({ command: 'better', args: 'history' })).text).toBe('No upgrades yet.')
})
