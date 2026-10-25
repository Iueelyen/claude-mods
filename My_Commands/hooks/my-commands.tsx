import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { MyCommand } from '../types'
import { commandName, fillIn, parseCommand } from './library'
import type { CommandFile } from './library'

type Dollar = EngineInterface

const VERSION = '0.1.1' // keep in step with .claude-plugin/plugin.json
const CONTROL = 'mycommands'
const STORE_ENABLED = 'isEnabled'

// Shared state (see types/index.d.ts): the Mods menu reads version, isEnabled and commands.
const versionAtom = atom({ plugin: 'my-commands', key: 'version' } as const, VERSION)
const enabledAtom = atom({ plugin: 'my-commands', key: 'isEnabled' } as const, true)
const commandsAtom = atom({ plugin: 'my-commands', key: 'commands' } as const, [])
const optionsAtom = atom({ plugin: 'my-commands', key: 'options' } as const, [])

// The library as read at session start: name -> file. A reload reads it again.
const library = new Map<string, CommandFile>()

function trimSlash(path: string): string {
  return path.replace(/[\\/]+$/, '')
}

/** Reads every `library/<name>.md` and registers it as `/<name>`. */
async function loadLibrary($: Dollar): Promise<void> {
  library.clear()
  const folder = `${trimSlash($.plugin.root)}/library`
  let entries: Awaited<ReturnType<Dollar['fs']['list']>> = []
  try {
    entries = await $.fs.list(folder)
  } catch {
    entries = []
  }
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const name = commandName(entry.name)
    if (name === null || name === CONTROL) continue
    try {
      const text = await $.fs.read(`${folder}/${entry.name}`)
      const command = parseCommand(name, String(text))
      await $.command.register({
        name,
        description: command.description,
        ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
      })
      library.set(name, command)
    } catch {
      // An unreadable file, or a name Claude Code already uses: left out, and /mycommands list says so.
    }
  }
  const listed: MyCommand[] = [...library.values()].map(c => ({
    name: c.name,
    description: c.description,
    ...(c.argumentHint ? { argumentHint: c.argumentHint } : {}),
  }))
  await update($, commandsAtom, () => listed)
}

function listText(): string {
  if (library.size === 0) return 'My Commands has no commands yet.'
  return ['My Commands:', ...[...library.values()].map(c => `  /${c.name}: ${c.description}`)].join('\n')
}

// ---------------------------------------------------------------------------

export function registerMyCommands(on: On): void {
  on('session.start', async ($, e, next) => {
    await update($, versionAtom, () => VERSION)
    await update($, optionsAtom, () => [])
    const enabled = await $.store.get(STORE_ENABLED)
    await update($, enabledAtom, () => enabled !== false)
    await $.command.register({
      name: CONTROL,
      description: 'List your own commands, or turn them on or off',
      argumentHint: 'list | on | off | version',
    })
    await loadLibrary($)
    return next(e)
  })

  // The control command: /mycommands list|on|off|version.
  on('command.run', { command: CONTROL }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'version') return { text: `My Commands version ${VERSION}` }
    if (arg === 'on' || arg === 'off') {
      await update($, enabledAtom, () => arg === 'on')
      await $.store.set(STORE_ENABLED, arg === 'on')
      return { text: arg === 'on' ? 'My Commands is on.' : 'My Commands is off. Your commands do nothing until you turn it back on.' }
    }
    if (arg === '' || arg === 'list') return { text: listText() }
    return { text: 'Use /mycommands, /mycommands on, /mycommands off or /mycommands version.' }
  }).catch(() => ({ text: 'My Commands hit a problem and changed nothing.' }))

  // Each library command: hand its instructions to Claude as if the person had typed them.
  on('command.run', async ($, e, next) => {
    const command = library.get(e.command)
    if (command === undefined) return next(e)
    if (!(await read($, enabledAtom))) return { text: 'My Commands is off. Turn it on in /mods or with /mycommands on.' }
    const text = fillIn(command.body, e.args)
    // Answer at once; the instructions start their own turn just after.
    $.clock.after(0, () => {
      void $.prompt.submit({ text, asUser: true }).catch(() => undefined)
    })
    return { text: `Running /${command.name}.` }
  }).catch(($, e, next) => next(e))
}
