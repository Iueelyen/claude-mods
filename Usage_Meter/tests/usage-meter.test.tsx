import { expect, mock, test } from 'claude-code/testing'
import type { On, SessionRateLimit } from 'claude-code'

import { bar, clockTime, lineOf, readingOf } from '../hooks/usage-meter'

const RESET = new Date(2026, 9, 24, 15, 15).toISOString()

const LIMITS: SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 42, resetsAt: RESET },
  { kind: 'seven_day', percentUsed: 18 },
]

// Nothing sits beneath the plugin: these hooks stand for the engine.
function engine(on: On, limits: SessionRateLimit[]) {
  const seen = { status: [] as Array<string | undefined>, toasts: [] as string[], state: {} as Record<string, unknown> }
  mock.store(on)
  on('state.set', (_, e, next) => {
    const w = e as { plugin: string; key: string; value: unknown }
    if (w.plugin === 'usage-meter') seen.state[w.key] = w.value
    return next(e)
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: limits } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.status', (_, e) => ((seen.status.push(e.text), { value: undefined })))
  on('ui.toast', (_, e) => ((seen.toasts.push(e.text), { value: undefined })))
  return seen
}

test('1. bars fill in eighths', () => {
  expect(bar(0)).toBe('▱▱▱▱▱▱▱▱')
  expect(bar(42)).toBe('▰▰▰▱▱▱▱▱')
  expect(bar(100)).toBe('▰▰▰▰▰▰▰▰')
  expect(bar(130)).toBe('▰▰▰▰▰▰▰▰')
})

test('2. reset time reads as a clock time', () => {
  expect(clockTime(RESET)).toBe('3:15pm')
  expect(clockTime(new Date(2026, 9, 24, 0, 5).toISOString())).toBe('12:05am')
  expect(clockTime('not a date')).toBeUndefined()
})

test('3. the line shows 5-hour with its reset, then weekly', () => {
  const r = readingOf(LIMITS)
  expect(lineOf(r, { colours: false, warn: true })).toBe('5h ▰▰▰▱▱▱▱▱ 42% ↻3:15pm  ·  week ▰▱▱▱▱▱▱▱ 18%')
  expect(lineOf(r, { colours: true, warn: true })).toBe('5h 🟢 ▰▰▰▱▱▱▱▱ 42% ↻3:15pm  ·  week 🟢 ▰▱▱▱▱▱▱▱ 18%')
  expect(lineOf(readingOf([]), { colours: true, warn: true })).toBe('Usage Meter · waiting for the first reply')
})

test('4. it draws on start, and /meter off clears it', async ($, on) => {
  const seen = engine(on, LIMITS)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(seen.status.at(-1)).toContain('5h 🟢 ▰▰▰▱▱▱▱▱ 42%')
  expect(seen.state.isEnabled).toBe(true)
  await $.command.run({ command: 'meter', args: 'off' })
  expect(seen.status.at(-1)).toBeUndefined()
  await $.command.run({ command: 'meter', args: 'on' })
  expect(seen.status.at(-1)).toContain('week')
})

test('5. options change through /meter set', async ($, on) => {
  const seen = engine(on, LIMITS)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ command: 'meter', args: 'set colours off' })).text).toBe('Usage Meter: colours is now off.')
  expect(seen.status.at(-1)).toBe('5h ▰▰▰▱▱▱▱▱ 42% ↻3:15pm  ·  week ▰▱▱▱▱▱▱▱ 18%')
  const options = seen.state.options as Array<{ key: string; value: string }>
  expect(options.find(o => o.key === 'colours')?.value).toBe('off')
  expect((await $.command.run({ command: 'meter', args: 'set size big' })).text).toMatch(/colours on\|off/)
})

test('6. passing 90% warns once, and not when warnings are off', async ($, on) => {
  const seen = engine(on, LIMITS)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const high: SessionRateLimit[] = [{ kind: 'five_hour', percentUsed: 91, resetsAt: RESET }, LIMITS[1]!]
  await $.session.measure({ context: { window: 200000 }, rateLimits: high, changed: ['rateLimits'] })
  await $.session.measure({ context: { window: 200000 }, rateLimits: high, changed: ['rateLimits'] })
  expect(seen.toasts).toEqual(['You\'ve used 91% of your 5-hour limit. It resets at 3:15pm.'])
  expect(seen.status.at(-1)).toContain('5h 🔴')

  await $.command.run({ command: 'meter', args: 'set warn off' })
  const weekHigh: SessionRateLimit[] = [high[0]!, { kind: 'seven_day', percentUsed: 95 }]
  await $.session.measure({ context: { window: 200000 }, rateLimits: weekHigh, changed: ['rateLimits'] })
  expect(seen.toasts).toHaveLength(1)
})
