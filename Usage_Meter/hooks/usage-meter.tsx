import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, SessionRateLimit } from 'claude-code'

import type { UsageMeterOption, UsageMeterReading, UsageMeterSettings, UsageMeterWindow } from '../types'

type Dollar = EngineInterface

// Shared state (see types/index.d.ts): the Mods menu reads `isEnabled` and `options`.
const enabledAtom = atom({ plugin: 'usage-meter', key: 'isEnabled' } as const, true)
const settingsAtom = atom({ plugin: 'usage-meter', key: 'settings' } as const, { colours: true, warn: true })
const optionsAtom = atom({ plugin: 'usage-meter', key: 'options' } as const, [])
const readingAtom = atom({ plugin: 'usage-meter', key: 'reading' } as const, { fiveHour: null, weekly: null })

const STORE_ENABLED = 'isEnabled'
const STORE_SETTINGS = 'settings'

const DEFAULT_SETTINGS: UsageMeterSettings = { colours: true, warn: true }

const BAR_CELLS = 8
const AMBER_AT = 70
const RED_AT = 90

// Windows already warned about this load, keyed by kind and reset time, so each
// window warns once per period.
const warned = new Set<string>()

// ---------------------------------------------------------------------------
// Drawing the line: pure, so the tests can hold it.

export function bar(percent: number): string {
  const filled = Math.max(0, Math.min(BAR_CELLS, Math.round((percent / 100) * BAR_CELLS)))
  return '▰'.repeat(filled) + '▱'.repeat(BAR_CELLS - filled)
}

export function dot(percent: number): string {
  if (percent >= RED_AT) return '🔴'
  if (percent >= AMBER_AT) return '🟡'
  return '🟢'
}

/** `3:15pm` in the engine's local time; undefined for a missing or bad timestamp. */
export function clockTime(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return undefined
  const hours = at.getHours()
  const minutes = String(at.getMinutes()).padStart(2, '0')
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes}${hours < 12 ? 'am' : 'pm'}`
}

function part(label: string, w: UsageMeterWindow, colours: boolean): string {
  const pct = `${Math.round(w.percentUsed)}%`
  return `${label} ${colours ? dot(w.percentUsed) + ' ' : ''}${bar(w.percentUsed)} ${pct}`
}

export function lineOf(r: UsageMeterReading, s: UsageMeterSettings): string {
  if (r.fiveHour === null && r.weekly === null) return 'Usage Meter · waiting for the first reply'
  const parts: string[] = []
  if (r.fiveHour !== null) {
    const reset = clockTime(r.fiveHour.resetsAt)
    parts.push(part('5h', r.fiveHour, s.colours) + (reset === undefined ? '' : ` ↻${reset}`))
  }
  if (r.weekly !== null) parts.push(part('week', r.weekly, s.colours))
  return parts.join('  ·  ')
}

export function readingOf(limits: readonly SessionRateLimit[]): UsageMeterReading {
  const pick = (kind: string): UsageMeterWindow | null => {
    const w = limits.find(l => l.kind === kind)
    return w === undefined ? null : { percentUsed: w.percentUsed, ...(w.resetsAt ? { resetsAt: w.resetsAt } : {}) }
  }
  return { fiveHour: pick('five_hour'), weekly: pick('seven_day') }
}

// ---------------------------------------------------------------------------
// Options: kept in `settings`, published as `options` for a control panel.

const ON_OFF = (b: boolean) => (b ? 'on' : 'off')

export function optionsOf(s: UsageMeterSettings): UsageMeterOption[] {
  return [
    {
      key: 'colours',
      label: 'Warning colours',
      kind: 'toggle',
      value: ON_OFF(s.colours),
      group: 'General',
      hint: 'Green, then amber past 70% and red past 90%.',
    },
    {
      key: 'warn',
      label: 'Pop-up near the limit',
      kind: 'toggle',
      value: ON_OFF(s.warn),
      group: 'Behavior',
      hint: 'A short notice once when the 5-hour or weekly use passes 90%.',
    },
  ]
}

/** Applies `/meter set <key> <value>`; undefined when the key or value isn't one it knows. */
export function applySetting(s: UsageMeterSettings, key: string, value: string): UsageMeterSettings | undefined {
  const flag = value === 'on' ? true : value === 'off' ? false : undefined
  if (flag === undefined) return undefined
  if (key === 'colours' || key === 'colors') return { ...s, colours: flag }
  if (key === 'warn') return { ...s, warn: flag }
  return undefined
}

function asSettings(saved: unknown): UsageMeterSettings {
  const s = (saved ?? {}) as Partial<UsageMeterSettings>
  return {
    colours: typeof s.colours === 'boolean' ? s.colours : DEFAULT_SETTINGS.colours,
    warn: typeof s.warn === 'boolean' ? s.warn : DEFAULT_SETTINGS.warn,
  }
}

// ---------------------------------------------------------------------------

async function redraw($: Dollar): Promise<void> {
  if (!(await read($, enabledAtom))) {
    $.ui.status(undefined)
    return
  }
  $.ui.status(lineOf(await read($, readingAtom), await read($, settingsAtom)))
}

async function setEnabled($: Dollar, value: boolean): Promise<void> {
  await update($, enabledAtom, () => value)
  await $.store.set(STORE_ENABLED, value)
  await redraw($)
}

async function saveSettings($: Dollar, settings: UsageMeterSettings): Promise<void> {
  await update($, settingsAtom, () => settings)
  await update($, optionsAtom, () => optionsOf(settings))
  await $.store.set(STORE_SETTINGS, settings)
  await redraw($)
}

function warnPast90($: Dollar, r: UsageMeterReading): void {
  const windows: Array<[string, UsageMeterWindow | null]> = [
    ['5-hour', r.fiveHour],
    ['weekly', r.weekly],
  ]
  for (const [name, w] of windows) {
    if (w === null || w.percentUsed < RED_AT) continue
    const id = `${name}:${w.resetsAt ?? ''}`
    if (warned.has(id)) continue
    warned.add(id)
    const reset = clockTime(w.resetsAt)
    $.ui.toast(
      `You've used ${Math.round(w.percentUsed)}% of your ${name} limit` +
        (name === '5-hour' && reset !== undefined ? `. It resets at ${reset}.` : '.'),
    )
  }
}

async function take($: Dollar, limits: readonly SessionRateLimit[]): Promise<void> {
  const reading = readingOf(limits)
  await update($, readingAtom, () => reading)
  if ((await read($, enabledAtom)) && (await read($, settingsAtom)).warn) warnPast90($, reading)
  await redraw($)
}

export function registerUsageMeter(on: On): void {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(STORE_ENABLED)
    await update($, enabledAtom, () => (typeof saved === 'boolean' ? saved : true))
    const settings = asSettings(await $.store.get(STORE_SETTINGS))
    await update($, settingsAtom, () => settings)
    await update($, optionsAtom, () => optionsOf(settings))
    await $.command.register({
      name: 'meter',
      description: 'Turn Usage Meter on or off (no argument flips it)',
      argumentHint: 'on | off | set <option> <value>',
    })
    await take($, (await $.session.usage()).rateLimits)
    return next(e)
  })

  // Pushed after each turn, and whenever a window moves a whole point.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await take($, e.rateLimits)
    return next(e)
  })

  // -- /meter on|off|set ---------------------------------------------------------

  on('command.run', { command: 'meter' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const set = /^set\s+(\S+)\s+(\S+)$/.exec(arg)
    if (set !== null) {
      const next = applySetting(await read($, settingsAtom), set[1]!, set[2]!)
      if (next === undefined) return { text: 'Usage Meter options: colours on|off, warn on|off.' }
      await saveSettings($, next)
      return { text: `Usage Meter: ${set[1]} is now ${set[2]}.` }
    }
    const current = await read($, enabledAtom)
    const wanted = arg === 'on' ? true : arg === 'off' ? false : arg === '' ? !current : undefined
    if (wanted === undefined) return { text: 'Use /meter on, /meter off, /meter to flip it, or /meter set <option> <value>.' }
    await setEnabled($, wanted)
    return { text: wanted ? 'Usage Meter is on.' : 'Usage Meter is off.' }
  })
}
