// Pure helpers for Prompt Upgrade: no `$`, so the tests can call them directly.

import type { UpgradeAnswer, UpgradeOption, UpgradeQuestion, UpgradeSettings } from '../types'

// ---------------------------------------------------------------------------
// Which typed prompts go to the pane.

const SHORT_REPLIES = new Set([
  'y', 'n', 'yes', 'no', 'ok', 'okay', 'sure', 'thanks', 'thank you', 'yep', 'nope', 'go', 'go on',
  'go ahead', 'keep going', 'continue', 'carry on', 'do it', 'stop', 'retry', 'try again', 'sounds good',
  'looks good', 'lgtm', 'perfect', 'great', 'next', 'done', 'approved', 'agreed',
])

export type InterceptInput = {
  text: string
  originKind: string
  hasCommand: boolean
  isMeta: boolean
  hasAttachments: boolean
  isDuringTurn: boolean
}

/** `intercept` sends the prompt to the pane; `strip` sends it on without its leading ">". */
export type InterceptDecision = { kind: 'pass' } | { kind: 'strip'; text: string } | { kind: 'intercept' }

export function decideIntercept(p: InterceptInput): InterceptDecision {
  // Only the person's own typing; a plugin's prompt (ours included) never loops back.
  if (p.originKind !== 'composer') return { kind: 'pass' }
  if (p.hasCommand || p.isMeta || p.hasAttachments || p.isDuringTurn) return { kind: 'pass' }
  const text = p.text.trim()
  if (text.startsWith('/')) return { kind: 'pass' }
  if (text.startsWith('>')) return { kind: 'strip', text: text.replace(/^>\s*/, '') }
  if (isShortReply(text)) return { kind: 'pass' }

  return { kind: 'intercept' }
}

export function isShortReply(text: string): boolean {
  const plain = text.toLowerCase().replace(/[.!?,]+$/g, '').trim()
  if (plain === '') return true
  if (SHORT_REPLIES.has(plain)) return true
  return countWords(plain) <= 3
}

export function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(w => w !== '')
  return words.length
}

// ---------------------------------------------------------------------------
// What the model is asked, and reading what it answers.

export function questionsSystem(max: number): string {
  return [
    'You help a person improve a rough request before it is sent to an AI assistant.',
    `Pick at most ${max === 1 ? 'one multiple-choice question' : `${max} multiple-choice questions`} whose answers would most improve the result.`,
    'Each question is short and plain. Each has 2 to 4 short options (under 30 characters each).',
    'Ask only what the request leaves open and the person can answer quickly. If nothing would help, ask none.',
    'Reply with JSON only, no prose: {"questions":[{"question":"...","options":["...","..."]}]}',
  ].join('\n')
}

export function questionsPrompt(original: string): string {
  return `The rough request:\n<request>\n${original}\n</request>`
}

export const REWRITE_SYSTEM = [
  'You rewrite a rough request into a great one, as one request the person could have typed themselves, in plain language.',
  'Rules:',
  '- Keep exactly what they meant. Do not change the task.',
  '- Add a clear goal, who it is for, the format, and what "done" looks like.',
  '- Use the answers they gave. Leave out anything they skipped.',
  '- Never invent facts, names, numbers or prices. Where something is unknown, leave a [placeholder] in square brackets.',
  '- No headings or markdown. Short paragraphs or a short list are fine.',
  'Reply with JSON only, no prose: {"prompt":"the upgraded request","added":["short note of each thing you added"]}',
].join('\n')

export function rewritePrompt(original: string, questions: UpgradeQuestion[], answers: UpgradeAnswer[]): string {
  const answered = questions
    .map((q, i) => ({ q, a: answers[i] }))
    .filter(({ a }) => a !== undefined && a.isSkipped !== true && (a.value ?? '').trim() !== '')
    .map(({ q, a }) => `- ${q.question} ${a?.value ?? ''}`)
  const notes = answered.length > 0 ? `\n\nTheir answers:\n${answered.join('\n')}` : '\n\nThey gave no extra answers.'

  return `The rough request:\n<request>\n${original}\n</request>${notes}`
}

function firstJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
}

/** Reads the questions reply; anything unreadable counts as "no questions would help". */
export function parseQuestions(text: string, max = 3): UpgradeQuestion[] {
  const parsed = firstJson(text) as { questions?: unknown } | undefined
  const list = Array.isArray(parsed?.questions) ? parsed.questions : []
  const out: UpgradeQuestion[] = []
  for (const item of list) {
    const q = item as { question?: unknown; options?: unknown }
    const question = typeof q.question === 'string' ? q.question.trim() : ''
    const options = Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === 'string' && o.trim() !== '').map(o => o.trim().slice(0, 40))
      : []
    if (question === '' || options.length < 2) continue
    out.push({ question, options: options.slice(0, 4) })
    if (out.length >= max) break
  }
  return out
}

/** Reads the rewrite reply; plain text with no JSON is taken as the prompt itself. */
export function parseRewrite(text: string): { prompt: string; added: string[] } | null {
  const parsed = firstJson(text) as { prompt?: unknown; added?: unknown } | undefined
  if (parsed !== undefined && typeof parsed.prompt === 'string' && parsed.prompt.trim() !== '') {
    const added = Array.isArray(parsed.added)
      ? parsed.added.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map(a => a.trim())
      : []
    return { prompt: parsed.prompt.trim(), added: added.slice(0, 8) }
  }
  const plain = text.trim()
  return plain === '' ? null : { prompt: plain, added: [] }
}

// ---------------------------------------------------------------------------
// Options a control panel draws, and applying `/better set <key> <value>`.

export const DEFAULT_SETTINGS: UpgradeSettings = { questions: '3', rewriteModel: 'sonnet', autoContinue: true }

export function asSettings(saved: unknown): UpgradeSettings {
  const s = (saved ?? {}) as Partial<UpgradeSettings>
  return {
    questions: s.questions === '0' || s.questions === '1' || s.questions === '2' ? s.questions : '3',
    rewriteModel: s.rewriteModel === 'haiku' || s.rewriteModel === 'opus' ? s.rewriteModel : 'sonnet',
    autoContinue: typeof s.autoContinue === 'boolean' ? s.autoContinue : true,
  }
}

export function optionsOf(s: UpgradeSettings, autoMode: boolean, historyCount: number): UpgradeOption[] {
  return [
    {
      key: 'auto',
      label: 'Automatic mode',
      kind: 'toggle',
      value: autoMode ? 'on' : 'off',
      group: 'General',
      hint: 'Prompts you type open the upgrade pane first.',
    },
    {
      key: 'questions',
      group: 'Behavior',
      label: 'Questions to ask',
      kind: 'choice',
      value: s.questions,
      choices: ['0', '1', '2', '3'].map(v => ({ value: v, label: v })),
    },
    {
      key: 'model',
      group: 'Behavior',
      label: 'Rewrite model',
      kind: 'choice',
      value: s.rewriteModel,
      choices: [
        { value: 'haiku', label: 'Haiku' },
        { value: 'sonnet', label: 'Sonnet' },
        { value: 'opus', label: 'Opus' },
      ],
      hint: 'Haiku is fastest. Opus writes best and uses the most usage.',
    },
    {
      key: 'continue',
      group: 'Behavior',
      label: 'After the last answer',
      kind: 'choice',
      value: s.autoContinue ? 'auto' : 'wait',
      choices: [
        { value: 'auto', label: 'Continue' },
        { value: 'wait', label: 'Wait' },
      ],
    },
    {
      key: 'history',
      group: 'Data',
      label: 'History',
      kind: 'action',
      value: 'clear',
      actionLabel: 'Clear history',
      hint: historyCount === 1 ? '1 upgrade saved' : `${historyCount} upgrades saved`,
    },
  ]
}

/** Applies a settings change; undefined when the key or value isn't one it knows. */
export function applySetting(s: UpgradeSettings, key: string, value: string): UpgradeSettings | undefined {
  if (key === 'questions' && (value === '0' || value === '1' || value === '2' || value === '3')) return { ...s, questions: value }
  if (key === 'model' && (value === 'haiku' || value === 'sonnet' || value === 'opus')) return { ...s, rewriteModel: value }
  if (key === 'continue' && (value === 'auto' || value === 'wait')) return { ...s, autoContinue: value === 'auto' }
  return undefined
}

// ---------------------------------------------------------------------------
// Laying text out so no row wraps.

/** Word-wraps `text` into lines of at most `width` cells, keeping its own line breaks. */
export function wrapLines(text: string, width: number): string[] {
  const w = Math.max(1, width)
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(x => x !== '')) {
      let rest = word
      while (rest.length > w) {
        if (line !== '') {
          out.push(line)
          line = ''
        }
        out.push(rest.slice(0, w))
        rest = rest.slice(w)
      }
      if (line === '') line = rest
      else if (line.length + 1 + rest.length <= w) line += ` ${rest}`
      else {
        out.push(line)
        line = rest
      }
    }
    out.push(line)
  }
  return out
}

export function fit(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length > width) return text.slice(0, Math.max(0, width - 1)) + '…'
  return text + ' '.repeat(width - text.length)
}

// Three-row digits in heavy box-drawing characters, three cells wide each.
const DIGITS: Record<string, [string, string, string]> = {
  '0': ['┏━┓', '┃ ┃', '┗━┛'],
  '1': ['╺┓ ', ' ┃ ', '╺┻╸'],
  '2': ['╺━┓', '┏━┛', '┗━╸'],
  '3': ['╺━┓', ' ━┫', '╺━┛'],
  '4': ['╻ ╻', '┗━┫', '  ╹'],
  '5': ['┏━╸', '┗━┓', '╺━┛'],
  '6': ['┏━╸', '┣━┓', '┗━┛'],
  '7': ['╺━┓', '  ┃', '  ╹'],
  '8': ['┏━┓', '┣━┫', '┗━┛'],
  '9': ['┏━┓', '┗━┫', '╺━┛'],
}

export function bigNumber(n: number): [string, string, string] {
  const chars = String(Math.max(0, Math.round(n))).split('')
  const rows: [string, string, string] = ['', '', '']
  for (const c of chars) {
    const g = DIGITS[c] ?? DIGITS['0']!
    for (let r = 0; r < 3; r++) rows[r] = rows[r] === '' ? g[r]! : `${rows[r]} ${g[r]}`
  }
  return rows
}
