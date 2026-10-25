import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { commandName, fillIn, parseCommand } from '../hooks/library'

type Engine = Parameters<Parameters<typeof test>[1]>[0]

const WRAPUP = `---\ndescription: End-of-session wrap-up\n---\n\nWrap up. Extra: $ARGUMENTS\n`
const TODO = `---\r\ndescription: Show what's left to do\r\nargument-hint: "[focus]"\r\n---\r\nShow the list. Focus: $ARGUMENTS\r\n`

// What the library folder holds in these tests (the engine hands paths in this computer's own form).
const FILES: Record<string, string> = { 'wrapup.md': WRAPUP, 'todo.md': TODO, 'Bad Name.md': 'x', 'notes.txt': 'x' }

type World = { registered: string[]; submitted: Array<{ text: string; origin: unknown }>; published: Record<string, unknown> }

// Nothing sits beneath the plugin: these hooks stand for the engine and the disk.
function engine(on: On) {
  const world: World = { registered: [], submitted: [], published: {} }
  const clock = mock.clock(on)
  mock.store(on)
  on('state.set', (_, e, next) => {
    const w = e as { plugin: string; key: string; value: unknown }
    if (w.plugin === 'my-commands') world.published[w.key] = w.value
    return next(e)
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => {
    world.registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('fs.list', (_, e) =>
    /[\\/]library$/.test(e.path) ? { value: Object.keys(FILES).map(name => ({ name, type: 'file' })) } : { value: [] },
  )
  on('fs.read', (_, e) => ({ value: FILES[e.path.split(/[\\/]/).pop() ?? ''] ?? '' }))
  on('prompt.submit', (_, e) => {
    world.submitted.push({ text: e.text, origin: e.origin })
    return { text: e.text }
  })
  // A command none of the mod's: the engine answers it.
  on('command.run', (_, e) => ({ text: `engine ran /${e.command}` }))
  return { ...world, clock }
}

async function boot($: Engine, on: On) {
  const world = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return world
}

// ---------------------------------------------------------------------------

test('reading a command file', () => {
  expect(commandName('wrapup.md')).toBe('wrapup')
  expect(commandName('Todo.md')).toBe('todo')
  expect(commandName('Bad Name.md')).toBeNull()
  expect(commandName('notes.txt')).toBeNull()

  expect(parseCommand('todo', TODO)).toEqual({
    name: 'todo',
    description: "Show what's left to do",
    argumentHint: '[focus]',
    body: 'Show the list. Focus: $ARGUMENTS',
  })
  // No frontmatter: described by its first line, skipping a comment line.
  expect(parseCommand('hello', '<!-- a note -->\nSay hello to $ARGUMENTS.\n').description).toBe('Say hello to $ARGUMENTS.')

  expect(fillIn('Focus: $ARGUMENTS ($ARGUMENTS)', '  pricing ')).toBe('Focus: pricing (pricing)')
  expect(fillIn('Focus: $ARGUMENTS', '')).toBe('Focus: (nothing)')
})

test('every .md in the library becomes a plain /command, and the Mods menu gets the list', async ($, on) => {
  const world = await boot($, on)
  expect(world.registered.sort()).toEqual(['mycommands', 'todo', 'wrapup'])
  expect(world.published.version).toBe('0.1.1')
  expect(world.published.isEnabled).toBe(true)
  expect(world.published.commands).toEqual([
    { name: 'todo', description: "Show what's left to do", argumentHint: '[focus]' },
    { name: 'wrapup', description: 'End-of-session wrap-up' },
  ])
})

test('running a command hands its instructions to Claude as the person\'s own words', async ($, on) => {
  const world = await boot($, on)
  expect((await $.command.run({ command: 'todo', args: 'pricing' })).text).toBe('Running /todo.')
  await world.clock.settle()
  expect(world.submitted).toEqual([
    { text: 'Show the list. Focus: pricing', origin: { kind: 'plugin', name: 'my-commands', asUser: true } },
  ])

  // Anything else goes to the engine as before.
  expect((await $.command.run({ command: 'compact', args: '' })).text).toBe('engine ran /compact')
})

test('/mycommands: list, version, off and on', async ($, on) => {
  const world = await boot($, on)
  expect((await $.command.run({ command: 'mycommands', args: '' })).text).toBe(
    "My Commands:\n  /todo: Show what's left to do\n  /wrapup: End-of-session wrap-up",
  )
  expect((await $.command.run({ command: 'mycommands', args: 'version' })).text).toBe('My Commands version 0.1.1')

  await $.command.run({ command: 'mycommands', args: 'off' })
  expect(world.published.isEnabled).toBe(false)
  expect((await $.command.run({ command: 'wrapup', args: '' })).text).toMatch(/My Commands is off/)
  await world.clock.settle()
  expect(world.submitted).toEqual([])

  await $.command.run({ command: 'mycommands', args: 'on' })
  expect((await $.command.run({ command: 'wrapup', args: '' })).text).toBe('Running /wrapup.')
  await world.clock.settle()
  expect(world.submitted.map(s => s.text)).toEqual(['Wrap up. Extra: (nothing)'])
})
