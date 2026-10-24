import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

import type { CleanViewChecklist, CleanViewOption, CleanViewSettings, CleanViewTask } from '../types'

// ---------------------------------------------------------------------------
// Shared state (see types/index.d.ts): other mods may read these.

const VERSION = '0.1.1' // keep in step with .claude-plugin/plugin.json
const versionAtom = atom({ plugin: 'clean-view', key: 'version' } as const, VERSION)
const enabledAtom = atom({ plugin: 'clean-view', key: 'cleanViewEnabled' } as const, true)
const tickAtom = atom({ plugin: 'clean-view', key: 'tick' } as const, 0)
const EMPTY: CleanViewChecklist = {
  title: '',
  phase: 'idle',
  tasks: [],
  needsYouReason: null,
  stuckReason: null,
  startedAt: null,
  finishedAt: null,
  isCollapsed: false,
}
const checklistAtom = atom({ plugin: 'clean-view', key: 'checklist' } as const, EMPTY)
const DEFAULT_SETTINGS: CleanViewSettings = { planFirst: true, hideRows: true, nameJobs: true, collapseAfter: '5' }
const settingsAtom = atom({ plugin: 'clean-view', key: 'settings' } as const, DEFAULT_SETTINGS)
const optionsAtom = atom({ plugin: 'clean-view', key: 'options' } as const, [])

const STORE_KEY = 'cleanViewEnabled'
const STORE_SETTINGS = 'settings'
const PLAN_TOOL = 'mcp__clean-view__plan_steps'
const PROGRESS_TOOL = 'mcp__clean-view__report_progress'
const ALWAYS_ALLOWED = new Set([
  PLAN_TOOL,
  PROGRESS_TOOL,
  'ToolSearch',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'AskUserQuestion',
])
const PLACEHOLDER = 'ph-'
const METER = 10
const MAX_NAME = 40

const REASONS = {
  permission: 'Claude needs your OK to continue',
  question: 'Claude has a question for you',
  reply: 'Claude is waiting for your reply',
  saidNo: 'you said no to a step, so Claude paused',
  failing: 'a step keeps failing, Claude is trying another way',
  refusal: "Claude couldn't help with that request",
  rateLimit: 'you hit your usage limit, try again a little later',
  overloaded: "Claude's servers are busy, try again in a minute",
  tooLong: 'the conversation is too long, type /compact and try again',
  network: 'the internet connection dropped',
  auth: 'Claude needs you to sign in again, type /login',
  unknown: 'something went wrong on Claude’s side, try again',
} as const

type Dollar = EngineInterface

// ---------------------------------------------------------------------------
// Plain names: every name shown passes through here.

const CODE_EXT =
  'tsx?|jsx?|mjs|cjs|mts|cts|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|ps1|bat|json|ya?ml|toml|md|mdx|html?|css|scss|less|sql|xml|lock|env|ini|cfg|vue|svelte|dart|lua|r'
const FILE_NAME = new RegExp(`[\\w.-]+\\.(?:${CODE_EXT})\\b`, 'gi')

export function cleanName(raw: unknown): string {
  let text = String(raw ?? '')
  text = text.replace(/`[^`]*`/g, ' ').replace(/`/g, ' ')
  text = text.replace(/\S*[/\\]\S*/g, ' ')
  text = text.replace(FILE_NAME, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  if (text.length > MAX_NAME) {
    let cut = text.slice(0, MAX_NAME - 1)
    const space = cut.lastIndexOf(' ')
    if (space > 0) cut = cut.slice(0, space)
    text = cut.replace(/[\s,;:.\-–—]+$/, '') + '…'
  }
  if (text === '' || text === '…') return 'Working on it'

  return text.charAt(0).toUpperCase() + text.slice(1)
}

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

// ---------------------------------------------------------------------------
// Checklist helpers (pure).

function isRunning(c: CleanViewChecklist): boolean {
  return c.phase === 'working' || c.phase === 'needs-you' || c.phase === 'stuck'
}

function hasPlan(c: CleanViewChecklist): boolean {
  return c.tasks.some(t => !t.id.startsWith(PLACEHOLDER))
}

function realTasks(c: CleanViewChecklist): CleanViewTask[] {
  return c.tasks.filter(t => !t.id.startsWith(PLACEHOLDER))
}

function task(id: string, name: string, status: CleanViewTask['status']): CleanViewTask {
  return { id, name: cleanName(name), status, percent: status === 'done' ? 100 : 0, hasReported: false }
}

/** Makes sure exactly one step is active while any is unfinished. */
function settleActive(tasks: CleanViewTask[]): CleanViewTask[] {
  let seenActive = false
  const out = tasks.map(t => {
    if (t.status !== 'active') return t
    if (seenActive) return { ...t, status: 'upcoming' as const }
    seenActive = true
    return t
  })
  if (seenActive) return out
  const next = out.findIndex(t => t.status === 'upcoming')
  if (next === -1) return out

  return out.map((t, i) => (i === next ? { ...t, status: 'active' as const, percent: 0, hasReported: false } : t))
}

export function applyPlan(c: CleanViewChecklist, steps: readonly unknown[], startedAt: number): CleanViewChecklist {
  const tasks = steps.slice(0, 8).map((s, i) => task(`step-${i + 1}`, String(s), i === 0 ? 'active' : 'upcoming'))
  const base = isRunning(c) ? c : startJob(EMPTY, startedAt)

  return { ...base, phase: base.phase === 'stuck' ? 'working' : base.phase, tasks, isCollapsed: false }
}

export function applyProgress(c: CleanViewChecklist, rawName: unknown, rawPercent: unknown): CleanViewChecklist {
  const percent = Math.max(0, Math.min(100, Math.round(Number(rawPercent) || 0)))
  const name = cleanName(rawName)
  let tasks = [...c.tasks]
  let at = tasks.findIndex(t => sameName(t.name, name))
  if (at === -1) {
    // A step not in the plan: placed where the work is now.
    const active = tasks.findIndex(t => t.status === 'active')
    const firstOpen = tasks.findIndex(t => t.status !== 'done')
    at = active !== -1 ? active + 1 : firstOpen !== -1 ? firstOpen : tasks.length
    tasks.splice(at, 0, task(`step-x${tasks.length + 1}-${at}`, name, 'upcoming'))
  }
  tasks = tasks.map((t, i) => {
    if (i < at) return { ...t, status: 'done' as const, percent: 100 }
    if (i === at) {
      return percent >= 100
        ? { ...t, status: 'done' as const, percent: 100, hasReported: true }
        : { ...t, status: 'active' as const, percent, hasReported: true }
    }
    return t.status === 'active' ? { ...t, status: 'upcoming' as const } : t
  })

  return { ...c, tasks: settleActive(tasks) }
}

export function applyTodos(
  c: CleanViewChecklist,
  todos: ReadonlyArray<{ content: string; status: string }>,
): CleanViewChecklist {
  const tasks = todos.map((t, i) => {
    const status = t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'active' : 'upcoming'
    const old = c.tasks.find(o => o.id === `todo-${i}`)
    const keep = old && sameName(old.name, cleanName(t.content)) && status === 'active' ? old : undefined
    return keep ? { ...keep, status } : task(`todo-${i}`, t.content, status)
  })

  return { ...c, tasks: settleActive(tasks) }
}

function startJob(_c: CleanViewChecklist, now: number): CleanViewChecklist {
  return {
    ...EMPTY,
    title: 'Working on your request',
    phase: 'working',
    tasks: [task(`${PLACEHOLDER}1`, 'Understand your request', 'active'), task(`${PLACEHOLDER}2`, 'Plan the steps', 'upcoming')],
    startedAt: now,
  }
}

function classifyError(kind: string | undefined, details: string): string {
  const text = `${kind ?? ''} ${details}`
  if (/prompt is too long|context (window|length)|too many tokens|max_tokens|exceed/i.test(text)) return REASONS.tooLong
  if (/rate_limit|rate limit|usage limit|billing|429/i.test(text)) return REASONS.rateLimit
  if (/overloaded|server_error|529|503|500/i.test(text)) return REASONS.overloaded
  if (/auth|oauth|login|401|403|credential|verification|account_on_hold/i.test(text)) return REASONS.auth
  if (/network|connection|ECONN|ENOTFOUND|ETIMEDOUT|fetch failed|socket|offline|timed? ?out/i.test(text)) return REASONS.network

  return REASONS.unknown
}

const SAID_NO = /doesn'?t want to proceed|tool use was rejected|user (rejected|denied|declined)|permission (was )?denied/i

// ---------------------------------------------------------------------------
// Drawing helpers.

function fit(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length > width) return text.slice(0, Math.max(0, width - 1)) + '…'
  return text + ' '.repeat(width - text.length)
}

function meter(t: CleanViewTask, frame: number): string {
  if (t.status === 'done') return '█'.repeat(METER)
  if (t.status === 'upcoming') return '░'.repeat(METER)
  if (t.hasReported) {
    const filled = Math.round(t.percent / 10)
    return '█'.repeat(filled) + '░'.repeat(METER - filled)
  }
  // No percent yet: a sweep of three cells moving across.
  const cells = Array.from({ length: METER }, () => '░')
  for (let k = 0; k < 3; k++) cells[(frame + k) % METER] = '▓'
  return cells.join('')
}

function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

// ---------------------------------------------------------------------------

// Module state: a reload starts these over, which is fine (timers drop too).
let ticker: Timer | undefined
let failStreak = 0
let lastSubmitWasCommand = false
let lastApiError: { kind: string; details: string } | undefined

async function setChecklist($: Dollar, fn: (c: CleanViewChecklist) => CleanViewChecklist): Promise<CleanViewChecklist> {
  let after = EMPTY
  await update($, checklistAtom, c => (after = fn(c ?? EMPTY)))
  syncTicker($, after)
  return after
}

// The 250ms clock runs only while a job works or waits on the person.
function syncTicker($: Dollar, c: CleanViewChecklist): void {
  const wanted = c.phase === 'working' || c.phase === 'needs-you'
  if (wanted && ticker === undefined) {
    ticker = $.clock.every(250, () => void update($, tickAtom, n => (n ?? 0) + 1))
  } else if (!wanted && ticker !== undefined) {
    ticker.cancel()
    ticker = undefined
  }
}

async function setEnabled($: Dollar, value: boolean): Promise<void> {
  await update($, enabledAtom, () => value)
  await $.store.set(STORE_KEY, value)
  $.ui.toast(value ? 'Clean View is on: technical details are hidden.' : 'Clean View is off: everything is shown.')
}

// ---------------------------------------------------------------------------
// Options: kept in `settings`, published as `options` for a control panel.

const ON_OFF = (b: boolean) => (b ? 'on' : 'off')

export function optionsOf(s: CleanViewSettings): CleanViewOption[] {
  return [
    { key: 'hide', label: 'Hide technical rows', kind: 'toggle', value: ON_OFF(s.hideRows), group: 'General' },
    {
      key: 'plan',
      label: 'Plan first',
      kind: 'toggle',
      value: ON_OFF(s.planFirst),
      group: 'Behavior',
      hint: 'Holds Claude’s tools until it has made a plan.',
    },
    { key: 'name', label: 'Name jobs with Haiku', kind: 'toggle', value: ON_OFF(s.nameJobs), group: 'Behavior' },
    {
      key: 'collapse',
      label: 'Shrink after done',
      kind: 'choice',
      group: 'Behavior',
      value: s.collapseAfter,
      choices: [
        { value: '5', label: '5 seconds' },
        { value: '15', label: '15 seconds' },
        { value: 'never', label: 'Never' },
      ],
    },
  ]
}

/** Applies `/simple set <key> <value>`; undefined when the key or value isn't one it knows. */
export function applySetting(s: CleanViewSettings, key: string, value: string): CleanViewSettings | undefined {
  const flag = value === 'on' ? true : value === 'off' ? false : undefined
  if (key === 'plan' && flag !== undefined) return { ...s, planFirst: flag }
  if (key === 'hide' && flag !== undefined) return { ...s, hideRows: flag }
  if (key === 'name' && flag !== undefined) return { ...s, nameJobs: flag }
  if (key === 'collapse' && (value === '5' || value === '15' || value === 'never')) return { ...s, collapseAfter: value }
  return undefined
}

function asSettings(saved: unknown): CleanViewSettings {
  const s = (saved ?? {}) as Partial<CleanViewSettings>
  return {
    planFirst: typeof s.planFirst === 'boolean' ? s.planFirst : DEFAULT_SETTINGS.planFirst,
    hideRows: typeof s.hideRows === 'boolean' ? s.hideRows : DEFAULT_SETTINGS.hideRows,
    nameJobs: typeof s.nameJobs === 'boolean' ? s.nameJobs : DEFAULT_SETTINGS.nameJobs,
    collapseAfter: s.collapseAfter === '15' || s.collapseAfter === 'never' ? s.collapseAfter : '5',
  }
}

async function saveSettings($: Dollar, settings: CleanViewSettings): Promise<void> {
  await update($, settingsAtom, () => settings)
  await update($, optionsAtom, () => optionsOf(settings))
  await $.store.set(STORE_SETTINGS, settings)
}

async function askHaiku($: Dollar, prompt: string, withEffort: boolean) {
  return $.model.complete({
    model: 'haiku',
    ...(withEffort ? { effort: 'low' as const } : {}),
    maxTokens: 30,
    timeoutMs: 20000,
    system:
      'You name tasks for a non-technical person. Reply with only a 2 to 6 word name that starts with a verb, in plain English, with no file names, code or punctuation at the end.',
    prompt: `Name this request:\n\n${prompt.slice(0, 2000)}`,
  })
}

async function nameJob($: Dollar, prompt: string, startedAt: number): Promise<void> {
  let reply = await askHaiku($, prompt, true)
  if (!reply.isAnswered && reply.reason === 'api-error') reply = await askHaiku($, prompt, false)
  if (!reply.isAnswered) return
  const words = reply.text.replace(/["'“”‘’.!?]/g, ' ').trim().split(/\s+/).slice(0, 6).join(' ')
  if (words === '') return
  await setChecklist($, c => (c.startedAt === startedAt ? { ...c, title: cleanName(words) } : c))
}

export function registerCleanView(on: On): void {
  // -- Session start: tools, command, saved setting --------------------------

  on('session.start', async ($, e, next) => {
    await update($, versionAtom, () => VERSION)
    const saved = await $.store.get(STORE_KEY)
    await update($, enabledAtom, () => (typeof saved === 'boolean' ? saved : true))
    const settings = asSettings(await $.store.get(STORE_SETTINGS))
    await update($, settingsAtom, () => settings)
    await update($, optionsAtom, () => optionsOf(settings))
    await $.tool.register({
      name: 'plan_steps',
      description:
        'Lay out every step of the job before starting work: 2 to 8 short plain-English step names in order, each starting with a verb (e.g. "Build the pricing section"). No file names, paths, commands or code. The first step starts right away.',
      inputSchema: {
        type: 'object',
        properties: { steps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 } },
        required: ['steps'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'report_progress',
      description:
        'Report progress on the current step, using its plan name and a percent from 0 to 100. Report 100 the moment a step finishes; the next step then starts by itself.',
      inputSchema: {
        type: 'object',
        properties: { task: { type: 'string' }, percent: { type: 'number', minimum: 0, maximum: 100 } },
        required: ['task', 'percent'],
      },
      isDeferred: false,
    })
    await $.command.register({
      name: 'simple',
      description: 'Turn Clean View on or off (no argument flips it)',
      argumentHint: 'on | off | set <option> <value> | version',
    })
    syncTicker($, await read($, checklistAtom))

    return next(e)
  })

  // -- Ask Claude to plan in plain English ------------------------------------

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!(await read($, enabledAtom))) return result
    const text = [
      '# Clean View: plain-English progress',
      'The person using this session is not technical. They see a simple checklist instead of tool calls, so keep it accurate:',
      `- For every request, even a quick question, call \`${PLAN_TOOL}\` first with 2 to 8 steps in order. If it is deferred, load it with ToolSearch first.`,
      '- Write every step name in plain English a non-technical person understands, under 40 characters, starting with a verb, like "Build the pricing section".',
      '- Never put file paths, file names, commands, code or tool names in a step name.',
      `- Call \`${PROGRESS_TOOL}\` with the step name and a percent as real progress happens, and with 100 the moment a step finishes.`,
      '- If the session has TodoWrite or TaskCreate, you may use your to-do list as the plan instead, with the same plain names.',
    ].join('\n')

    return { ...result, sections: [...result.sections, { id: 'clean-view:plain-progress', text, scope: 'session' as const }] }
  })

  // -- Jobs: start, reply, finish ---------------------------------------------

  on('prompt.submit', async ($, e, next) => {
    lastSubmitWasCommand = e.command !== undefined
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const text = e.text.trim()
    const isCommand = lastSubmitWasCommand || text.startsWith('/')
    lastSubmitWasCommand = false
    if (text === '' || isCommand) return result
    const current = await read($, checklistAtom)
    failStreak = 0
    lastApiError = undefined
    if (isRunning(current)) {
      // The person replied: whatever waited on them is answered.
      await setChecklist($, c => ({ ...c, phase: 'working', needsYouReason: null, stuckReason: null }))
      return result
    }
    const now = await $.clock.now()
    await setChecklist($, c => startJob(c, now))
    if ((await read($, settingsAtom)).nameJobs) {
      $.clock.after(0, () => void nameJob($, text, now).catch(() => undefined))
    }

    return result
  })

  on('classic.StopFailure', async ($, e, next) => {
    lastApiError = { kind: e.error, details: `${e.error_details ?? ''} ${e.last_assistant_message ?? ''}` }
    const reason = classifyError(e.error, lastApiError.details)
    await setChecklist($, c => (c.phase === 'stuck' && c.stuckReason === REASONS.unknown ? { ...c, stuckReason: reason } : c))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const current = await read($, checklistAtom)
    if (!isRunning(current)) return result
    const now = await $.clock.now()
    failStreak = 0

    if (e.reason === 'error') {
      const reason = classifyError(lastApiError?.kind, `${lastApiError?.details ?? ''} ${e.answer}`)
      lastApiError = undefined
      await setChecklist($, c => ({ ...c, phase: 'stuck', stuckReason: reason, needsYouReason: null }))
    } else if (e.reason === 'refusal') {
      await setChecklist($, c => ({ ...c, phase: 'stuck', stuckReason: REASONS.refusal, needsYouReason: null }))
    } else if (e.reason === 'aborted') {
      await setChecklist($, c => ({ ...c, phase: 'stopped', needsYouReason: null, stuckReason: null, finishedAt: now }))
    } else if (current.phase === 'stuck') {
      // Claude stopped while stuck (say, after a "no"): the reason stays up.
    } else if (hasPlan(current) && realTasks(current).some(t => t.status !== 'done')) {
      await setChecklist($, c => ({ ...c, phase: 'needs-you', needsYouReason: REASONS.reply }))
    } else {
      const startedAt = current.startedAt
      await setChecklist($, c => ({
        ...c,
        phase: 'done',
        needsYouReason: null,
        stuckReason: null,
        finishedAt: now,
        tasks: (hasPlan(c) ? realTasks(c) : c.tasks).map(t => ({ ...t, status: 'done' as const, percent: 100 })),
      }))
      const collapseAfter = (await read($, settingsAtom)).collapseAfter
      if (collapseAfter !== 'never') {
        $.clock.after(Number(collapseAfter) * 1000, () =>
          void setChecklist($, c => (c.phase === 'done' && c.startedAt === startedAt ? { ...c, isCollapsed: true } : c)),
        )
      }
    }

    return result
  })

  // -- Needs you --------------------------------------------------------------

  on('classic.Notification', async ($, e, next) => {
    const kind = String(e.notification_type)
    const reason = /permission/i.test(kind) ? REASONS.permission : /elicitation/i.test(kind) ? REASONS.question : null
    if (reason !== null) {
      await setChecklist($, c => (isRunning(c) ? { ...c, phase: 'needs-you', needsYouReason: reason } : c))
    }
    return next(e)
  })

  // -- Tool calls: the gate, the plan tools, the checklist from what Claude does

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const enabled = await read($, enabledAtom)
    const before = await read($, checklistAtom)

    if (tool === PLAN_TOOL) {
      const steps = Array.isArray(input.steps) ? input.steps : []
      if (steps.length === 0) return { result: 'Give at least one step name in "steps".' }
      const now = await $.clock.now()
      const after = await setChecklist($, c => applyPlan(c, steps, now))
      return { result: `Planned ${after.tasks.length} steps. The first one has started.` }
    }
    if (tool === PROGRESS_TOOL) {
      const percent = Math.max(0, Math.min(100, Math.round(Number(input.percent) || 0)))
      await setChecklist($, c => applyProgress(c, input.task, percent))
      return { result: `Progress noted: ${percent}%.` }
    }

    const planFirst = (await read($, settingsAtom)).planFirst
    if (enabled && planFirst && isRunning(before) && !hasPlan(before) && !ALWAYS_ALLOWED.has(tool)) {
      return {
        deny: `Clean View: call ${PLAN_TOOL} first to lay out this job's steps in plain English (load it with ToolSearch if it is deferred), then try again.`,
      }
    }

    if (before.phase === 'needs-you') {
      await setChecklist($, c => (c.phase === 'needs-you' ? { ...c, phase: 'working', needsYouReason: null } : c))
    }
    if (tool === 'AskUserQuestion') {
      await setChecklist($, c => (isRunning(c) ? { ...c, phase: 'needs-you', needsYouReason: REASONS.question } : c))
    }

    const ran = await next(e)

    await setChecklist($, c => (c.phase === 'needs-you' ? { ...c, phase: 'working', needsYouReason: null } : c))
    if (ran.deny !== undefined) return ran

    if (ran.isError === true) {
      if (SAID_NO.test(ran.text ?? '')) {
        failStreak = 0
        await setChecklist($, c => (isRunning(c) ? { ...c, phase: 'stuck', stuckReason: REASONS.saidNo } : c))
      } else {
        failStreak += 1
        if (failStreak >= 3) {
          await setChecklist($, c => (isRunning(c) ? { ...c, phase: 'stuck', stuckReason: REASONS.failing } : c))
        }
      }
      return ran
    }

    failStreak = 0
    await setChecklist($, c => (c.phase === 'stuck' ? { ...c, phase: 'working', stuckReason: null } : c))

    if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
      const todos = input.todos as Array<{ content: string; status: string }>
      await setChecklist($, c => applyTodos(c, todos))
    } else if (tool === 'TaskCreate') {
      const found = /#?(\d+)/.exec(ran.text ?? '')
      await setChecklist($, c => {
        const kept = realTasks(c)
        const id = `task-${found?.[1] ?? String(kept.length + 1)}`
        return { ...c, tasks: settleActive([...kept, task(id, String(input.subject ?? ''), 'upcoming')]) }
      })
    } else if (tool === 'TaskUpdate') {
      const id = `task-${String(input.taskId ?? '')}`
      const status = input.status
      await setChecklist($, c => {
        let tasks = c.tasks
        if (status === 'deleted') tasks = tasks.filter(t => t.id !== id)
        tasks = tasks.map(t => {
          if (t.id === id) {
            const renamed = typeof input.subject === 'string' ? { ...t, name: cleanName(input.subject) } : t
            if (status === 'completed') return { ...renamed, status: 'done' as const, percent: 100 }
            if (status === 'in_progress') return { ...renamed, status: 'active' as const }
            if (status === 'pending') return { ...renamed, status: 'upcoming' as const, percent: 0 }
            return renamed
          }
          return status === 'in_progress' && t.status === 'active' ? { ...t, status: 'upcoming' as const } : t
        })
        return { ...c, tasks: settleActive(tasks) }
      })
    }

    return ran
  }).catch(($, e, next) => next(e))

  // -- Hide the technical rows ------------------------------------------------

  for (const component of ['ToolUse', 'ToolResult', 'ToolGroup'] as const) {
    on('ui.render', { component }, async ($, e, next) => {
      const expanded = (e.props as { isExpanded?: boolean }).isExpanded === true
      if (expanded || !(await read($, enabledAtom)) || !(await read($, settingsAtom)).hideRows) return next(e)
      const { Box } = $.ui.resolve(e)
      return <Box display="none" />
    })
  }

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (!(await read($, enabledAtom)) || !(await read($, settingsAtom)).hideRows) return next(e)
    return next({ ...e, props: { ...e.props, hint: '' } })
  })

  // -- The band above the prompt ----------------------------------------------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const enabled = await read($, enabledAtom)
    const c = await read($, checklistAtom)
    const frame = await read($, tickAtom)
    const now = await $.clock.now()
    const columns = Math.max(20, e.props.bodyColumns)

    let below: Awaited<ReturnType<typeof next>> | undefined
    if (!enabled) {
      try {
        below = await next(e)
      } catch {
        below = undefined
      }
    }

    const button = (
      <Button
        key="clean-view-toggle"
        label={enabled ? '● Clean View: ON' : '○ Clean View: OFF'}
        onPress={() => setEnabled($, !enabled)}
      />
    )

    const showJob = enabled && c.phase !== 'idle'
    let header = <Text> </Text>
    if (showJob) {
      const elapsed = duration((c.finishedAt ?? now) - (c.startedAt ?? now))
      if (c.phase === 'working') {
        header = (
          <Text wrap="truncate-end">
            <Text bold>{c.title}</Text>
            <Text dimColor> · {elapsed}</Text>
          </Text>
        )
      } else if (c.phase === 'needs-you') {
        header = (
          <Text wrap="truncate-end">
            <Text inverse bold color="yellow"> Needs you </Text>
            <Text> {c.needsYouReason ?? REASONS.reply}</Text>
          </Text>
        )
      } else if (c.phase === 'stuck') {
        header = (
          <Text wrap="truncate-end" color="yellow">
            ⚠ Stuck: {c.stuckReason ?? REASONS.unknown}
          </Text>
        )
      } else if (c.phase === 'stopped') {
        header = (
          <Text wrap="truncate-end">
            ■ Stopped · {c.title} <Text dimColor>· you pressed Esc</Text>
          </Text>
        )
      } else {
        header = (
          <Text wrap="truncate-end">
            <Text color="green">✓ All done</Text> · {c.title} <Text dimColor>· took {elapsed}</Text>
          </Text>
        )
      }
    }

    const headerRow = (
      <Box flexDirection="row" justifyContent="space-between" width={columns}>
        <Box flexGrow={1} flexShrink={1}>
          {header}
        </Box>
        <Box flexShrink={0} marginLeft={1}>
          {button}
        </Box>
      </Box>
    )

    const showRows = showJob && !(c.phase === 'done' && c.isCollapsed)
    if (!showRows) {
      if (below === undefined) return headerRow
      return (
        <Box flexDirection="column">
          {headerRow}
          {below}
        </Box>
      )
    }

    // icon(1) + space + name + space + meter(10) + space + label(7)
    const nameWidth = Math.max(4, columns - 2 - 1 - METER - 1 - 7)
    const room = Math.max(1, e.props.maxRows - 1)
    const activeAt = Math.max(0, c.tasks.findIndex(t => t.status === 'active'))
    const start = Math.max(0, Math.min(activeAt - 1, c.tasks.length - room))
    const shown = c.tasks.slice(start, start + room)
    const firstUpcoming = c.tasks.findIndex(t => t.status === 'upcoming')
    const isPaused = c.phase === 'needs-you'

    const rows = shown.map(t => {
      const index = c.tasks.indexOf(t)
      const name = fit(t.name, nameWidth)
      const bar = meter(t, frame)
      if (t.status === 'done') {
        return (
          <Text wrap="truncate-end">
            <Text color="green">✓</Text> <Text dimColor>{name}</Text> <Text color="green">{bar}</Text>{' '}
            <Text dimColor>Done</Text>
          </Text>
        )
      }
      if (t.status === 'active') {
        const label = t.hasReported ? `${t.percent}%` : 'Working'
        return (
          <Text wrap="truncate-end">
            <Text color="cyan">{isPaused ? '‖' : '▶'}</Text> <Text bold>{name}</Text>{' '}
            <Text color="cyan">{bar}</Text> {label}
          </Text>
        )
      }
      return (
        <Text wrap="truncate-end" dimColor>
          ○ {name} {bar} {index === firstUpcoming ? 'Next' : 'Up next'}
        </Text>
      )
    })

    return (
      <Box flexDirection="column" width={columns}>
        {headerRow}
        {rows}
      </Box>
    )
  })

  // -- /simple on|off -----------------------------------------------------------

  on('command.run', { command: 'simple' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'version') return { text: `Clean View version ${VERSION}` }
    const set = /^set\s+(\S+)\s+(\S+)$/.exec(arg)
    if (set !== null) {
      const next = applySetting(await read($, settingsAtom), set[1]!, set[2]!)
      if (next === undefined) {
        return { text: 'Clean View options: plan on|off, hide on|off, name on|off, collapse 5|15|never.' }
      }
      await saveSettings($, next)
      return { text: `Clean View: ${set[1]} is now ${set[2]}.` }
    }
    const current = await read($, enabledAtom)
    const wanted = arg === 'on' ? true : arg === 'off' ? false : arg === '' ? !current : undefined
    if (wanted === undefined) return { text: 'Use /simple on, /simple off, /simple to flip it, or /simple set <option> <value>.' }
    await setEnabled($, wanted)
    return { text: wanted ? 'Clean View is on.' : 'Clean View is off. Every hidden row is back.' }
  })
}
