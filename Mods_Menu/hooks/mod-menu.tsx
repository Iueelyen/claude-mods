import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

type Dollar = EngineInterface

const PANE = 'mod-menu'
const VERSION = '0.3.4' // keep in step with .claude-plugin/plugin.json

const COLOR = {
  gold: '#F2C46D',
  hair: '#262B33',
  muted: '#7D8590',
  text: '#E6EDF3',
  green: '#3DD68C',
  ink: '#0D1117',
} as const

const selectedAtom = atom({ plugin: 'mod-menu', key: 'selected' } as const, null)

const GROUPS = ['General', 'Behavior', 'Data'] as const
/** Below this the panel stacks into one column. */
const TWO_COLUMNS_AT = 70

/**
 * One option as a mod publishes it in its own `options` state. The menu changes
 * it by running `/<command> set <key> <value>` (a toggle's value is on or off).
 */
type ModOption = {
  key: string
  label: string
  kind: 'toggle' | 'choice' | 'action'
  value: string
  choices?: Array<{ value: string; label: string }>
  actionLabel?: string
  hint?: string
  group?: (typeof GROUPS)[number]
}

/** What the panel knows about one mod; `isOn` undefined means the mod isn't loaded. */
type ModRow = {
  id: string
  title: string
  summary: string
  commands: string[]
  /** The mod's own command, and the arguments that switch it on and off; none for the menu itself. */
  command: string | null
  onArgs: string
  offArgs: string
  isOn: boolean | undefined
  /** The version the mod publishes; undefined when it isn't loaded or doesn't say. */
  version: string | undefined
  options: ModOption[]
  /** Commands the mod holds, each with what it does: drawn as a COMMANDS section. */
  commandList?: Array<{ name: string; description: string }>
}

/** A value a mod never wrote (version 0) means that mod isn't loaded here. */
function asSwitch(held: { value?: unknown; version: number }): boolean | undefined {
  return held.version === 0 ? undefined : held.value === true
}

function asVersion(held: { value?: unknown }): string | undefined {
  return typeof held.value === 'string' && held.value !== '' ? held.value : undefined
}

/** A mod's published command list, as `/name` entries after its own control command. */
function asCommandList(control: string, held: { value?: unknown }): string[] {
  const list = Array.isArray(held.value) ? (held.value as Array<{ name?: unknown }>) : []
  return [control, ...list.filter(c => typeof c.name === 'string').map(c => `/${String(c.name)}`)]
}

/** A mod's published commands with their descriptions, for the COMMANDS section. */
function asCommandDetails(held: { value?: unknown }): Array<{ name: string; description: string }> {
  const list = Array.isArray(held.value) ? (held.value as Array<{ name?: unknown; description?: unknown }>) : []
  return list
    .filter(c => typeof c.name === 'string')
    .map(c => ({ name: String(c.name), description: typeof c.description === 'string' ? c.description : '' }))
}

function asOptions(held: { value?: unknown }): ModOption[] {
  return Array.isArray(held.value) ? (held.value as ModOption[]) : []
}

// Each mod's own switch and options, read from the state it publishes (read-only here).
// A new mod joins the control panel with one entry here.
async function readMods($: Dollar): Promise<ModRow[]> {
  return [
    {
      id: 'clean-view',
      title: 'Clean View',
      summary: 'Hides tool calls, file changes and command output while Claude works, and shows one plain checklist above the prompt.',
      commands: ['/simple', '/simple set'],
      command: 'simple',
      onArgs: 'on',
      offArgs: 'off',
      isOn: asSwitch(await $.state.get({ plugin: 'clean-view', key: 'cleanViewEnabled' })),
      version: asVersion(await $.state.get({ plugin: 'clean-view', key: 'version' })),
      options: asOptions(await $.state.get({ plugin: 'clean-view', key: 'options' })),
    },
    {
      id: 'prompt-upgrade',
      title: 'Prompt Upgrade',
      summary: 'Asks a few quick questions, rewrites your prompt and shows both side by side. Nothing is sent until you press Run it.',
      commands: ['/better', '/better history', '/better set'],
      command: 'better',
      onArgs: 'enable',
      offArgs: 'disable',
      isOn: asSwitch(await $.state.get({ plugin: 'prompt-upgrade', key: 'isEnabled' })),
      version: asVersion(await $.state.get({ plugin: 'prompt-upgrade', key: 'version' })),
      options: asOptions(await $.state.get({ plugin: 'prompt-upgrade', key: 'options' })),
    },
    {
      id: 'usage-meter',
      title: 'Usage Meter',
      summary: 'Shows your 5-hour and weekly plan usage as small bars under the prompt, with the time the 5-hour limit resets.',
      commands: ['/meter', '/meter set'],
      command: 'meter',
      onArgs: 'on',
      offArgs: 'off',
      isOn: asSwitch(await $.state.get({ plugin: 'usage-meter', key: 'isEnabled' })),
      version: asVersion(await $.state.get({ plugin: 'usage-meter', key: 'version' })),
      options: asOptions(await $.state.get({ plugin: 'usage-meter', key: 'options' })),
    },
    {
      id: 'reflect',
      title: 'Reflect',
      summary: 'When you correct Claude in a lasting way, offers to save it as a rule for this project, all your projects, or a skill.',
      commands: ['/reflect', '/reflect set'],
      command: 'reflect',
      onArgs: 'on',
      offArgs: 'off',
      isOn: asSwitch(await $.state.get({ plugin: 'reflect', key: 'isEnabled' })),
      version: asVersion(await $.state.get({ plugin: 'reflect', key: 'version' })),
      options: asOptions(await $.state.get({ plugin: 'reflect', key: 'options' })),
    },
    {
      id: 'team-tracker',
      title: 'Team Tracker',
      summary: 'A Team pane: how far the job is, every helper Claude sends off, how long each has run and roughly what it would cost.',
      commands: ['/team', '/team set'],
      command: 'team',
      onArgs: 'on',
      offArgs: 'off',
      isOn: asSwitch(await $.state.get({ plugin: 'team-tracker', key: 'isEnabled' })),
      version: asVersion(await $.state.get({ plugin: 'team-tracker', key: 'version' })),
      options: asOptions(await $.state.get({ plugin: 'team-tracker', key: 'options' })),
    },
    {
      id: 'my-commands',
      title: 'My Commands',
      summary: 'Your own slash commands in every chat. Each is one instructions file in the mod; type its name to run it.',
      commands: asCommandList('/mycommands', await $.state.get({ plugin: 'my-commands', key: 'commands' })),
      command: 'mycommands',
      onArgs: 'on',
      offArgs: 'off',
      isOn: asSwitch(await $.state.get({ plugin: 'my-commands', key: 'isEnabled' })),
      version: asVersion(await $.state.get({ plugin: 'my-commands', key: 'version' })),
      options: asOptions(await $.state.get({ plugin: 'my-commands', key: 'options' })),
      commandList: asCommandDetails(await $.state.get({ plugin: 'my-commands', key: 'commands' })),
    },
    {
      id: 'mod-menu',
      title: 'Mods menu',
      summary: 'This control panel. It switches your mods and their options; each mod keeps its own settings.',
      commands: ['/mods'],
      command: null,
      onArgs: '',
      offArgs: '',
      isOn: true,
      version: VERSION,
      options: [],
    },
  ]
}

// ---------------------------------------------------------------------------
// Changes go through each mod's own command, so there is one setting per mod.

async function switchMod($: Dollar, mod: ModRow, value: boolean): Promise<void> {
  if (mod.command === null) return
  await $.command.run({ command: mod.command, args: value ? mod.onArgs : mod.offArgs })
}

async function setOption($: Dollar, mod: ModRow, key: string, value: string): Promise<void> {
  if (mod.command === null) return
  await $.command.run({ command: mod.command, args: `set ${key} ${value}` })
}

async function select($: Dollar, id: string): Promise<void> {
  await update($, selectedAtom, () => id)
}

async function openMenu($: Dollar): Promise<void> {
  const opened = await $.ui.open({ id: PANE, title: 'Mods', focus: true, closeOnEscape: true, rows: 24, columns: 100 })
  if (!opened.isPlaced) $.ui.toast('The window is too narrow for the Mods menu. Widen it and type /mods again.')
}

function fit(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length > width) return text.slice(0, Math.max(0, width - 1)) + '…'
  return text + ' '.repeat(width - text.length)
}

function wrapLines(text: string, width: number): string[] {
  const w = Math.max(1, width)
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(x => x !== '')) {
    const piece = word.length > w ? word.slice(0, w) : word
    if (line === '') line = piece
    else if (line.length + 1 + piece.length <= w) line += ` ${piece}`
    else {
      out.push(line)
      line = piece
    }
  }
  if (line !== '') out.push(line)
  return out
}

/** Packs items (by width) into rows no wider than `width`, `gap` cells apart. */
function packRows<T extends { width: number }>(items: T[], width: number, gap: number): T[][] {
  const rows: T[][] = []
  let row: T[] = []
  let used = 0
  for (const item of items) {
    const need = (row.length === 0 ? 0 : gap) + item.width
    if (row.length > 0 && used + need > width) {
      rows.push(row)
      row = []
      used = 0
    }
    used += row.length === 0 ? item.width : need
    row.push(item)
  }
  if (row.length > 0) rows.push(row)
  return rows
}

// ---------------------------------------------------------------------------

export function registerModMenu(on: On): void {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mods', description: 'Open the Mods control panel: switch mods and their options' })
    return next(e)
  })

  on('command.run', { command: 'mods' }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'version') return { text: `Mods menu version ${VERSION}` }
    $.clock.after(0, () => {
      void openMenu($).catch(() => undefined)
    })
    return { text: 'Opening the Mods menu.' }
  }).catch(() => ({ text: 'The Mods menu hit a problem and could not open.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const cols = Math.max(24, e.props.bodyColumns)
    const mods = await readMods($)
    const picked = await read($, selectedAtom)
    const current = mods.find(m => m.id === picked) ?? mods.find(m => m.isOn !== undefined) ?? mods[0]!

    type Line = ReturnType<typeof Text>
    const blank = () => <Text> </Text>
    const rule = (width: number) => <Text color={COLOR.hair}>{'─'.repeat(Math.max(0, width))}</Text>
    const heading = (label: string, width: number) => <Text color={COLOR.muted}>{fit(label.toUpperCase(), width)}</Text>

    // A pill. Chosen: dark bold text on the same gold as the app's gold text (about 11.6:1
    // contrast, the same in either theme since both colours are fixed). It is drawn as a
    // keyed Box, not a Button: it is already chosen, and a desktop draws a Button natively,
    // dropping any colour on what is inside it. Not chosen: a plain Button drawn dim.
    const pill = (key: string, label: string, isChosen: boolean, onPress: () => void) =>
      isChosen ? (
        <Box key={key} backgroundColor={COLOR.gold}>
          <Text backgroundColor={COLOR.gold} color={COLOR.ink} bold>
            {` ${label} `}
          </Text>
        </Box>
      ) : (
        <Button key={key} plain dimColor label={` ${label} `} onPress={onPress} />
      )

    // -- Header -----------------------------------------------------------------

    const installed = mods.filter(m => m.isOn !== undefined).length
    const switchedOn = mods.filter(m => m.isOn === true).length
    const summary = `${installed} installed · ${switchedOn} on`
    const top = [
      <Box flexDirection="row" width={cols} justifyContent="space-between">
        <Text bold color={COLOR.text}>
          MODS
        </Text>
        <Text color={COLOR.muted}>{summary.length + 5 <= cols ? summary : ''}</Text>
      </Box>,
      <Text wrap="truncate-end">
        <Text color={COLOR.gold}>━━━━</Text>
        <Text color={COLOR.hair}>{'─'.repeat(Math.max(0, cols - 4))}</Text>
      </Text>,
    ]

    // -- Left column: the list ---------------------------------------------------

    const isWide = cols >= TWO_COLUMNS_AT
    const leftWidth = isWide ? Math.min(26, Math.max(18, ...mods.map(m => m.title.length + 6))) : cols
    const rightWidth = isWide ? cols - leftWidth - 2 : cols

    const left: Line[] = [heading('Installed', leftWidth), blank()]
    for (const mod of mods) {
      const isPicked = mod.id === current.id
      const dot = mod.isOn === undefined ? '·' : mod.isOn ? '●' : '○'
      const dotColor = mod.isOn === true ? COLOR.green : COLOR.muted
      const name = fit(mod.title, leftWidth - 4)
      // The picked row is a gold Box (already picked, so no Button); the others keep their
      // coloured dot outside the Button, where a desktop still draws its colour.
      left.push(
        isPicked ? (
          <Box key={`pick-${mod.id}`} backgroundColor={COLOR.gold} width={leftWidth - 1}>
            <Text backgroundColor={COLOR.gold} color={COLOR.ink} bold>
              {` ${dot} ${name}`}
            </Text>
          </Box>
        ) : (
          <Box flexDirection="row">
            <Text color={dotColor}>{` ${dot} `}</Text>
            <Button
              key={`pick-${mod.id}`}
              plain
              dimColor={mod.isOn === undefined}
              label={name}
              onPress={() => void select($, mod.id)}
            />
          </Box>
        ),
      )
    }

    // -- Right column: the selected mod -----------------------------------------

    const right: Line[] = []
    const switchCell =
      current.isOn === undefined ? (
        <Text color={COLOR.muted}>Not installed</Text>
      ) : current.command === null ? (
        <Text color={COLOR.muted}>Always on</Text>
      ) : (
        <Box flexDirection="row">
          {pill(`switch-${current.id}-off`, 'OFF', current.isOn === false, () => void switchMod($, current, false))}
          {pill(`switch-${current.id}-on`, 'ON', current.isOn === true, () => void switchMod($, current, true))}
        </Box>
      )
    right.push(
      <Box flexDirection="row" width={rightWidth} justifyContent="space-between">
        <Text wrap="truncate-end">
          <Text color={COLOR.gold} bold>
            {fit(current.title, Math.min(current.title.length, Math.max(4, rightWidth - 14)))}
          </Text>
          <Text color={COLOR.muted}>
            {fit(
              current.version === undefined ? '' : ` · v${current.version}`,
              Math.max(0, rightWidth - 14 - current.title.length),
            )}
          </Text>
        </Text>
        {switchCell}
      </Box>,
    )
    for (const line of wrapLines(current.summary, rightWidth)) right.push(<Text color={COLOR.muted}>{line}</Text>)
    right.push(rule(rightWidth))

    if (current.isOn === undefined) {
      right.push(<Text color={COLOR.text}>{fit('This mod isn’t installed on this computer.', rightWidth)}</Text>)
    } else if (current.isOn === false && current.options.length > 0) {
      right.push(<Text color={COLOR.muted}>{fit(`${current.title} is off. These apply when it’s on.`, rightWidth)}</Text>)
    }

    // Each command with what it does: the name in gold, the description wrapped beside it.
    const commandList = current.isOn === undefined ? [] : (current.commandList ?? [])
    if (commandList.length > 0) {
      right.push(heading('Commands', rightWidth))
      const nameWidth = Math.min(Math.max(...commandList.map(c => c.name.length + 1)) + 2, Math.floor(rightWidth / 3))
      const descWidth = Math.max(8, rightWidth - nameWidth)
      for (const c of commandList) {
        const lines = wrapLines(c.description, descWidth)
        right.push(
          <Text wrap="truncate-end">
            <Text color={COLOR.gold} bold>
              {fit(`/${c.name}`, nameWidth)}
            </Text>
            <Text color={COLOR.text}>{lines[0] ?? ''}</Text>
          </Text>,
        )
        for (const line of lines.slice(1)) right.push(<Text color={COLOR.text}>{`${' '.repeat(nameWidth)}${line}`}</Text>)
      }
    }

    const labelWidth = Math.min(22, Math.max(10, Math.floor(rightWidth * 0.4)))
    for (const group of GROUPS) {
      const inGroup = current.isOn === undefined ? [] : current.options.filter(o => (o.group ?? 'General') === group)
      if (inGroup.length === 0) continue
      right.push(heading(group, rightWidth))
      for (const opt of inGroup) {
        const id = `opt-${current.id}-${opt.key}`
        const controls =
          opt.kind === 'toggle'
            ? [
                { value: 'off', label: 'Off' },
                { value: 'on', label: 'On' },
              ]
            : opt.kind === 'choice'
              ? (opt.choices ?? [])
              : []
        if (opt.kind === 'action') {
          const label = opt.actionLabel ?? opt.label
          const room = Math.max(0, rightWidth - label.length - 5) // the terminal draws "[ label ]"
          const text = opt.hint !== undefined ? `${opt.label}  ${opt.hint}` : opt.label
          right.push(
            <Box flexDirection="row" width={rightWidth} justifyContent="space-between">
              <Text>
                <Text color={COLOR.text}>{fit(opt.label, Math.min(opt.label.length, room))}</Text>
                <Text color={COLOR.muted}>{fit(text.slice(opt.label.length), Math.max(0, room - opt.label.length))}</Text>
              </Text>
              <Button
                key={id}
                variant="secondary"
                label={fit(label, Math.min(label.length, rightWidth - 4))}
                onPress={() => void setOption($, current, opt.key, opt.value)}
              />
            </Box>,
          )
          continue
        }
        // A segmented control: the choices side by side, the current one in gold.
        const segments = controls.map(c => {
          const label = fit(c.label, Math.min(c.label.length, rightWidth - 2))
          return {
            width: label.length + 2,
            el: pill(`${id}-${c.value}`, label, c.value === opt.value, () => void setOption($, current, opt.key, c.value)),
          }
        })
        const segmentsWidth = segments.reduce((n, s) => n + s.width, 0)
        if (labelWidth + segmentsWidth <= rightWidth) {
          right.push(
            <Box flexDirection="row" width={rightWidth}>
              <Text color={COLOR.text}>{fit(opt.label, rightWidth - segmentsWidth)}</Text>
              <Box flexDirection="row">{segments.map(s => s.el)}</Box>
            </Box>,
          )
        } else {
          right.push(<Text color={COLOR.text}>{fit(opt.label, rightWidth)}</Text>)
          for (const row of packRows(segments, rightWidth - 2, 0)) {
            right.push(
              <Box flexDirection="row" paddingLeft={2}>
                {row.map(s => s.el)}
              </Box>,
            )
          }
        }
        if (opt.hint !== undefined) right.push(<Text color={COLOR.muted}>{fit(`  ${opt.hint}`, rightWidth)}</Text>)
      }
    }
    right.push(blank(), <Text color={COLOR.muted}>{fit(`Commands: ${current.commands.join(', ')}`, rightWidth)}</Text>)

    // -- Put it together ----------------------------------------------------------

    const footer = <Text color={COLOR.muted}>{fit('Click a mod to see its settings · Esc closes', cols)}</Text>

    if (!isWide) {
      return (
        <Box flexDirection="column" width={cols}>
          {top}
          {left}
          {blank()}
          {right}
          {blank()}
          {footer}
        </Box>
      )
    }

    const height = Math.max(left.length, right.length)
    const rows = Array.from({ length: height }, (_, i) => (
      <Box flexDirection="row" width={cols}>
        <Box width={leftWidth}>{left[i] ?? blank()}</Box>
        <Text color={COLOR.hair}>│ </Text>
        <Box width={rightWidth}>{right[i] ?? blank()}</Box>
      </Box>
    ))

    return (
      <Box flexDirection="column" width={cols}>
        {top}
        {rows}
        {rule(cols)}
        {footer}
      </Box>
    )
  })
}
