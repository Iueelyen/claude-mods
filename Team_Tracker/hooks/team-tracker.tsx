import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

import type { TeamHelper, TeamHelperStatus, TeamStep, TeamTrackerSettings } from '../types'
import {
  DEFAULT_SETTINGS,
  applySetting,
  applyStepTool,
  asSettings,
  badgeFor,
  costOf,
  duration,
  fit,
  modelName,
  money,
  optionsOf,
  taskIdOf,
  tokenCount,
} from './logic'
import type { Usage } from './logic'

type Dollar = EngineInterface

const VERSION = '0.1.0' // keep in step with .claude-plugin/plugin.json
const PANE = 'team'
const STORE_ENABLED = 'isEnabled'
const STORE_SETTINGS = 'settings'
const MAX_HELPERS = 30
const STEP_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'mcp__ccd_turn__update_plan'])

const COLOR = {
  gold: '#F2C46D',
  hair: '#262B33',
  muted: '#7D8590',
  text: '#E6EDF3',
  green: '#3DD68C',
  amber: '#E3B341',
  ink: '#0D1117',
} as const

// Shared state (see types/index.d.ts): the Mods menu reads version, isEnabled and options.
const versionAtom = atom({ plugin: 'team-tracker', key: 'version' } as const, VERSION)
const enabledAtom = atom({ plugin: 'team-tracker', key: 'isEnabled' } as const, true)
const settingsAtom = atom({ plugin: 'team-tracker', key: 'settings' } as const, DEFAULT_SETTINGS)
const optionsAtom = atom({ plugin: 'team-tracker', key: 'options' } as const, [])
const helpersAtom = atom({ plugin: 'team-tracker', key: 'helpers' } as const, [])
const stepsAtom = atom({ plugin: 'team-tracker', key: 'steps' } as const, [])
const tickAtom = atom({ plugin: 'team-tracker', key: 'tick' } as const, 0)
const newJobAtom = atom({ plugin: 'team-tracker', key: 'isNewJob' } as const, true)

// Lost on a reload, which is fine: the next change starts the ticker again, and
// the next draw says again whether panes dock here.
let ticker: Timer | undefined
let docks: boolean | undefined

/** The result an Agent call answers: in the foreground once it has finished, in the background at once. */
type AgentResult = { agentId?: string; resolvedModel?: string; totalTokens?: number; totalDurationMs?: number; usage?: Usage }

// ---------------------------------------------------------------------------

async function now($: Dollar): Promise<number> {
  return $.clock.now()
}

/** The status line, and a one-second clock while any helper runs. */
async function refresh($: Dollar): Promise<void> {
  const list = await read($, helpersAtom)
  const running = list.filter(helper => helper.status === 'running').length
  const showLine = (await read($, enabledAtom)) && (await read($, settingsAtom)).statusLine
  $.ui.status(showLine && running > 0 ? `Team: ${running} running, ${list.length - running} done` : undefined)
  if (running > 0 && ticker === undefined) {
    ticker = $.clock.every(1000, () => {
      void now($).then(t => update($, tickAtom, () => t))
    })
  } else if (running === 0 && ticker !== undefined) {
    ticker.cancel()
    ticker = undefined
  }
  const t = await now($)
  await update($, tickAtom, () => t)
}

async function openPane($: Dollar) {
  return $.ui.open({ id: PANE, title: 'Team', columns: 56 })
}

async function startHelper($: Dollar, helper: Pick<TeamHelper, 'id' | 'agentId' | 'task' | 'model' | 'startedAt'>): Promise<void> {
  const isFresh = await read($, newJobAtom)
  if (isFresh) {
    await update($, newJobAtom, () => false)
    if (docks === true && (await read($, enabledAtom)) && (await read($, settingsAtom)).autoOpen) void openPane($)
  }
  await update($, helpersAtom, list => {
    const kept = isFresh ? [] : (list ?? [])
    if (kept.some(one => one.id === helper.id)) return kept
    const added: TeamHelper = { ...helper, badge: badgeFor(kept.length), status: 'running', tokens: 0, usd: 0 }
    return [...kept, added].slice(-MAX_HELPERS)
  })
  await refresh($)
}

async function setHelper($: Dollar, id: string, fn: (helper: TeamHelper) => TeamHelper): Promise<void> {
  await update($, helpersAtom, list => (list ?? []).map(helper => (helper.id === id ? fn(helper) : helper)))
}

/**
 * A helper's own turns name it by its agent id; its Agent call, until it answers,
 * only by the call's id. Link them by the description the agent list gives, or by
 * being the only helper still unlinked.
 */
async function helperFor($: Dollar, agentId: string): Promise<string> {
  const list = await read($, helpersAtom)
  const known = list.find(helper => helper.agentId === agentId)
  if (known) return known.id
  const info = (await $.agent.list().catch(() => [])).find(a => a.id === agentId)
  const unlinked = list.filter(helper => helper.agentId === undefined && helper.status === 'running')
  const match = unlinked.find(helper => info !== undefined && helper.task === info.description) ?? (unlinked.length === 1 ? unlinked[0] : undefined)
  if (match) {
    await setHelper($, match.id, helper => ({ ...helper, agentId }))
    return match.id
  }
  await startHelper($, { id: agentId, agentId, task: info?.description || 'Helper', startedAt: await now($) })
  return agentId
}

async function setEnabled($: Dollar, value: boolean): Promise<void> {
  await update($, enabledAtom, () => value)
  await $.store.set(STORE_ENABLED, value)
  await refresh($)
}

async function saveSettings($: Dollar, settings: TeamTrackerSettings): Promise<void> {
  await update($, settingsAtom, () => settings)
  await update($, optionsAtom, () => optionsOf(settings))
  await $.store.set(STORE_SETTINGS, settings)
  await refresh($)
}

// ---------------------------------------------------------------------------

export function registerTeamTracker(on: On): void {
  on('session.start', async ($, e, next) => {
    await update($, versionAtom, () => VERSION)
    const enabled = await $.store.get(STORE_ENABLED)
    await update($, enabledAtom, () => enabled !== false)
    const settings = asSettings(await $.store.get(STORE_SETTINGS))
    await update($, settingsAtom, () => settings)
    await update($, optionsAtom, () => optionsOf(settings))
    await $.command.register({
      name: 'team',
      description: 'Open the Team pane: the job, its helpers, their time and rough cost',
      argumentHint: 'on | off | set <option> <value> | version',
    })
    await refresh($)
    return next(e)
  })

  on('command.run', { command: 'team' }, async ($, e) => {
    docks = e.presentation?.isFullscreen ?? docks
    const arg = e.args.trim().toLowerCase()
    if (arg === 'version') return { text: `Team Tracker version ${VERSION}` }
    const set = /^set\s+(\S+)\s+(\S+)$/.exec(arg)
    if (set !== null) {
      const changed = applySetting(await read($, settingsAtom), set[1]!, set[2]!)
      if (changed === undefined) return { text: 'Team Tracker options: open on|off, cost on|off, status on|off.' }
      await saveSettings($, changed)
      return { text: `Team Tracker: ${set[1]} is now ${set[2]}.` }
    }
    if (arg === 'on' || arg === 'off') {
      await setEnabled($, arg === 'on')
      return { text: arg === 'on' ? 'Team Tracker is on.' : 'Team Tracker is off.' }
    }
    if (arg !== '') return { text: 'Use /team to open the pane, /team on, /team off, or /team set <option> <value>.' }
    // Answer at once; the pane opens just after.
    $.clock.after(0, () => {
      void openPane($).catch(() => undefined)
    })
    return { text: 'Opening the Team pane.' }
  }).catch(() => ({ text: 'Team Tracker hit a problem and changed nothing.' }))

  // A new job starts with the person's next turn once no helper is running.
  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const list = await read($, helpersAtom)
      if (!list.some(helper => helper.status === 'running')) await update($, newJobAtom, () => true)
    } else {
      await helperFor($, e.agentId)
    }
    return result
  })

  // Each of a helper's turns adds what it spent.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) return result
    const id = await helperFor($, e.agentId)
    const t = await now($)
    const spent = e.usage ? costOf(e.usage, e.usage.model) : { tokens: 0, usd: 0 }
    const status: TeamHelperStatus = e.isAborted ? 'stopped' : e.reason === 'error' ? 'failed' : 'done'
    await setHelper($, id, helper => ({
      ...helper,
      status,
      endedAt: t,
      model: e.usage?.model ?? helper.model,
      tokens: helper.tokens + spent.tokens,
      usd: helper.usd + spent.usd,
    }))
    await refresh($)
    return result
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>

    if (tool !== 'Agent') {
      const ran = await next(e)
      if (STEP_TOOLS.has(tool) && ran.deny === undefined && ran.isError !== true) {
        const newId = taskIdOf(ran.text, String(await now($)))
        await update($, stepsAtom, steps => applyStepTool(steps ?? [], tool, input, newId))
      }
      return ran
    }

    await startHelper($, {
      id: e.tool_use_id,
      task: String(input.description ?? 'Helper'),
      model: typeof input.model === 'string' ? input.model : undefined,
      startedAt: await now($),
    })
    const ran = await next(e)
    const t = await now($)
    if (ran.deny !== undefined || ran.isError === true) {
      await setHelper($, e.tool_use_id, helper => ({ ...helper, status: 'failed', endedAt: t }))
    } else {
      const record = (ran.result ?? {}) as AgentResult
      const isFinished = typeof record.totalTokens === 'number'
      await setHelper($, e.tool_use_id, helper => {
        const linked = { ...helper, agentId: record.agentId ?? helper.agentId, model: record.resolvedModel ?? helper.model }
        if (!isFinished) return linked
        // Its own turns usually counted it already; the call's total is the fallback.
        const counted = helper.tokens === 0 && record.usage ? costOf(record.usage, linked.model) : undefined
        return {
          ...linked,
          status: 'done',
          endedAt: record.totalDurationMs ? helper.startedAt + record.totalDurationMs : t,
          tokens: counted ? counted.tokens : helper.tokens,
          usd: counted ? counted.usd : helper.usd,
        }
      })
    }
    await refresh($)
    return ran
  }).catch(($, e, next) => next(e))

  // Only notes whether this surface docks panes beside the chat, so the pane
  // opens by itself only where it is a side panel.
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (e.viewport?.isFullscreen !== undefined) docks = e.viewport.isFullscreen
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.viewport?.isFullscreen !== undefined) docks = e.viewport.isFullscreen
    const { Box, Text } = $.ui.resolve(e)
    const cols = Math.max(24, e.props.bodyColumns)
    const isOn = await read($, enabledAtom)
    const settings = await read($, settingsAtom)
    const helpers = await read($, helpersAtom)
    const tick = await read($, tickAtom)

    // Clean View's checklist, when it is running one, so the two agree; else Claude's to-do list.
    const cv = (await $.state.get({ plugin: 'clean-view', key: 'checklist' })).value as
      | { phase?: string; tasks?: Array<{ name: string; status: string }> }
      | undefined
    const fromCleanView: TeamStep[] | undefined =
      cv && cv.phase !== 'idle' && Array.isArray(cv.tasks) && cv.tasks.some(t => !String((t as { id?: string }).id ?? '').startsWith('ph-'))
        ? cv.tasks.map((t, i) => ({
            id: `cv-${i}`,
            content: t.name,
            status: t.status === 'done' ? 'completed' : t.status === 'active' ? 'in_progress' : 'pending',
          }))
        : undefined
    const steps = fromCleanView ?? (await read($, stepsAtom))

    const heading = (label: string) => (
      <Text wrap="truncate-end">
        <Text color={COLOR.muted}>{label} </Text>
        <Text color={COLOR.hair}>{'─'.repeat(Math.max(0, cols - label.length - 1))}</Text>
      </Text>
    )
    const rows = [
      <Text bold color={COLOR.text}>
        TEAM
      </Text>,
      <Text wrap="truncate-end">
        <Text color={COLOR.gold}>━━━━</Text>
        <Text color={COLOR.hair}>{'─'.repeat(Math.max(0, cols - 4))}</Text>
      </Text>,
    ]

    if (!isOn) {
      rows.push(<Text color={COLOR.muted}>{fit('Team Tracker is off. Turn it on in /mods or with /team on.', cols)}</Text>)
      return (
        <Box flexDirection="column" width={cols}>
          {rows}
        </Box>
      )
    }

    // -- Steps ---------------------------------------------------------------------
    if (steps.length > 0) {
      const done = steps.filter(s => s.status === 'completed').length
      const label = ` ${done} of ${steps.length} done`
      const barWidth = Math.max(4, Math.min(30, cols - label.length))
      const filled = Math.round((done / steps.length) * barWidth)
      const current = steps.find(s => s.status === 'in_progress')
      rows.push(
        heading('STEPS'),
        <Text wrap="truncate-end">
          <Text color={COLOR.green}>{'█'.repeat(filled)}</Text>
          <Text color={COLOR.hair}>{'░'.repeat(barWidth - filled)}</Text>
          <Text color={COLOR.text}>{label}</Text>
        </Text>,
      )
      if (current) rows.push(<Text color={COLOR.muted}>{fit(`Now: ${current.content}`, cols)}</Text>)
      rows.push(<Text> </Text>)
    }

    // -- Helpers -------------------------------------------------------------------
    rows.push(heading('HELPERS'))
    if (helpers.length === 0) {
      rows.push(<Text color={COLOR.muted}>{fit('No helpers yet. When Claude sends some off, they show up here.', cols)}</Text>)
    }
    const endOf = (helper: TeamHelper) => (helper.status === 'running' ? Math.max(tick, helper.startedAt) : (helper.endedAt ?? tick))
    const statusColor: Record<TeamHelperStatus, string> = {
      running: COLOR.gold,
      done: COLOR.green,
      stopped: COLOR.muted,
      failed: COLOR.amber,
    }
    for (const helper of helpers) {
      const model = modelName(helper.model)
      const details = [
        duration(endOf(helper) - helper.startedAt),
        model,
        helper.tokens > 0 ? `${tokenCount(helper.tokens)} tokens` : undefined,
        settings.showCost && helper.tokens > 0 ? `≈ ${money(helper.usd)}` : undefined,
      ]
        .filter((d): d is string => d !== undefined)
        .join(' · ')
      rows.push(
        <Text wrap="truncate-end">
          <Text backgroundColor={COLOR.gold} color={COLOR.ink} bold>
            {` ${helper.badge} `}
          </Text>
          <Text color={COLOR.text}>{` ${fit(helper.task, cols - helper.badge.length - 3)}`}</Text>
        </Text>,
        <Text wrap="truncate-end">
          <Text>{' '.repeat(helper.badge.length + 3)}</Text>
          <Text color={statusColor[helper.status]}>{helper.status}</Text>
          <Text color={COLOR.muted}>{fit(` · ${details}`, Math.max(0, cols - helper.badge.length - 3 - helper.status.length))}</Text>
        </Text>,
      )
    }

    // -- The whole job ---------------------------------------------------------------
    if (helpers.length > 0) {
      const running = helpers.filter(helper => helper.status === 'running').length
      const first = Math.min(...helpers.map(helper => helper.startedAt))
      const last = Math.max(...helpers.map(endOf))
      const total = helpers.reduce((sum, helper) => sum + helper.usd, 0)
      const summary = [
        `${helpers.length} ${helpers.length === 1 ? 'helper' : 'helpers'}`,
        settings.showCost ? `≈ ${money(total)} at API prices` : undefined,
        duration(last - first) + (running > 0 ? ` (${running} still running)` : ''),
      ]
        .filter((s): s is string => s !== undefined)
        .join(' · ')
      rows.push(<Text> </Text>, heading('WHOLE JOB'), <Text bold color={COLOR.text}>{fit(summary, cols)}</Text>)
      if (settings.showCost) {
        rows.push(<Text color={COLOR.muted}>{fit('Your Claude plan covers this; the cost is what the API would charge.', cols)}</Text>)
      }
    }

    return (
      <Box flexDirection="column" width={cols}>
        {rows}
      </Box>
    )
  })
}
