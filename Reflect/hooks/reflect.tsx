import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { ReflectOffer, ReflectPlace, ReflectSettings } from '../types'
import {
  DEFAULT_SETTINGS,
  addRule,
  applySetting,
  asSettings,
  dateLabel,
  optionsOf,
  parseVerdict,
  placeKey,
  placeLabel,
  placeName,
  placesFor,
  shouldCheck,
  verdictSystem,
} from './logic'
import type { Where } from './logic'

type Dollar = EngineInterface

const VERSION = '0.1.0' // keep in step with .claude-plugin/plugin.json
const STALE_MS = 30 * 60 * 1000
const STORE_ENABLED = 'isEnabled'
const STORE_SETTINGS = 'settings'

const COLOR = { gold: '#F2C46D', muted: '#7D8590' } as const

// Shared state (see types/index.d.ts): the Mods menu reads version, isEnabled and options.
const versionAtom = atom({ plugin: 'reflect', key: 'version' } as const, VERSION)
const enabledAtom = atom({ plugin: 'reflect', key: 'isEnabled' } as const, true)
const settingsAtom = atom({ plugin: 'reflect', key: 'settings' } as const, DEFAULT_SETTINGS)
const optionsAtom = atom({ plugin: 'reflect', key: 'options' } as const, [])
const offerAtom = atom({ plugin: 'reflect', key: 'offer' } as const, null)

// ---------------------------------------------------------------------------
// Where rules can go, read fresh each time.

function trimSlash(path: string): string {
  return path.replace(/[\\/]+$/, '')
}

/** Claude Code's own folder: CLAUDE_CONFIG_DIR when set, else ~/.claude. */
async function claudeFolder($: Dollar): Promise<string | null> {
  const custom = (await $.env.get('CLAUDE_CONFIG_DIR'))?.trim()
  if (custom) return trimSlash(custom)
  const home = ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')))?.trim()
  return home ? `${trimSlash(home)}/.claude` : null
}

/** Each `<folder>/<name>/SKILL.md`, skipping names already found. */
async function skillsIn($: Dollar, folder: string, found: Map<string, string>): Promise<void> {
  let entries: Awaited<ReturnType<Dollar['fs']['list']>>
  try {
    entries = await $.fs.list(folder)
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || found.has(entry.name)) continue
    const path = `${folder}/${entry.name}/SKILL.md`
    if (await $.fs.exists(path).catch(() => false)) found.set(entry.name, path)
  }
}

async function whereRulesGo($: Dollar): Promise<Where> {
  const root = trimSlash(await $.session.root())
  const home = await claudeFolder($)
  const skills = new Map<string, string>()
  await skillsIn($, `${root}/.claude/skills`, skills) // a project skill wins over a personal one of the same name
  if (home !== null) await skillsIn($, `${home}/skills`, skills)
  return {
    project: `${root}/CLAUDE.md`,
    everywhere: home === null ? null : `${home}/CLAUDE.md`,
    skills: [...skills].sort(([a], [b]) => a.localeCompare(b)).map(([skill, path]) => ({ skill, path })),
  }
}

// ---------------------------------------------------------------------------

async function isOn($: Dollar): Promise<boolean> {
  return read($, enabledAtom)
}

async function catchRule($: Dollar, said: string): Promise<void> {
  if (!(await isOn($))) return
  const at = await whereRulesGo($)
  const skills = at.skills.map(k => k.skill)
  const reply = await $.model.complete({
    model: 'haiku',
    system: verdictSystem(skills),
    prompt: `The message:\n\n${said.slice(0, 4000)}`,
    maxTokens: 200,
    timeoutMs: 20000,
  })
  if (!reply.isAnswered) return
  const verdict = parseVerdict(reply.text, skills)
  if (verdict === null) return
  const offer: ReflectOffer = {
    rule: verdict.rule,
    places: placesFor(verdict, at, await read($, settingsAtom)),
    at: await $.clock.now(),
  }
  await update($, offerAtom, () => offer)
}

async function dropStale($: Dollar): Promise<void> {
  const now = await $.clock.now()
  await update($, offerAtom, o => (o !== null && now - o.at > STALE_MS ? null : o))
}

/** Saves the waiting rule where the person picked; says what happened in one line. */
async function saveTo($: Dollar, place: ReflectPlace): Promise<void> {
  const offer = await read($, offerAtom)
  if (offer === null) return
  await update($, offerAtom, () => null)
  try {
    const before = (await $.fs.exists(place.path)) ? await $.fs.read(place.path) : ''
    const after = addRule(before, offer.rule, dateLabel(await $.clock.now()))
    if (after.isDuplicate) {
      $.ui.toast(`That rule is already saved in ${placeName(place)}.`)
      return
    }
    await $.fs.write(place.path, after.text)
    $.ui.toast(`Saved to ${placeName(place)}. ${after.count} ${after.count === 1 ? 'rule' : 'rules'} there now.`)
  } catch {
    await update($, offerAtom, () => offer)
    $.ui.toast("Couldn't save that rule. Try again, or ask Claude to add it for you.")
  }
}

async function setEnabled($: Dollar, value: boolean): Promise<void> {
  await update($, enabledAtom, () => value)
  await $.store.set(STORE_ENABLED, value)
  if (!value) await update($, offerAtom, () => null)
}

async function saveSettings($: Dollar, settings: ReflectSettings): Promise<void> {
  await update($, settingsAtom, () => settings)
  await update($, optionsAtom, () => optionsOf(settings))
  await $.store.set(STORE_SETTINGS, settings)
}

// ---------------------------------------------------------------------------

export function registerReflect(on: On): void {
  on('session.start', async ($, e, next) => {
    await update($, versionAtom, () => VERSION)
    const enabled = await $.store.get(STORE_ENABLED)
    await update($, enabledAtom, () => enabled !== false)
    const settings = asSettings(await $.store.get(STORE_SETTINGS))
    await update($, settingsAtom, () => settings)
    await update($, optionsAtom, () => optionsOf(settings))
    await $.command.register({
      name: 'reflect',
      description: 'Turn Reflect on or off (it offers to save your corrections as lasting rules)',
      argumentHint: 'on | off | set <option> <value> | version',
    })
    return next(e)
  })

  on('command.run', { command: 'reflect' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'version') return { text: `Reflect version ${VERSION}` }
    const set = /^set\s+(\S+)\s+(\S+)$/.exec(arg)
    if (set !== null) {
      const changed = applySetting(await read($, settingsAtom), set[1]!, set[2]!)
      if (changed === undefined) return { text: 'Reflect options: suggest auto|project|everywhere, skills on|off.' }
      await saveSettings($, changed)
      return { text: `Reflect: ${set[1]} is now ${set[2]}.` }
    }
    const wanted = arg === 'on' ? true : arg === 'off' ? false : arg === '' ? !(await isOn($)) : undefined
    if (wanted === undefined) return { text: 'Use /reflect on, /reflect off, /reflect to flip it, or /reflect set <option> <value>.' }
    await setEnabled($, wanted)
    return {
      text: wanted
        ? 'Reflect is on. When you correct Claude in a lasting way, it offers to save that as a rule.'
        : 'Reflect is off.',
    }
  }).catch(() => ({ text: 'Reflect hit a problem and changed nothing.' }))

  // The message goes on untouched at once; the check runs after it.
  on('prompt.submit', async ($, e, next) => {
    const said = e.text
    const check = shouldCheck({
      text: said,
      originKind: e.origin.kind,
      isAsUser: e.origin.kind === 'plugin' && (e.origin as { asUser?: boolean }).asUser === true,
      hasCommand: e.command !== undefined,
      isMeta: e.isMeta === true,
    })
    $.clock.after(0, () => {
      void dropStale($)
        .then(() => (check ? catchRule($, said) : undefined))
        .catch(() => undefined)
    })
    return next(e)
  }).catch(($, e, next) => next(e))

  // The offer, above whatever else draws there. On the desktop a Button keeps no
  // colour inside it, so colour sits only on plain Text here.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    let below: Awaited<ReturnType<typeof next>> | undefined
    try {
      below = await next(e)
    } catch {
      below = undefined
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const offer = (await isOn($)) && !e.props.hasSurvey ? await read($, offerAtom) : null
    if (offer === null) return below ?? <Box />
    const width = Math.max(20, e.props.bodyColumns)
    const quoted = `“${offer.rule}”`

    return (
      <Box flexDirection="column" width={width}>
        <Text wrap="wrap">
          <Text color={COLOR.gold} bold>
            Save as a rule?{' '}
          </Text>
          <Text>{quoted}</Text>
        </Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {offer.places.map((place, i) => (
            <Button
              key={`reflect-${placeKey(place)}`}
              label={placeLabel(place)}
              variant={i === 0 ? 'primary' : 'secondary'}
              onPress={() => void saveTo($, place)}
            />
          ))}
          <Button key="reflect-no" label="No thanks" dimColor onPress={() => void update($, offerAtom, () => null)} />
        </Box>
        {below}
      </Box>
    )
  })
}
