import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

type Engine = Parameters<Parameters<typeof test>[1]>[0]

const PANE = {
  plugin: 'mod-menu',
  component: 'Pane',
  requestId: 'mod-menu',
  props: {
    title: 'Mods',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

type Published = Record<string, Record<string, unknown>>

// Prompt Upgrade's option list as it publishes it: a toggle, two choices and an action, in three groups.
function upgradeOptions(auto: boolean, questions: string) {
  return [
    { key: 'auto', label: 'Automatic mode', kind: 'toggle', value: auto ? 'on' : 'off', group: 'General' },
    {
      key: 'questions',
      label: 'Questions to ask',
      kind: 'choice',
      value: questions,
      group: 'Behavior',
      choices: ['0', '1', '2', '3'].map(v => ({ value: v, label: v })),
    },
    {
      key: 'model',
      label: 'Rewrite model',
      kind: 'choice',
      value: 'sonnet',
      group: 'Behavior',
      choices: [
        { value: 'haiku', label: 'Haiku' },
        { value: 'sonnet', label: 'Sonnet' },
        { value: 'opus', label: 'Opus' },
      ],
      hint: 'Haiku is fastest. Opus writes best and uses the most usage.',
    },
    {
      key: 'history',
      label: 'History',
      kind: 'action',
      value: 'clear',
      group: 'Data',
      actionLabel: 'Clear history',
      hint: '12 upgrades saved',
    },
  ]
}

function installed(): Published {
  return {
    'clean-view': {
      cleanViewEnabled: true,
      options: [{ key: 'plan', label: 'Plan first', kind: 'toggle', value: 'on', group: 'Behavior' }],
    },
    'prompt-upgrade': { isEnabled: true, options: upgradeOptions(false, '3') },
  }
}

// Nothing sits beneath the plugin: these hooks stand for the engine and the other mods.
function engine(on: On, published: Published) {
  const runs: string[] = []
  const opened: string[] = []
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.toast', () => ({ value: undefined }))
  // The other mods' own commands: record the run and change what they publish.
  on('command.run', (_, e) => {
    runs.push(`/${e.command} ${e.args}`)
    const cv = published['clean-view']
    const pu = published['prompt-upgrade']
    if (e.command === 'simple' && cv && (e.args === 'on' || e.args === 'off')) cv.cleanViewEnabled = e.args === 'on'
    if (e.command === 'better' && pu) {
      if (e.args === 'enable' || e.args === 'disable') pu.isEnabled = e.args === 'enable'
      const set = /^set (\S+) (\S+)$/.exec(e.args)
      if (set?.[1] === 'auto') pu.options = upgradeOptions(set[2] === 'on', '3')
      if (set?.[1] === 'questions') pu.options = upgradeOptions(false, set[2]!)
    }
    return { text: 'ok' }
  })
  on('state.get', (_, e, next) => {
    // The menu's own values go to the kit's real state; only the other mods are stood in for.
    if (e.plugin === 'mod-menu') return next(e)
    const owner = published[e.plugin]
    if (owner === undefined || !(e.key in owner)) return { value: { value: undefined, version: 0 } }
    return { value: { value: owner[e.key], version: 1 } }
  })
  return { clock, runs, opened }
}

async function boot($: Engine, on: On, published: Published) {
  const world = engine(on, published)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return world
}

async function allText(ui: { findAll: (q: { type: string }) => Promise<Array<{ text: string }>> }) {
  return (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
}

// The real mods redraw the menu when what they publish changes; this stand-in
// can't, so the tests draw the menu again to read the new state.
async function draw($: Engine, surface: 'terminal' | 'desktop' = 'terminal', columns = 100) {
  return $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns: columns } })
}

test('/mods answers at once and opens the menu', async ($, on) => {
  const { clock, opened } = await boot($, on, {})
  const answer = await $.command.run({ command: 'mods', args: '' })
  expect(answer.text).toBe('Opening the Mods menu.')
  await clock.settle()
  expect(opened).toEqual(['mod-menu'])
})

test('the header counts what is installed and on; a missing mod says so', async ($, on) => {
  await boot($, on, {})
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await draw($, surface)
    let text = await allText(ui)
    expect(text).toMatch(/1 installed · 1 on/)
    expect(text).toMatch(/INSTALLED/)
    // Nothing else is installed, so the menu itself is selected first.
    expect(text).toMatch(/Always on/)
    await ui.press({ key: 'pick-clean-view' })
    text = await allText(ui)
    expect(text).toMatch(/Not installed/)
    expect(text).toMatch(/isn’t installed on this computer/)
    await ui.press({ key: 'pick-mod-menu' }) // the selection lasts the session: reset it for the next surface
    await ui.unmount()
  }
})

test('two columns when wide, one when narrow', async ($, on) => {
  await boot($, on, installed())
  let ui = await draw($, 'terminal', 100)
  expect(await ui.find({ type: 'Text', text: /^│ $/ })).toBeDefined()
  await ui.unmount()
  ui = await draw($, 'terminal', 50)
  expect(await ui.find({ type: 'Text', text: /^│ $/ })).toBeUndefined()
  // The list (Prompt Upgrade is a Button there), then the selected mod's settings below it.
  expect(await ui.find({ key: 'pick-prompt-upgrade' })).toBeDefined()
  expect(await allText(ui)).toMatch(/Clean View[\s\S]*Hides tool calls/)
  await ui.unmount()
})

test('the on/off switch runs each mod\'s own command', async ($, on) => {
  const published = installed()
  const { runs } = await boot($, on, published)
  for (const surface of ['terminal', 'desktop'] as const) {
    runs.length = 0
    Object.assign(published, installed())
    let ui = await draw($, surface)
    // The first installed mod is selected when the menu opens.
    expect(await allText(ui)).toMatch(/2 installed · 2 on|3 installed · 3 on/)
    await ui.press({ key: 'switch-clean-view-off' })
    await ui.press({ key: 'pick-prompt-upgrade' })
    await ui.press({ key: 'switch-prompt-upgrade-off' })
    expect(runs).toEqual(['/simple off', '/better disable'])
    await ui.press({ key: 'pick-clean-view' })
    await ui.unmount()
    ui = await draw($, surface)
    expect(await allText(ui)).toMatch(/3 installed · 1 on/)
    await ui.unmount()
  }
})

test('settings are grouped, and every control runs "/<command> set <key> <value>"', async ($, on) => {
  const published = installed()
  const { runs } = await boot($, on, published)
  for (const surface of ['terminal', 'desktop'] as const) {
    runs.length = 0
    published['prompt-upgrade'] = installed()['prompt-upgrade']!
    let ui = await draw($, surface)
    await ui.press({ key: 'pick-prompt-upgrade' })
    const text = await allText(ui)
    expect(text).toMatch(/GENERAL[\s\S]*Automatic mode[\s\S]*BEHAVIOR[\s\S]*Questions to ask[\s\S]*DATA[\s\S]*History/)
    expect(text).toMatch(/12 upgrades saved/)
    expect(text).toMatch(/Commands: \/better, \/better history, \/better set/)

    await ui.press({ key: 'opt-prompt-upgrade-auto-on' })
    await ui.press({ key: 'opt-prompt-upgrade-questions-1' })
    await ui.press({ key: 'opt-prompt-upgrade-model-opus' })
    await ui.press({ key: 'opt-prompt-upgrade-history' })
    expect(runs).toEqual([
      '/better set auto on',
      '/better set questions 1',
      '/better set model opus',
      '/better set history clear',
    ])
    await ui.unmount()

    // The newly published choice is the gold one.
    ui = await draw($, surface)
    expect(JSON.stringify((await ui.find({ key: 'opt-prompt-upgrade-questions-1' }))?.children)).toMatch(/F2C46D/)
    expect(JSON.stringify((await ui.find({ key: 'opt-prompt-upgrade-questions-3' }))?.children)).not.toMatch(/F2C46D/)
    await ui.press({ key: 'pick-clean-view' })
    await ui.unmount()
  }
})

test('a mod that is off still shows its settings, with a note', async ($, on) => {
  const published = installed()
  published['prompt-upgrade']!.isEnabled = false
  await boot($, on, published)
  const ui = await draw($)
  await ui.press({ key: 'pick-prompt-upgrade' })
  expect(await allText(ui)).toMatch(/Prompt Upgrade is off\. These apply when it’s on\./)
  expect(await ui.find({ key: 'opt-prompt-upgrade-questions-2' })).toBeDefined()
  await ui.unmount()
})

test('rows fit the pane at narrow, middle and wide widths', async ($, on) => {
  await boot($, on, installed())
  const ui0 = await draw($)
  await ui0.press({ key: 'pick-prompt-upgrade' })
  await ui0.unmount()
  for (const columns of [30, 70, 140]) {
    const ui = await draw($, 'terminal', columns)
    for (const row of await ui.findAll({ type: 'Box' })) {
      if (row.props.flexDirection !== 'row' || row.props.width !== columns) continue
      expect(row.text.length <= columns).toBe(true)
    }
    for (const t of await ui.findAll({ type: 'Text' })) {
      for (const line of t.text.split('\n')) expect(line.length <= columns).toBe(true)
    }
    await ui.unmount()
  }
})

test('the chosen On or Off is a gold box with dark text; the other is a dim button', async ($, on) => {
  const published = installed()
  await boot($, on, published)
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const isOn of [true, false]) {
      ;(published['clean-view'] as Record<string, unknown>).cleanViewEnabled = isOn
      const ui = await draw($, surface)
      const chosen = await ui.find({ key: isOn ? 'switch-clean-view-on' : 'switch-clean-view-off' })
      const other = await ui.find({ key: isOn ? 'switch-clean-view-off' : 'switch-clean-view-on' })
      // Chosen: not a Button (a desktop drops colour inside one), a gold Box with dark bold text.
      expect(chosen?.type).toBe('Box')
      expect(chosen?.props.backgroundColor).toBe('#F2C46D')
      expect(JSON.stringify(chosen?.children)).toMatch(/"color":"#0D1117"/)
      expect(JSON.stringify(chosen?.children)).toMatch(/"bold":true/)
      // Not chosen: a Button drawn dim, with no fill.
      expect(other?.type).toBe('Button')
      expect(other?.props.dimColor).toBe(true)
      expect(other?.props.backgroundColor).toBeUndefined()
      // The same goes for an option's Off and On (Plan first is on).
      expect((await ui.find({ key: 'opt-clean-view-plan-on' }))?.type).toBe('Box')
      expect((await ui.find({ key: 'opt-clean-view-plan-off' }))?.type).toBe('Button')
      // And the picked mod in the list.
      expect((await ui.find({ key: 'pick-clean-view' }))?.props.backgroundColor).toBe('#F2C46D')
      await ui.unmount()
    }
  }
})

test('no Button carries colour inside it, so a desktop draws every colour', async ($, on) => {
  await boot($, on, installed())
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await draw($, surface)
    await ui.press({ key: 'pick-prompt-upgrade' })
    for (const button of await ui.findAll({ type: 'Button' })) {
      expect(JSON.stringify(button.children ?? [])).not.toMatch(/color|backgroundColor/i)
    }
    await ui.press({ key: 'pick-clean-view' })
    await ui.unmount()
  }
})

test('versions: each mod\'s published version shows by its name, the menu shows its own', async ($, on) => {
  const published = installed()
  published['clean-view']!.version = '0.1.1'
  await boot($, on, published)
  expect((await $.command.run({ command: 'mods', args: 'version' })).text).toBe('Mods menu version 0.3.2')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await draw($, surface) // Clean View, the first installed mod, is selected
    expect(await allText(ui)).toMatch(/Clean View · v0\.1\.1/)
    // A mod that publishes no version shows none, rather than a wrong one.
    await ui.press({ key: 'pick-prompt-upgrade' })
    expect(await allText(ui)).not.toMatch(/Prompt Upgrade · v/)
    await ui.press({ key: 'pick-mod-menu' })
    expect(await allText(ui)).toMatch(/Mods menu · v0\.3\.2/)
    await ui.press({ key: 'pick-clean-view' })
    await ui.unmount()
  }
})

test('Reflect is listed with its switch, options and version', async ($, on) => {
  const published = installed()
  published['reflect'] = {
    isEnabled: true,
    version: '0.1.0',
    options: [
      {
        key: 'suggest',
        label: 'Suggest first',
        kind: 'choice',
        value: 'auto',
        group: 'Behavior',
        choices: [
          { value: 'auto', label: 'Auto' },
          { value: 'project', label: 'This project' },
          { value: 'everywhere', label: 'All projects' },
        ],
      },
    ],
  }
  const { runs } = await boot($, on, published)
  for (const surface of ['terminal', 'desktop'] as const) {
    runs.length = 0
    const ui = await draw($, surface)
    await ui.press({ key: 'pick-reflect' })
    const text = await allText(ui)
    expect(text).toMatch(/Reflect · v0\.1\.0/)
    expect(text).toMatch(/Suggest first/)
    expect(text).toMatch(/Commands: \/reflect, \/reflect set/)
    await ui.press({ key: 'switch-reflect-off' })
    await ui.press({ key: 'opt-reflect-suggest-project' })
    expect(runs).toEqual(['/reflect off', '/reflect set suggest project'])
    await ui.press({ key: 'pick-clean-view' })
    await ui.unmount()
  }
})

test('Team Tracker is listed with its switch, options and version', async ($, on) => {
  const published = installed()
  published['team-tracker'] = {
    isEnabled: true,
    version: '0.1.0',
    options: [{ key: 'cost', label: 'Show costs', kind: 'toggle', value: 'on', group: 'General' }],
  }
  const { runs } = await boot($, on, published)
  const ui = await draw($)
  await ui.press({ key: 'pick-team-tracker' })
  const text = await allText(ui)
  expect(text).toMatch(/Team Tracker · v0\.1\.0/)
  expect(text).toMatch(/Show costs/)
  await ui.press({ key: 'opt-team-tracker-cost-off' })
  await ui.press({ key: 'switch-team-tracker-off' })
  expect(runs).toEqual(['/team set cost off', '/team off'])
  await ui.unmount()
})
