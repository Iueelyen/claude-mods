// Pure helpers for Team Tracker: no `$`, so the tests can call them directly.

import type { TeamStep, TeamStepStatus, TeamTrackerOption, TeamTrackerSettings } from '../types'

// ---------------------------------------------------------------------------
// Rough cost at Anthropic's API list prices (dollars per million tokens, as of
// October 2026). On a Claude plan the plan covers it: this is only an estimate
// of what the same work would cost through the API.

type Price = { input: number; output: number; cacheRead: number }

const PRICES: Array<[RegExp, Price]> = [
  [/fable|mythos/, { input: 10, output: 50, cacheRead: 0.25 }],
  [/opus-5-5|^opus$/, { input: 4, output: 20, cacheRead: 0.2 }],
  [/opus/, { input: 5, output: 25, cacheRead: 0.5 }],
  [/sonnet-5|^sonnet$/, { input: 2, output: 10, cacheRead: 0.2 }],
  [/sonnet/, { input: 3, output: 15, cacheRead: 0.3 }],
  [/haiku-5|^haiku$/, { input: 0.1, output: 0.5, cacheRead: 0.01 }],
  [/haiku/, { input: 1, output: 5, cacheRead: 0.1 }],
]
/** A model the table doesn't know is priced like the current Sonnet. */
const FALLBACK: Price = { input: 2, output: 10, cacheRead: 0.2 }
/** Writing to the prompt cache costs a quarter more than plain input. */
const CACHE_WRITE = 1.25

export function priceOf(model: string | undefined): Price {
  const name = (model ?? '').toLowerCase().trim()
  return PRICES.find(([match]) => match.test(name))?.[1] ?? FALLBACK
}

export type Usage = {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export function costOf(usage: Usage, model: string | undefined): { tokens: number; usd: number } {
  const p = priceOf(model)
  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const read = usage.cache_read_input_tokens ?? 0
  const write = usage.cache_creation_input_tokens ?? 0
  return {
    tokens: input + output + read + write,
    usd: (input * p.input + output * p.output + read * p.cacheRead + write * p.input * CACHE_WRITE) / 1_000_000,
  }
}

// ---------------------------------------------------------------------------
// How things read on screen.

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export function tokenCount(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function money(usd: number): string {
  return usd < 0.01 ? 'under $0.01' : `$${usd.toFixed(2)}`
}

/** The short model name a helper ran on: Opus, Sonnet, Haiku, Fable. */
export function modelName(model: string | undefined): string | undefined {
  const m = /(fable|mythos|opus|sonnet|haiku)/i.exec(model ?? '')
  return m ? m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase() : undefined
}

export function badgeFor(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return index < 26 ? letters[index]! : `${letters[Math.floor(index / 26) - 1]}${letters[index % 26]}`
}

export function fit(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length > width) return text.slice(0, Math.max(0, width - 1)) + '…'
  return text + ' '.repeat(width - text.length)
}

// ---------------------------------------------------------------------------
// The job's steps, followed from Claude's own to-do tools.

type PlanCall = { items?: Array<{ content: string; status: TeamStepStatus }>; advance?: boolean; done?: number[]; start?: number }

export function applyStepTool(steps: TeamStep[], tool: string, input: Record<string, unknown>, newId: string): TeamStep[] {
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    return (input.todos as Array<{ content: string; status: TeamStepStatus }>).map((t, i) => ({
      id: `todo-${i}`,
      content: String(t.content),
      status: t.status,
    }))
  }
  if (tool === 'TaskCreate') {
    // A finished list makes way for the new job's.
    const kept = steps.length > 0 && steps.every(s => s.status === 'completed') ? [] : steps
    return [...kept, { id: newId, content: String(input.subject ?? ''), status: 'pending' }]
  }
  if (tool === 'TaskUpdate') {
    const id = `task-${String(input.taskId ?? '')}`
    if (input.status === 'deleted') return steps.filter(s => s.id !== id)
    return steps.map(s =>
      s.id === id
        ? {
            ...s,
            status: (input.status as TeamStepStatus | undefined) ?? s.status,
            content: typeof input.subject === 'string' ? input.subject : s.content,
          }
        : s,
    )
  }
  if (tool === 'mcp__ccd_turn__update_plan') {
    const plan = input as PlanCall
    if (Array.isArray(plan.items)) return plan.items.map((t, i) => ({ id: `plan-${i}`, content: t.content, status: t.status }))
    let next = [...steps]
    if (plan.advance) {
      const at = next.findIndex(s => s.status === 'in_progress')
      if (at >= 0) next[at] = { ...next[at]!, status: 'completed' }
      const after = next.findIndex(s => s.status === 'pending')
      if (after >= 0) next[after] = { ...next[after]!, status: 'in_progress' }
    }
    for (const n of plan.done ?? []) if (next[n - 1]) next[n - 1] = { ...next[n - 1]!, status: 'completed' }
    if (typeof plan.start === 'number' && next[plan.start - 1]) {
      next = next.map(s => (s.status === 'in_progress' ? { ...s, status: 'pending' as const } : s))
      next[plan.start - 1] = { ...next[plan.start - 1]!, status: 'in_progress' }
    }
    return next
  }
  return steps
}

/** The task id TaskCreate's result names ("Task #3 created..."), as the step's id. */
export function taskIdOf(resultText: string | undefined, fallback: string): string {
  const m = /#?(\d+)/.exec(resultText ?? '')
  return `task-${m ? m[1] : fallback}`
}

// ---------------------------------------------------------------------------
// Options a control panel draws, and applying `/team set <key> <value>`.

export const DEFAULT_SETTINGS: TeamTrackerSettings = { autoOpen: true, showCost: true, statusLine: true }

export function asSettings(saved: unknown): TeamTrackerSettings {
  const s = (saved ?? {}) as Partial<TeamTrackerSettings>
  return {
    autoOpen: typeof s.autoOpen === 'boolean' ? s.autoOpen : true,
    showCost: typeof s.showCost === 'boolean' ? s.showCost : true,
    statusLine: typeof s.statusLine === 'boolean' ? s.statusLine : true,
  }
}

const ON_OFF = (b: boolean) => (b ? 'on' : 'off')

export function optionsOf(s: TeamTrackerSettings): TeamTrackerOption[] {
  return [
    {
      key: 'open',
      label: 'Open by itself',
      kind: 'toggle',
      value: ON_OFF(s.autoOpen),
      group: 'General',
      hint: 'Opens the Team pane when Claude sends off its first helper, in windows wide enough for a side panel.',
    },
    {
      key: 'cost',
      label: 'Show costs',
      kind: 'toggle',
      value: ON_OFF(s.showCost),
      group: 'General',
      hint: 'A rough cost at API prices. Your Claude plan covers this work.',
    },
    {
      key: 'status',
      label: 'Status line',
      kind: 'toggle',
      value: ON_OFF(s.statusLine),
      group: 'Behavior',
      hint: 'Shows "Team: 2 running, 1 done" while helpers work.',
    },
  ]
}

export function applySetting(s: TeamTrackerSettings, key: string, value: string): TeamTrackerSettings | undefined {
  const flag = value === 'on' ? true : value === 'off' ? false : undefined
  if (flag === undefined) return undefined
  if (key === 'open') return { ...s, autoOpen: flag }
  if (key === 'cost') return { ...s, showCost: flag }
  if (key === 'status') return { ...s, statusLine: flag }
  return undefined
}
