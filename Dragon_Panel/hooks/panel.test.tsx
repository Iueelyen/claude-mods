// Tests for the Dragon control panel (D-02). process.run is faked with made-up panel data,
// so no PowerShell runs and nothing touches Azure.
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'dragon-panel',
  component: 'Pane',
  requestId: 'dragon-panel',
  props: {
    title: 'Azure Dragon',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const DATA = {
  GeneratedAt: '10-25-26 22:00',
  Tenants: [
    { Alias: 'aa', Name: 'Contoso OT', InScope: true, SignedIn: true, InventoryLight: '✓',
      LastRun: '10-25-26 20:03', Problem: null, CertDays: 20, GraphMcp: false },
    { Alias: 'bb', Name: 'Contoso', InScope: false, SignedIn: false, InventoryLight: null,
      LastRun: null, Problem: null, CertDays: null, GraphMcp: false },
  ],
  Vms: [
    { Tenant: 'aa', Name: 'AA-DC-01', PowerState: 'running', JoinType: 'domain-assumed',
      LastConnected: '2026-10-25T21:50:00Z', Ago: '10 min' },
    { Tenant: 'aa', Name: 'AA-SQL-01', PowerState: 'deallocated', JoinType: 'domain-assumed',
      LastConnected: null, Ago: null },
  ],
  Drift: [{ Tenant: 'aa', Ours: 50, NetworkDept: 10, Naming: 200 }],
  Backup: { LastRun: '10-25-26 15:15', Ok: true },
}

test('the panel shows tenant lights, drift, servers and the backup', async ($, on) => {
  const ran: string[][] = []
  on('command.register', () => ({ value: { command: 'dragon' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: {} }))
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: JSON.stringify(DATA), stderr: '' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'dragon', args: '' })

  // The data comes from Get-NtsPanelData, read-only.
  expect(ran.some(argv => argv.join(' ').includes('Get-NtsPanelData'))).toBe(true)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Contoso OT/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /out of scope/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /10 network dept/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Cert 20 days/ })).toBeTruthy()
  expect(await ui.find({ key: 'connect-aa-AA-DC-01' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Backup 10-25-26 15:15/ })).toBeTruthy()
  await ui.unmount()
})

test('servers: recent first, Show all per tenant, search, running only', async ($, on) => {
  on('command.register', () => ({ value: { command: 'dragon' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: {} }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify(DATA), stderr: '' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'dragon', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // Recent: only the server you connected to, with how long ago.
  expect(await ui.find({ type: 'Text', text: /10 min/ })).toBeTruthy()
  expect(await ui.find({ key: 'connect-aa-AA-SQL-01' })).toBeFalsy()

  // Show all for aa: every aa server, A to Z.
  await ui.press({ key: 'showall-aa' })
  expect(await ui.find({ type: 'Text', text: /All 2, A to Z/ })).toBeTruthy()
  expect(await ui.find({ key: 'connect-aa-AA-SQL-01' })).toBeTruthy()

  // Power dots sit outside the buttons: green filled for running, hollow for off.
  const dots = await ui.findAll({ type: 'Text', text: /^[●○]$/ })
  expect(dots.map(d => d.text)).toContain('●')
  expect(dots.map(d => d.text)).toContain('○')

  // Running only hides the switched-off server.
  await ui.press({ key: 'running-only' })
  expect(await ui.find({ key: 'connect-aa-AA-SQL-01' })).toBeFalsy()
  await ui.press({ key: 'running-only' })

  // Back to recent, then a search finds a server that isn't recent.
  await ui.press({ key: 'showall-aa' })
  await ui.input({ key: 'search', text: 'sql', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: /1 matches/ })).toBeTruthy()
  expect(await ui.find({ key: 'connect-aa-AA-SQL-01' })).toBeTruthy()
  await ui.unmount()
})

test('a failed read shows the error instead of stale lights', async ($, on) => {
  on('command.register', () => ({ value: { command: 'dragon' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: {} }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'No inventory yet' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'dragon', args: '' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /No inventory yet/ })).toBeTruthy()
  await ui.unmount()
})
