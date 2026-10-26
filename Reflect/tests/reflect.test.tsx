import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { DEFAULT_SETTINGS, HEADING, addRule, parseVerdict, placesFor, shouldCheck } from '../hooks/logic'

type Engine = Parameters<Parameters<typeof test>[1]>[0]

const BAND = {
  plugin: 'reflect',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const VERDICT = JSON.stringify({ isRule: true, rule: 'Never use em dashes', place: 'everywhere', skill: null })

type World = { files: Record<string, string>; toasts: string[]; models: string[]; published: Record<string, unknown> }

// The engine hands file calls a path in this computer's own form (C:\home\...):
// compare them in one form.
const norm = (path: string) => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')

// Nothing sits beneath the plugin: these hooks stand for the engine, the disk and the model.
function engine(on: On, files: Record<string, string> = {}, reply: string = VERDICT): World & { clock: ReturnType<typeof mock.clock> } {
  const world: World = { files, toasts: [], models: [], published: {} }
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 24, 12) })
  mock.store(on)
  on('state.set', (_, e, next) => {
    const w = e as { plugin: string; key: string; value: unknown }
    if (w.plugin === 'reflect') world.published[w.key] = w.value
    return next(e)
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.root', () => ({ value: '/work/site' }))
  on('env.get', (_, e) => ({ value: e.name === 'USERPROFILE' ? '/home/chris' : undefined }))
  on('fs.list', (_, e) =>
    norm(e.path) === '/home/chris/.claude/skills' ? { value: [{ name: 'writing', type: 'dir' }] } : { value: [] },
  )
  on('fs.exists', (_, e) => ({
    value: norm(e.path) === '/home/chris/.claude/skills/writing/SKILL.md' || norm(e.path) in world.files,
  }))
  on('fs.read', (_, e) => ({ value: world.files[norm(e.path)] ?? '' }))
  on('fs.write', (_, e) => {
    world.files[norm(e.path)] = e.text
    return { value: undefined }
  })
  on('model.complete', (_, e) => {
    world.models.push(e.model)
    return { value: { isAnswered: true, text: reply, usage: USAGE } }
  })
  on('ui.toast', (_, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  return { ...world, clock, files: world.files, toasts: world.toasts, models: world.models, published: world.published }
}

async function boot($: Engine, on: On, files?: Record<string, string>, reply?: string) {
  const world = engine(on, files, reply)
  await $.session.start({ cwd: '/work/site', surface: 'terminal', isInteractive: true })
  return world
}

const typed = (text: string) => ({ text, origin: { kind: 'composer' as const }, wait: false })

// ---------------------------------------------------------------------------

test('which messages get the model check', () => {
  const base = { originKind: 'composer', isAsUser: false, hasCommand: false, isMeta: false }
  expect(shouldCheck({ ...base, text: 'Never use em dashes in anything you write' })).toBe(true)
  expect(shouldCheck({ ...base, text: 'From now on, run the tests first' })).toBe(true)
  expect(shouldCheck({ ...base, text: 'Build me a landing page' })).toBe(false) // sounds like a task, free word check says no
  expect(shouldCheck({ ...base, text: '> never mind that, just send it' })).toBe(false)
  expect(shouldCheck({ ...base, text: '/simple off' })).toBe(false)
  expect(shouldCheck({ ...base, text: 'never do that', hasCommand: true })).toBe(false)
  expect(shouldCheck({ ...base, text: 'never do that', originKind: 'scheduled-trigger' })).toBe(false)
  expect(shouldCheck({ ...base, text: 'never do that', originKind: 'plugin', isAsUser: true })).toBe(true) // Prompt Upgrade's Run it
  expect(shouldCheck({ ...base, text: 'never do that', originKind: 'plugin' })).toBe(false)
  expect(shouldCheck({ ...base, text: 'Never edit the archive', originKind: 'plugin', isAsUser: true, pluginName: 'my-commands' })).toBe(false)
})

test('reading the model\'s verdict', () => {
  expect(parseVerdict(VERDICT, [])).toEqual({ rule: 'Never use em dashes', place: { kind: 'everywhere' } })
  expect(parseVerdict('Sure: {"isRule": true, "rule": "“Keep replies short — always.”", "place": "project"}', [])).toEqual({
    rule: 'Keep replies short, always',
    place: { kind: 'project' },
  })
  // An unknown skill falls back to this project.
  expect(parseVerdict('{"isRule": true, "rule": "Use British spelling", "place": "skill", "skill": "nope"}', ['writing'])?.place).toEqual({
    kind: 'project',
  })
  expect(parseVerdict('{"isRule": true, "rule": "Use British spelling", "place": "skill", "skill": "writing"}', ['writing'])?.place).toEqual({
    kind: 'skill',
    skill: 'writing',
  })
  expect(parseVerdict('{"isRule": false}', [])).toBeNull()
  expect(parseVerdict('not json', [])).toBeNull()
})

test('adding a rule: a new file, an existing section, a duplicate, Windows line endings', () => {
  const fresh = addRule('', 'Never use em dashes', 'Oct 24, 2026')
  expect(fresh.text).toBe(`${HEADING}\n\n- Never use em dashes (saved Oct 24, 2026)\n`)
  expect(fresh.count).toBe(1)

  const withOther = addRule(`# My project\n\nSome notes.\n`, 'Run the tests first', 'Oct 24, 2026')
  expect(withOther.text).toBe(`# My project\n\nSome notes.\n\n${HEADING}\n\n- Run the tests first (saved Oct 24, 2026)\n`)

  const second = addRule(`${fresh.text}\n## Later section\n\nkeep me\n`, 'Keep replies short', 'Oct 25, 2026')
  expect(second.text).toBe(
    `${HEADING}\n\n- Never use em dashes (saved Oct 24, 2026)\n- Keep replies short (saved Oct 25, 2026)\n\n## Later section\n\nkeep me\n`,
  )
  expect(second.count).toBe(2)

  const dup = addRule(fresh.text, 'never use em dashes.', 'Oct 26, 2026')
  expect(dup.isDuplicate).toBe(true)
  expect(dup.text).toBe(fresh.text)

  const crlf = addRule('# Notes\r\n', 'Be brief', 'Oct 24, 2026')
  expect(crlf.text).toBe(`# Notes\r\n\r\n${HEADING}\r\n\r\n- Be brief (saved Oct 24, 2026)\r\n`)
})

test('button order follows the guess, or the "Suggest first" option', () => {
  const at = { project: '/p/CLAUDE.md', everywhere: '/h/CLAUDE.md', skills: [{ skill: 'writing', path: '/h/skills/writing/SKILL.md' }] }
  const guess = { rule: 'x', place: { kind: 'everywhere' as const } }
  expect(placesFor(guess, at, DEFAULT_SETTINGS).map(p => p.kind)).toEqual(['everywhere', 'project', 'skill'])
  expect(placesFor(guess, at, { ...DEFAULT_SETTINGS, suggestFirst: 'project' }).map(p => p.kind)).toEqual([
    'project',
    'everywhere',
    'skill',
  ])
  expect(placesFor(guess, at, { ...DEFAULT_SETTINGS, showSkills: false }).map(p => p.kind)).toEqual(['everywhere', 'project'])
})

test('a correction offers to save it; pressing a place writes the rule there', async ($, on) => {
  const world = await boot($, on)
  await $.prompt.submit(typed('Never use em dashes in anything you write for me'))
  await world.clock.settle()
  expect(world.models).toEqual(['haiku'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    expect(text).toMatch(/Save as a rule\?/)
    expect(text).toMatch(/Never use em dashes/)
    // All projects first (the guess), then this project, then the skill, then No thanks.
    const buttons = (await ui.findAll({ type: 'Button' })).map(b => b.key)
    expect(buttons).toEqual(['reflect-everywhere', 'reflect-project', 'reflect-skill-writing', 'reflect-no'])
    // No colour inside any Button, so a desktop draws it all.
    for (const b of await ui.findAll({ type: 'Button' })) expect(JSON.stringify(b.children ?? [])).not.toMatch(/color/i)
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'reflect-everywhere' })
  await ui.unmount()
  expect(world.files['/home/chris/.claude/CLAUDE.md']).toBe(`${HEADING}\n\n- Never use em dashes (saved Oct 24, 2026)\n`)
  expect(world.toasts).toEqual(['Saved to all your projects. 1 rule there now.'])

  // The offer is gone once used.
  const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await after.find({ type: 'Text', text: /Save as a rule/ })).toBeUndefined()
  await after.unmount()
})

test('saving the same rule twice says so and changes nothing', async ($, on) => {
  const saved = `${HEADING}\n\n- Never use em dashes (saved Oct 20, 2026)\n`
  const world = await boot($, on, { '/home/chris/.claude/CLAUDE.md': saved })
  await $.prompt.submit(typed('Never use em dashes, I told you'))
  await world.clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'reflect-everywhere' })
  await ui.unmount()
  expect(world.files['/home/chris/.claude/CLAUDE.md']).toBe(saved)
  expect(world.toasts).toEqual(['That rule is already saved in all your projects.'])
})

test('ordinary messages cost nothing, and No thanks writes nothing', async ($, on) => {
  const world = await boot($, on)
  await $.prompt.submit(typed('Build me a landing page for the bakery'))
  await world.clock.settle()
  expect(world.models).toEqual([])

  await $.prompt.submit(typed('Always run the tests before you say it works'))
  await world.clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'reflect-no' })
  expect(await ui.find({ type: 'Text', text: /Save as a rule/ })).toBeUndefined()
  await ui.unmount()
  expect(world.files).toEqual({})
})

test('/reflect: off stops the checks; options, version and the Mods menu values', async ($, on) => {
  const world = await boot($, on)
  expect(world.published.version).toBe('0.1.2')
  expect(world.published.isEnabled).toBe(true)
  expect((world.published.options as Array<{ key: string }>).map(o => o.key)).toEqual(['suggest', 'skills'])
  expect((await $.command.run({ command: 'reflect', args: 'version' })).text).toBe('Reflect version 0.1.2')

  expect((await $.command.run({ command: 'reflect', args: 'set suggest project' })).text).toBe('Reflect: suggest is now project.')
  expect((await $.command.run({ command: 'reflect', args: 'set colour blue' })).text).toMatch(/suggest auto\|project\|everywhere/)

  expect((await $.command.run({ command: 'reflect', args: 'off' })).text).toBe('Reflect is off.')
  expect(world.published.isEnabled).toBe(false)
  await $.prompt.submit(typed('Never use em dashes'))
  await world.clock.settle()
  expect(world.models).toEqual([])
})

test('with Claude Code\'s own band placeholder beneath, the Save bar still draws', async ($, on) => {
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  const world = await boot($, on)
  await $.prompt.submit(typed('Never use em dashes in anything you write for me'))
  await world.clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Save as a rule\?/ })).toBeDefined()
    expect(await ui.find({ key: 'reflect-everywhere' })).toBeDefined()
    await ui.unmount()
  }
})
