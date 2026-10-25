// Pure helpers for Reflect: no `$`, so the tests can call them directly.

import type { ReflectOption, ReflectPlace, ReflectSettings } from '../types'

export const HEADING = '## Rules saved by Reflect'

// ---------------------------------------------------------------------------
// Which messages get the (paid) model check. The word check itself is free.

const LASTING =
  /\b(never|always|from now on|going forward|every time|each time|any time|stop|quit|no more|don'?t|do not|please don'?t|i (told|asked) you|i('| a)m tired of|again\??|remember( that| to)?|i prefer|i'?d (rather|prefer)|instead of|should (always|never|be)|not like that|too (long|short|wordy|formal|casual|many|much))\b/i

export type CheckInput = {
  text: string
  originKind: string
  /** A plugin resending the person's own words (`asUser`). */
  isAsUser: boolean
  hasCommand: boolean
  isMeta: boolean
}

/** True when a message is the person's own, sounds lasting, and isn't marked to pass. */
export function shouldCheck(p: CheckInput): boolean {
  if (p.hasCommand || p.isMeta) return false
  const isPersons = p.originKind === 'composer' || p.originKind === 'bridge' || (p.originKind === 'plugin' && p.isAsUser)
  if (!isPersons) return false
  const text = p.text.trim()
  if (text === '' || text.startsWith('/') || text.startsWith('>')) return false
  return LASTING.test(text)
}

// ---------------------------------------------------------------------------
// The model's verdict.

export type Suggested = { kind: 'project' } | { kind: 'everywhere' } | { kind: 'skill'; skill: string }
export type Verdict = { rule: string; place: Suggested }

export function verdictSystem(skills: readonly string[]): string {
  return [
    'You read one message a person sent to an AI coding assistant and decide whether it sets a lasting rule.',
    'A lasting rule is a preference or correction about how the assistant should work or write from now on, such as "never use em dashes" or "always run the tests before saying it works".',
    'An instruction only for the task at hand is not a rule, such as "make that shorter" or "don\'t change that file today".',
    'If it is a rule, write it as one short instruction to the assistant, keeping the person\'s own words where you can, with no dashes.',
    'Say where it belongs: "project" for this project\'s code, files or way of working; "everywhere" for a personal preference in any project;' +
      ` "skill" if it belongs to one of these skills: ${skills.length > 0 ? skills.join(', ') : '(none)'}.`,
    'Reply with JSON only: {"isRule": true|false, "rule": "...", "place": "project"|"everywhere"|"skill", "skill": "name or null"}',
  ].join('\n')
}

/** The rule in the model's reply, or null when it isn't one or can't be read. */
export function parseVerdict(raw: string, skills: readonly string[]): Verdict | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  if (data.isRule !== true || typeof data.rule !== 'string') return null
  const rule = cleanRule(data.rule)
  if (rule === '') return null
  const skill = typeof data.skill === 'string' ? data.skill.trim() : ''
  const place: Suggested =
    data.place === 'everywhere'
      ? { kind: 'everywhere' }
      : data.place === 'skill' && skills.includes(skill)
        ? { kind: 'skill', skill }
        : { kind: 'project' }
  return { rule, place }
}

/** One plain line: no wrapping quotes, no long dashes, no trailing full stop, one line. */
export function cleanRule(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
    .trim()
}

// ---------------------------------------------------------------------------
// Where a rule can go, in button order.

export type Where = { project: string; everywhere: string | null; skills: Array<{ skill: string; path: string }> }

export function placesFor(v: Verdict, at: Where, s: ReflectSettings): ReflectPlace[] {
  const all: ReflectPlace[] = [{ kind: 'project', path: at.project }]
  if (at.everywhere !== null) all.push({ kind: 'everywhere', path: at.everywhere })
  if (s.showSkills) for (const k of at.skills) all.push({ kind: 'skill', skill: k.skill, path: k.path })
  const wanted: Suggested = s.suggestFirst === 'auto' ? v.place : { kind: s.suggestFirst }
  const first = all.findIndex(
    p => p.kind === wanted.kind && (p.kind !== 'skill' || (wanted.kind === 'skill' && p.skill === wanted.skill)),
  )
  if (first > 0) all.unshift(...all.splice(first, 1))
  return all
}

export function placeLabel(p: ReflectPlace): string {
  return p.kind === 'project' ? 'This project' : p.kind === 'everywhere' ? 'All projects' : `Skill: ${p.skill}`
}

export function placeKey(p: ReflectPlace): string {
  return p.kind === 'skill' ? `skill-${p.skill}` : p.kind
}

export function placeName(p: ReflectPlace): string {
  return p.kind === 'project' ? 'this project' : p.kind === 'everywhere' ? 'all your projects' : `the ${p.skill} skill`
}

// ---------------------------------------------------------------------------
// Adding a rule to a file.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 24, 2026" in the computer's own time zone. */
export function dateLabel(ms: number): string {
  const d = new Date(ms)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

const ruleOf = (line: string) => cleanRule(line.replace(/^-\s*/, '').replace(/\s*\(saved [^)]*\)\s*$/, '')).toLowerCase()

/**
 * Adds `- <rule> (saved <date>)` at the end of the Reflect section, adding the
 * section (or the whole file) when missing. A rule already in the section, word
 * for word, is not added twice.
 */
export function addRule(
  fileText: string,
  rule: string,
  date: string,
): { text: string; count: number; isDuplicate: boolean } {
  const eol = fileText.includes('\r\n') ? '\r\n' : '\n'
  const lines = fileText.replace(/\s+$/, '') === '' ? [] : fileText.replace(/\s+$/, '').split(/\r?\n/)
  let head = lines.findIndex(l => l.trim() === HEADING)
  if (head === -1) {
    if (lines.length > 0) lines.push('')
    lines.push(HEADING, '')
    head = lines.length - 2
  }
  let end = head + 1
  while (end < lines.length && !/^#{1,2}\s/.test(lines[end]!)) end += 1
  const section = lines.slice(head + 1, end).filter(l => l.startsWith('- '))
  const isDuplicate = section.some(l => ruleOf(l) === cleanRule(rule).toLowerCase())
  if (!isDuplicate) {
    let last = end - 1
    while (last > head && lines[last]!.trim() === '') last -= 1
    const at = last === head ? head + 2 : last + 1
    if (last === head && lines[head + 1] !== '') lines.splice(head + 1, 0, '')
    lines.splice(at, 0, `- ${cleanRule(rule)} (saved ${date})`)
  }
  return { text: lines.join(eol) + eol, count: section.length + (isDuplicate ? 0 : 1), isDuplicate }
}

// ---------------------------------------------------------------------------
// Options a control panel draws, and applying `/reflect set <key> <value>`.

export const DEFAULT_SETTINGS: ReflectSettings = { suggestFirst: 'auto', showSkills: true }

export function asSettings(saved: unknown): ReflectSettings {
  const s = (saved ?? {}) as Partial<ReflectSettings>
  return {
    suggestFirst: s.suggestFirst === 'project' || s.suggestFirst === 'everywhere' ? s.suggestFirst : 'auto',
    showSkills: typeof s.showSkills === 'boolean' ? s.showSkills : true,
  }
}

export function optionsOf(s: ReflectSettings): ReflectOption[] {
  return [
    {
      key: 'suggest',
      label: 'Suggest first',
      kind: 'choice',
      value: s.suggestFirst,
      group: 'Behavior',
      choices: [
        { value: 'auto', label: 'Auto' },
        { value: 'project', label: 'This project' },
        { value: 'everywhere', label: 'All projects' },
      ],
      hint: 'Which button is highlighted. Auto lets Reflect guess.',
    },
    {
      key: 'skills',
      label: 'Show skill buttons',
      kind: 'toggle',
      value: s.showSkills ? 'on' : 'off',
      group: 'General',
      hint: 'One button per skill, to save a rule into that skill.',
    },
  ]
}

export function applySetting(s: ReflectSettings, key: string, value: string): ReflectSettings | undefined {
  if (key === 'suggest' && (value === 'auto' || value === 'project' || value === 'everywhere')) return { ...s, suggestFirst: value }
  if (key === 'skills' && (value === 'on' || value === 'off')) return { ...s, showSkills: value === 'on' }
  return undefined
}
