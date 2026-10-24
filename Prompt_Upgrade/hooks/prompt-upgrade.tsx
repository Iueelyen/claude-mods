import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderSurface } from 'claude-code'

import type { UpgradeAnswer, UpgradeFlow, UpgradeRecord, UpgradeSettings } from '../types'
import {
  DEFAULT_SETTINGS,
  REWRITE_SYSTEM,
  applySetting,
  asSettings,
  bigNumber,
  countWords,
  decideIntercept,
  fit,
  optionsOf,
  parseQuestions,
  parseRewrite,
  questionsPrompt,
  questionsSystem,
  rewritePrompt,
  wrapLines,
} from './logic'

type Dollar = EngineInterface

const PANE = 'prompt-upgrade'
const VERSION = '0.1.1' // keep in step with .claude-plugin/plugin.json
const STORE_ENABLED = 'isEnabled'
const STORE_AUTO = 'autoMode'
const STORE_HISTORY = 'history'
const STORE_SETTINGS = 'settings'
const HISTORY_SIZE = 20
const QUESTION_MODEL = 'haiku'

const COLOR = {
  gold: '#F2C46D',
  hair: '#262B33',
  muted: '#7D8590',
  text: '#E6EDF3',
  green: '#3DD68C',
  amber: '#E3B341',
  ink: '#0D1117',
} as const

const versionAtom = atom({ plugin: 'prompt-upgrade', key: 'version' } as const, VERSION)
const flowAtom = atom({ plugin: 'prompt-upgrade', key: 'flow' } as const, null)
const enabledAtom = atom({ plugin: 'prompt-upgrade', key: 'isEnabled' } as const, true)
const autoAtom = atom({ plugin: 'prompt-upgrade', key: 'autoMode' } as const, false)
const historyAtom = atom({ plugin: 'prompt-upgrade', key: 'history' } as const, [])
const settingsAtom = atom({ plugin: 'prompt-upgrade', key: 'settings' } as const, DEFAULT_SETTINGS)
const optionsAtom = atom({ plugin: 'prompt-upgrade', key: 'options' } as const, [])

function newFlow(id: string, step: UpgradeFlow['step'], original: string): UpgradeFlow {
  return {
    id,
    step,
    original,
    questions: [],
    answers: [],
    otherOpen: null,
    upgraded: null,
    added: [],
    isEditing: false,
    failedAt: null,
    note: null,
  }
}

function isResolved(a: UpgradeAnswer | undefined): boolean {
  return a !== undefined && (a.isSkipped === true || (a.value ?? '').trim() !== '')
}

// ---------------------------------------------------------------------------
// State changes: only from commands, presses and other events, never a draw.

async function setFlow($: Dollar, fn: (f: UpgradeFlow | null) => UpgradeFlow | null): Promise<UpgradeFlow | null> {
  let after: UpgradeFlow | null = null
  await update($, flowAtom, f => (after = fn(f ?? null)))
  return after
}

/** Runs work after the current dispatch answers, so commands and presses return at once. */
function later($: Dollar, work: () => Promise<void>): void {
  $.clock.after(0, () => {
    void work().catch(() => undefined)
  })
}

async function openPane($: Dollar): Promise<boolean> {
  const opened = await $.ui.open({ id: PANE, title: 'Prompt Upgrade', focus: true, closeOnEscape: true, rows: 30 })
  if (opened.isPlaced) return true
  // Too narrow (or nowhere to draw): give the words back and say so once.
  const flow = await read($, flowAtom)
  await setFlow($, () => null)
  await $.ui.close({ id: PANE })
  if (flow !== null && flow.original.trim() !== '') await $.prompt.fill({ text: flow.original })
  $.ui.toast('The window is too narrow for Prompt Upgrade, so your words are back in the prompt box.')
  return false
}

async function startUpgrade($: Dollar, text: string): Promise<void> {
  const id = `u${await $.clock.now()}`
  await setFlow($, () => newFlow(id, 'reading', text))
  if (!(await openPane($))) return
  await runQuestions($, id)
}

async function runQuestions($: Dollar, id: string): Promise<void> {
  const flow = await read($, flowAtom)
  if (flow === null || flow.id !== id || flow.step !== 'reading') return
  const max = Number((await read($, settingsAtom)).questions)
  if (max === 0) {
    await setFlow($, f => (f && f.id === id ? { ...f, step: 'rewrite', questions: [] } : f))
    await runRewrite($, id)
    return
  }
  const reply = await $.model.complete({
    model: QUESTION_MODEL,
    system: questionsSystem(max),
    prompt: questionsPrompt(flow.original),
    maxTokens: 700,
    timeoutMs: 45000,
  })
  const now = await read($, flowAtom)
  if (now === null || now.id !== id || now.step !== 'reading') return
  if (!reply.isAnswered) {
    await setFlow($, f => (f && f.id === id ? { ...f, step: 'error', failedAt: 'reading' } : f))
    return
  }
  const questions = parseQuestions(reply.text, max)
  if (questions.length === 0) {
    await setFlow($, f => (f && f.id === id ? { ...f, step: 'rewrite', questions: [] } : f))
    await runRewrite($, id)
    return
  }
  await setFlow($, f => (f && f.id === id ? { ...f, step: 'questions', questions, answers: [] } : f))
}

async function runRewrite($: Dollar, id: string): Promise<void> {
  const flow = await read($, flowAtom)
  if (flow === null || flow.id !== id || flow.step !== 'rewrite') return
  const reply = await $.model.complete({
    model: (await read($, settingsAtom)).rewriteModel,
    system: REWRITE_SYSTEM,
    prompt: rewritePrompt(flow.original, flow.questions, flow.answers),
    maxTokens: 2500,
    timeoutMs: 90000,
  })
  const now = await read($, flowAtom)
  if (now === null || now.id !== id || now.step !== 'rewrite') return
  const parsed = reply.isAnswered ? parseRewrite(reply.text) : null
  if (parsed === null) {
    await setFlow($, f => (f && f.id === id ? { ...f, step: 'error', failedAt: 'rewrite' } : f))
    return
  }
  await setFlow($, f =>
    f && f.id === id ? { ...f, step: 'review', upgraded: parsed.prompt, added: parsed.added, isEditing: false } : f,
  )
}

async function goToRewrite($: Dollar, id: string): Promise<void> {
  const after = await setFlow($, f =>
    f && f.id === id && f.step === 'questions'
      ? {
          ...f,
          step: 'rewrite',
          otherOpen: null,
          answers: f.questions.map((_, i) => (isResolved(f.answers[i]) ? f.answers[i]! : { isSkipped: true })),
        }
      : f,
  )
  if (after?.step === 'rewrite') await runRewrite($, id)
}

async function answer($: Dollar, id: string, index: number, value: UpgradeAnswer): Promise<void> {
  const after = await setFlow($, f => {
    if (f === null || f.id !== id || f.step !== 'questions') return f
    const answers = [...f.answers]
    answers[index] = value
    return { ...f, answers, otherOpen: null }
  })
  // Every question answered or skipped: carry straight on to the rewrite, unless set to wait.
  const allDone = after !== null && after.step === 'questions' && after.questions.every((_, i) => isResolved(after.answers[i]))
  if (allDone && (await read($, settingsAtom)).autoContinue) {
    await goToRewrite($, id)
  }
}

async function openOther($: Dollar, id: string, index: number): Promise<void> {
  await setFlow($, f => (f && f.id === id ? { ...f, otherOpen: index } : f))
}

async function retry($: Dollar, id: string): Promise<void> {
  const after = await setFlow($, f =>
    f && f.id === id && f.step === 'error' ? { ...f, step: f.failedAt ?? 'reading', failedAt: null } : f,
  )
  if (after?.step === 'reading') await runQuestions($, id)
  if (after?.step === 'rewrite') await runRewrite($, id)
}

async function saveHistory($: Dollar, record: UpgradeRecord): Promise<void> {
  let list: UpgradeRecord[] = []
  await update($, historyAtom, h0 => (list = [record, ...(h0 ?? []).filter(r => r.id !== record.id)].slice(0, HISTORY_SIZE)))
  await $.store.set(STORE_HISTORY, list)
  await publishOptions($)
}

async function clearHistory($: Dollar): Promise<void> {
  await update($, historyAtom, () => [])
  await $.store.set(STORE_HISTORY, [])
  await publishOptions($)
}

/** Keeps the published option list (what a control panel draws) in step with the settings. */
async function publishOptions($: Dollar): Promise<void> {
  const settings = await read($, settingsAtom)
  const auto = await read($, autoAtom)
  const history = await read($, historyAtom)
  await update($, optionsAtom, () => optionsOf(settings, auto, history.length))
}

async function saveSettings($: Dollar, settings: UpgradeSettings): Promise<void> {
  await update($, settingsAtom, () => settings)
  await $.store.set(STORE_SETTINGS, settings)
  await publishOptions($)
}

async function runIt($: Dollar, text: string): Promise<void> {
  const flow = await read($, flowAtom)
  const toSend = text.trim()
  if (toSend === '') return
  if (flow !== null && flow.upgraded !== null) {
    await saveHistory($, {
      id: flow.id,
      at: await $.clock.now(),
      original: flow.original,
      upgraded: toSend,
      added: flow.added,
    })
  }
  await setFlow($, () => null)
  await $.ui.close({ id: PANE })
  // Sent as a plugin's prompt: the intercept passes every non-typed prompt, so it never loops.
  await $.prompt.submit({ text: toSend, asUser: true })
}

async function sendOriginal($: Dollar): Promise<void> {
  const flow = await read($, flowAtom)
  if (flow === null) return
  await setFlow($, () => null)
  await $.ui.close({ id: PANE })
  await $.prompt.submit({ text: flow.original, asUser: true })
}

async function cancel($: Dollar): Promise<void> {
  const flow = await read($, flowAtom)
  await setFlow($, () => null)
  await $.ui.close({ id: PANE })
  if (flow !== null && flow.step !== 'history' && flow.original.trim() !== '') {
    await $.prompt.fill({ text: flow.original })
  }
}

async function copyUpgrade($: Dollar, surface: RenderSurface): Promise<void> {
  const flow = await read($, flowAtom)
  if (flow?.upgraded == null) return
  const copied = await $.ui.copy({ text: flow.upgraded, surface })
  const note = copied.isCopied ? 'Copied to the clipboard.' : 'Could not copy here. Use Edit to select the text.'
  await setFlow($, f => (f && f.id === flow.id ? { ...f, note } : f))
}

async function setEditing($: Dollar, id: string, isEditing: boolean): Promise<void> {
  await setFlow($, f => (f && f.id === id ? { ...f, isEditing, note: null } : f))
}

async function openRecord($: Dollar, record: UpgradeRecord): Promise<void> {
  await setFlow($, () => ({
    ...newFlow(record.id, 'review', record.original),
    upgraded: record.upgraded,
    added: record.added,
  }))
}

async function setAuto($: Dollar, value: boolean): Promise<void> {
  await update($, autoAtom, () => value)
  await $.store.set(STORE_AUTO, value)
  await publishOptions($)
}

async function setEnabled($: Dollar, value: boolean): Promise<void> {
  await update($, enabledAtom, () => value)
  await $.store.set(STORE_ENABLED, value)
  // Turned off mid-upgrade: close the pane and give the words back.
  if (!value && (await read($, flowAtom)) !== null) await cancel($)
}

async function openStep($: Dollar, flow: UpgradeFlow): Promise<void> {
  await setFlow($, () => flow)
  await openPane($)
}

// ---------------------------------------------------------------------------
// Drawing helpers: pure, and sized to the pane so no row wraps.

function dateLabel(at: number): string {
  const d = new Date(at)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${hh}:${mm}`
}

/** Packs chips (label widths) into rows no wider than `width`. */
function packRows<T extends { width: number }>(items: T[], width: number): T[][] {
  const rows: T[][] = []
  let row: T[] = []
  let used = 0
  for (const item of items) {
    const need = (row.length === 0 ? 0 : 1) + item.width
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

const TRACKER = [
  { long: 'Your prompt', short: 'Prompt' },
  { long: 'Questions', short: 'Ask' },
  { long: 'Rewrite', short: 'Write' },
  { long: 'Review', short: 'Review' },
] as const

function trackerIndex(flow: UpgradeFlow): number {
  switch (flow.step) {
    case 'compose':
    case 'reading':
      return 0
    case 'questions':
      return 1
    case 'rewrite':
      return 2
    case 'review':
      return 3
    case 'error':
      return flow.failedAt === 'rewrite' ? 2 : 1
    default:
      return 0
  }
}

// ---------------------------------------------------------------------------

export function registerPromptUpgrade(on: On): void {
  on('session.start', async ($, e, next) => {
    await update($, versionAtom, () => VERSION)
    const enabled = await $.store.get(STORE_ENABLED)
    const auto = await $.store.get(STORE_AUTO)
    const history = await $.store.get(STORE_HISTORY)
    const saved = await $.store.get(STORE_SETTINGS)
    await update($, enabledAtom, () => enabled !== false)
    await update($, autoAtom, () => auto === true)
    await update($, historyAtom, () => (Array.isArray(history) ? (history as UpgradeRecord[]).slice(0, HISTORY_SIZE) : []))
    await update($, settingsAtom, () => asSettings(saved))
    await publishOptions($)
    await $.command.register({
      name: 'better',
      description: 'Upgrade a rough prompt before sending it (on, off, history, enable, disable)',
      argumentHint: '<prompt> | on | off | history | enable | disable | set <option> <value> | version',
    })

    // Reloaded mid-step: pick the step back up.
    const flow = await read($, flowAtom)
    if (flow !== null && enabled !== false) {
      later($, async () => {
        if (!(await openPane($))) return
        if (flow.step === 'reading') await runQuestions($, flow.id)
        if (flow.step === 'rewrite' && flow.upgraded === null) await runRewrite($, flow.id)
      })
    }

    return next(e)
  })

  on('command.run', { command: 'better' }, async ($, e) => {
    const arg = e.args.trim()
    const word = arg.toLowerCase()
    if (word === 'version') return { text: `Prompt Upgrade version ${VERSION}` }
    // Options work whether the mod is on or off, so they can be set up first.
    const set = /^set\s+(\S+)\s+(\S+)$/.exec(word)
    if (set !== null) {
      const [, key, value] = set as unknown as [string, string, string]
      if (key === 'auto' && (value === 'on' || value === 'off')) {
        await setAuto($, value === 'on')
        return { text: `Prompt Upgrade: automatic mode is now ${value}.` }
      }
      if (key === 'history' && value === 'clear') {
        await clearHistory($)
        return { text: 'Prompt Upgrade: history cleared.' }
      }
      const changed = applySetting(await read($, settingsAtom), key, value)
      if (changed === undefined) {
        return {
          text: 'Prompt Upgrade options: auto on|off, questions 0|1|2|3, model haiku|sonnet|opus, continue auto|wait, history clear.',
        }
      }
      await saveSettings($, changed)
      return { text: `Prompt Upgrade: ${key} is now ${value}.` }
    }
    if (word === 'enable' || word === 'disable') {
      await setEnabled($, word === 'enable')
      return {
        text:
          word === 'enable'
            ? 'Prompt Upgrade is on.'
            : 'Prompt Upgrade is off. Nothing is intercepted; turn it back on in /mods or with /better enable.',
      }
    }
    if (!(await read($, enabledAtom))) {
      return { text: 'Prompt Upgrade is off. Turn it on in /mods or with /better enable.' }
    }
    if (word === 'on' || word === 'off') {
      await setAuto($, word === 'on')
      return {
        text:
          word === 'on'
            ? 'Prompt Upgrade automatic mode is on. Prompts you type open the upgrade pane first; start one with > to send it as is.'
            : 'Prompt Upgrade automatic mode is off. Prompts go straight to Claude.',
      }
    }
    if (word === 'history') {
      const history = await read($, historyAtom)
      later($, () => openStep($, newFlow('history', 'history', '')))
      return { text: history.length === 0 ? 'No upgrades yet.' : `Showing your last ${history.length} upgrades.` }
    }
    if (arg === '') {
      later($, async () => openStep($, newFlow(`c${await $.clock.now()}`, 'compose', '')))
      return { text: 'Type the prompt you want to upgrade in the Prompt Upgrade pane.' }
    }
    later($, () => startUpgrade($, arg))
    return { text: 'Upgrading your prompt. Nothing is sent until you press Run it.' }
  }).catch(() => ({ text: 'Prompt Upgrade hit a problem and did nothing. Your prompt was not sent.' }))

  on('prompt.submit', async ($, e, next) => {
    if (!(await read($, enabledAtom)) || !(await read($, autoAtom))) return next(e)
    const decision = decideIntercept({
      text: e.text,
      originKind: e.origin.kind,
      hasCommand: e.command !== undefined,
      isMeta: e.isMeta === true,
      hasAttachments: (e.attachments?.length ?? 0) > 0,
      isDuringTurn: e.turnId !== undefined,
    })
    if (decision.kind === 'pass') return next(e)
    if (decision.kind === 'strip') return next({ ...e, text: decision.text })
    const text = e.text
    later($, () => startUpgrade($, text))
    return { drop: 'Opened in Prompt Upgrade. Nothing is sent until you press Run it.' }
  }).catch(($, e, next) => next(e))

  // The person closed the pane themselves: same as Cancel, so nothing is lost.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const result = await next(e)
    if (e.origin.kind === 'person') {
      const flow = await read($, flowAtom)
      await setFlow($, () => null)
      if (flow !== null && flow.step !== 'history' && flow.original.trim() !== '') {
        await $.prompt.fill({ text: flow.original })
      }
    }
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const flow = await read($, flowAtom)
    const history = await read($, historyAtom)
    const cols = Math.max(24, e.props.bodyColumns)

    // -- Shared pieces --------------------------------------------------------

    const heading = (label: string) => (
      <Text wrap="truncate-end">
        <Text color={COLOR.muted}>{label} </Text>
        <Text color={COLOR.hair}>{'─'.repeat(Math.max(0, cols - label.length - 1))}</Text>
      </Text>
    )
    const primary = (key: string, label: string, onPress: () => void) => (
      <Button key={key} plain onPress={onPress}>
        <Text backgroundColor={COLOR.gold} color={COLOR.ink} bold>
          {` ${label} `}
        </Text>
      </Button>
    )
    const slate = (key: string, label: string, onPress: (p: { surface: RenderSurface }) => void) => (
      <Button key={key} plain onPress={onPress}>
        <Text backgroundColor={COLOR.hair} color={COLOR.text}>
          {` ${label} `}
        </Text>
      </Button>
    )
    const quiet = (key: string, label: string, onPress: () => void) => (
      <Button key={key} plain onPress={onPress}>
        <Text color={COLOR.muted}>{label}</Text>
      </Button>
    )
    const card = (lines: string[], border: string, width: number, title?: { text: string; color: string }) => (
      <Box borderStyle="round" borderColor={border} width={width} paddingX={1} flexDirection="column">
        {title !== undefined && <Text color={title.color}>{fit(title.text, width - 4)}</Text>}
        {lines.map(line => (
          <Text color={COLOR.text}>{fit(line, width - 4)}</Text>
        ))}
      </Box>
    )
    const status = (text: string, color: string = COLOR.muted) => <Text color={color}>{fit(text, cols)}</Text>
    const buttonRow = (buttons: Array<{ width: number; el: ReturnType<typeof primary> }>) =>
      packRows(buttons, cols).map(row => (
        <Box flexDirection="row" columnGap={1}>
          {row.map(b => b.el)}
        </Box>
      ))

    const title = 'PROMPT UPGRADE'
    const top = [
      <Text bold color={COLOR.text}>
        {title}
      </Text>,
      <Text wrap="truncate-end">
        <Text color={COLOR.gold}>{'━'.repeat(title.length)}</Text>
        <Text color={COLOR.hair}>{'─'.repeat(Math.max(0, cols - title.length))}</Text>
      </Text>,
    ]

    const page = (body: ReturnType<typeof status>[]) => (
      <Box flexDirection="column" width={cols} rowGap={0}>
        {top}
        {body}
      </Box>
    )

    if (flow === null) {
      return page([status('Nothing to upgrade right now. Type /better and your prompt to start.')])
    }

    // -- History --------------------------------------------------------------

    if (flow.step === 'history') {
      const body: ReturnType<typeof status>[] = [<Text> </Text>, heading('LAST 20 UPGRADES')]
      if (history.length === 0) body.push(status('No upgrades yet. Your upgrades will show here after you run one.'))
      for (const record of history) {
        const label = dateLabel(record.at)
        body.push(
          <Button key={`h-${record.id}`} plain onPress={() => void openRecord($, record)}>
            <Text color={COLOR.muted}>{label} </Text>
            <Text color={COLOR.text}>{fit(record.original.replace(/\s+/g, ' '), cols - label.length - 1)}</Text>
          </Button>,
        )
      }
      body.push(<Text> </Text>, quiet('close', 'Close', () => void cancel($)))
      return page(body)
    }

    // -- Tracker --------------------------------------------------------------

    const current = trackerIndex(flow)
    const sep = ' ── '
    const longWidth = TRACKER.reduce((n, s) => n + s.long.length + 2, 0) + sep.length * 3
    const shortWidth = TRACKER.reduce((n, s) => n + s.short.length + 2, 0) + sep.length * 3
    const which: 'long' | 'short' | 'num' = longWidth <= cols ? 'long' : shortWidth <= cols ? 'short' : 'num'
    const tracker = (
      <Text wrap="truncate-end">
        {TRACKER.map((s, i) => {
          const name = which === 'num' ? String(i + 1) : s[which]
          const part =
            i < current ? (
              <Text color={COLOR.green}>✓ {name}</Text>
            ) : i === current ? (
              <Text color={COLOR.gold} bold>
                ● {name}
              </Text>
            ) : (
              <Text color={COLOR.muted}>○ {name}</Text>
            )
          return (
            <Text>
              {part}
              {i < TRACKER.length - 1 && <Text color={COLOR.hair}>{sep}</Text>}
            </Text>
          )
        })}
      </Text>
    )

    const body: ReturnType<typeof status>[] = [tracker, <Text> </Text>]
    const originalCard = (width: number, label = 'YOUR PROMPT') =>
      card(wrapLines(flow.original, width - 4), COLOR.hair, width, { text: label, color: COLOR.muted })

    // -- 0. Compose (/better alone) -------------------------------------------

    if (flow.step === 'compose') {
      body.push(
        heading('YOUR PROMPT'),
        <Input
          key="compose"
          rows={4}
          autoFocus
          placeholder="Type the prompt you want to upgrade, then press Enter"
          submitLabel="upgrade"
          onSubmit={value => (value.trim() === '' ? undefined : void startUpgrade($, value.trim()))}
        />,
        <Text> </Text>,
        quiet('cancel', 'Cancel', () => void cancel($)),
      )
      return page(body)
    }

    // -- 1. Reading -----------------------------------------------------------

    if (flow.step === 'reading') {
      body.push(originalCard(cols), status('Reading your prompt and choosing a few quick questions.'))
      body.push(<Text> </Text>, quiet('cancel', 'Cancel', () => void cancel($)))
      return page(body)
    }

    // -- 2. Questions ---------------------------------------------------------

    if (flow.step === 'questions') {
      const total = flow.questions.length
      const done = flow.questions.filter((_, i) => isResolved(flow.answers[i])).length
      body.push(heading('QUESTIONS'))
      flow.questions.forEach((q, i) => {
        const a = flow.answers[i]
        const resolved = isResolved(a)
        const badge = resolved ? (
          <Text color={COLOR.ink} backgroundColor={COLOR.green} bold>
            {' ✓ '}
          </Text>
        ) : (
          <Text color={COLOR.ink} backgroundColor={COLOR.gold} bold>
            {` ${i + 1} `}
          </Text>
        )
        const lines = wrapLines(q.question, cols - 4)
        body.push(
          <Text wrap="truncate-end">
            {badge}
            <Text color={COLOR.text}> {lines[0] ?? ''}</Text>
          </Text>,
        )
        for (const line of lines.slice(1)) body.push(<Text color={COLOR.text}>{`    ${line}`}</Text>)

        const isOther = a?.value !== undefined && !q.options.includes(a.value)
        const chips = [
          ...q.options.map((opt, k) => {
            const selected = a?.value === opt
            const label = fit(opt, Math.min(opt.length, cols - 2))
            return {
              width: label.length + 2,
              el: (
                <Button key={`q${i}-o${k}`} plain onPress={() => void answer($, flow.id, i, { value: opt })}>
                  <Text backgroundColor={selected ? COLOR.gold : COLOR.hair} color={selected ? COLOR.ink : COLOR.text} bold={selected}>
                    {` ${label} `}
                  </Text>
                </Button>
              ),
            }
          }),
          (() => {
            const raw = isOther ? `Other: ${a?.value ?? ''}` : 'Other (type it)'
            const label = fit(raw, Math.min(raw.length, cols - 2))
            return {
              width: label.length + 2,
              el: (
                <Button key={`q${i}-other`} plain onPress={() => void openOther($, flow.id, i)}>
                  <Text backgroundColor={isOther ? COLOR.gold : COLOR.hair} color={isOther ? COLOR.ink : COLOR.text} bold={isOther}>
                    {` ${label} `}
                  </Text>
                </Button>
              ),
            }
          })(),
          {
            width: 4,
            el: (
              <Button key={`q${i}-skip`} plain onPress={() => void answer($, flow.id, i, { isSkipped: true })}>
                <Text color={COLOR.muted}>{a?.isSkipped === true ? 'Skipped' : 'Skip'}</Text>
              </Button>
            ),
          },
        ]
        for (const row of packRows(chips, cols - 4)) {
          body.push(
            <Box flexDirection="row" columnGap={1} paddingLeft={4}>
              {row.map(c => c.el)}
            </Box>,
          )
        }
        if (flow.otherOpen === i) {
          body.push(
            <Box paddingLeft={4}>
              <Input
                key={`q${i}-input`}
                autoFocus
                placeholder="Type your answer, then press Enter"
                submitLabel="save"
                onSubmit={value => (value.trim() === '' ? undefined : void answer($, flow.id, i, { value: value.trim() }))}
              />
            </Box>,
          )
        }
        body.push(<Text> </Text>)
      })
      body.push(status(`${done} of ${total} answered`))
      const allDone = done === total
      body.push(
        ...buttonRow([
          allDone
            ? { width: 13, el: primary('upgrade-now', 'Upgrade now', () => void goToRewrite($, flow.id)) }
            : { width: 28, el: primary('skip-rest', 'Skip the rest, upgrade now', () => void goToRewrite($, flow.id)) },
          { width: 6, el: quiet('cancel', 'Cancel', () => void cancel($)) },
        ]),
      )
      return page(body)
    }

    // -- 3. Rewrite -----------------------------------------------------------

    if (flow.step === 'rewrite') {
      body.push(originalCard(cols), status('Writing the upgraded prompt from your answers.'))
      body.push(<Text> </Text>, quiet('cancel', 'Cancel', () => void cancel($)))
      return page(body)
    }

    // -- Error ----------------------------------------------------------------

    if (flow.step === 'error') {
      const what = flow.failedAt === 'rewrite' ? 'write the upgrade' : 'read your prompt'
      body.push(
        card(
          wrapLines(`Claude couldn't ${what} just now. Your prompt is safe and nothing was sent.`, cols - 4),
          COLOR.amber,
          cols,
          { text: 'SOMETHING WENT WRONG', color: COLOR.amber },
        ),
        <Text> </Text>,
        ...buttonRow([
          { width: 11, el: primary('retry', 'Try again', () => later($, () => retry($, flow.id))) },
          { width: 18, el: slate('send-original', 'Send my original', () => void sendOriginal($)) },
          { width: 6, el: quiet('cancel', 'Cancel', () => void cancel($)) },
        ]),
      )
      return page(body)
    }

    // -- 4. Review --------------------------------------------------------------

    const upgraded = flow.upgraded ?? ''
    const before = countWords(flow.original)
    const after = countWords(upgraded)
    const stats = [
      { n: before, label: 'WORDS BEFORE' },
      { n: after, label: 'WORDS AFTER' },
      { n: flow.added.length, label: 'DETAILS ADDED' },
    ].map(s => {
      const rows = bigNumber(s.n)
      return { ...s, rows, width: Math.max(rows[0].length, s.label.length) + 4 }
    })
    const tilesWidth = stats.reduce((n, s) => n + s.width, 0) + stats.length - 1
    if (tilesWidth <= cols) {
      body.push(
        <Box flexDirection="row" columnGap={1}>
          {stats.map(s => (
            <Box borderStyle="round" borderColor={COLOR.hair} width={s.width} paddingX={1} flexDirection="column">
              {s.rows.map(r => (
                <Text color={COLOR.gold}>{fit(r, s.width - 4)}</Text>
              ))}
              <Text color={COLOR.muted}>{fit(s.label, s.width - 4)}</Text>
            </Box>
          ))}
        </Box>,
      )
    } else {
      body.push(status(`${before} words before · ${after} words after · ${flow.added.length} details added`, COLOR.text))
    }

    // Buttons above the cards, so a long rewrite never pushes them away.
    if (flow.isEditing) {
      body.push(
        ...buttonRow([
          { width: 14, el: slate('stop-edit', 'Stop editing', () => void setEditing($, flow.id, false)) },
          { width: 6, el: quiet('cancel', 'Cancel', () => void cancel($)) },
        ]),
        status('Change the text below, then press Enter to run it.'),
      )
    } else {
      body.push(
        ...buttonRow([
          { width: 8, el: primary('run', 'Run it', () => void runIt($, upgraded)) },
          { width: 6, el: slate('edit', 'Edit', () => void setEditing($, flow.id, true)) },
          { width: 6, el: slate('copy', 'Copy', p => void copyUpgrade($, p.surface)) },
          { width: 6, el: quiet('cancel', 'Cancel', () => void cancel($)) },
        ]),
      )
    }
    if (flow.note !== null) body.push(status(flow.note, COLOR.green))
    body.push(<Text> </Text>)

    if (flow.added.length > 0) {
      body.push(heading('WHAT I ADDED'))
      for (const item of flow.added) {
        const lines = wrapLines(item, cols - 2)
        lines.forEach((line, k) =>
          body.push(
            <Text wrap="truncate-end">
              <Text color={COLOR.green}>{k === 0 ? '+ ' : '  '}</Text>
              <Text color={COLOR.text}>{line}</Text>
            </Text>,
          ),
        )
      }
      body.push(<Text> </Text>)
    }

    const sideBySide = cols >= 70
    const cardWidth = sideBySide ? Math.floor((cols - 1) / 2) : cols
    const upgradedCard = flow.isEditing ? (
      <Box borderStyle="round" borderColor={COLOR.gold} width={cardWidth} paddingX={1} flexDirection="column">
        <Text color={COLOR.gold}>{fit('UPGRADE (EDITING)', cardWidth - 4)}</Text>
        <Input
          key="edit"
          autoFocus
          value={upgraded}
          rows={Math.min(12, wrapLines(upgraded, cardWidth - 4).length + 1)}
          submitLabel="run"
          onSubmit={value => void runIt($, value)}
        />
      </Box>
    ) : (
      card(wrapLines(upgraded, cardWidth - 4), COLOR.gold, cardWidth, { text: 'UPGRADE', color: COLOR.gold })
    )
    body.push(
      sideBySide ? (
        <Box flexDirection="row" columnGap={1}>
          {originalCard(cardWidth)}
          {upgradedCard}
        </Box>
      ) : (
        <Box flexDirection="column">
          {originalCard(cardWidth)}
          {upgradedCard}
        </Box>
      ),
    )

    return page(body)
  })
}
