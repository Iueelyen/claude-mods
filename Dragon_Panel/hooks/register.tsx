// Azure Dragon control panel (BACKLOG D-02): a pane beside the chat.
// Buttons only read or launch (CLAUDE.md "Visual first"):
//   Refresh           reruns Get-NtsPanelData (local files only, no Azure)
//   Connect           opens Connect-NtsVm in its own PowerShell window, as if typed there
//   Update inventory  only types the request into the chat box; it reads Azure, so it
//                     goes through the chat with Chris's OK
import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

import type { PanelData, PanelTenant, PanelView, PanelVm, ServerListUi } from '../types'

const PANE = 'dragon-panel'
const VERSION = '0.2.1' // keep in step with .claude-plugin/plugin.json
const REPO = 'C:\\_Repos\\Azure_Dragon'
const MODULE = `${REPO}\\scripts\\AzureDragon\\AzureDragon.psd1`
const REFRESH_MS = 15 * 60 * 1000
const STORE_ENABLED = 'isEnabled'

// For the Mods menu: the version, the on/off switch, and options (none yet).
// Off: the panel doesn't open by itself or read in the background; /dragon still opens it.
const versionAtom = atom({ plugin: 'dragon-panel', key: 'version' } as const, VERSION)
const enabledAtom = atom({ plugin: 'dragon-panel', key: 'isEnabled' } as const, true)
const optionsAtom = atom({ plugin: 'dragon-panel', key: 'options' } as const, [])

const view = atom({ plugin: 'dragon-panel', key: 'view' } as const, {
  data: null,
  error: null,
  isLoading: false,
} as PanelView)

// Server list settings. Every tenant starts open, showing its recent servers.
const list = atom({ plugin: 'dragon-panel', key: 'list' } as const, {
  search: '',
  runningOnly: false,
  closed: {},
  showAll: {},
} as ServerListUi)

// How many recent servers each tenant shows before "Show all".
const RECENT_COUNT = 8

// Which servers a tenant's section lists right now:
//   searching  every match in that tenant, A-Z
//   Show all   every server in that tenant, A-Z
//   otherwise  the servers you connected to most recently, newest first
function serversFor(vms: PanelVm[], tenant: string, ui: ServerListUi) {
  const search = ui.search.trim().toLowerCase()
  const keep = (v: PanelVm) =>
    v.Tenant === tenant &&
    (!search || v.Name.toLowerCase().includes(search)) &&
    (!ui.runningOnly || v.PowerState === 'running')
  const mine = vms.filter(keep)
  if (search || ui.showAll[tenant]) {
    return { mode: search ? 'search' : 'all', vms: [...mine].sort((a, b) => a.Name.localeCompare(b.Name)) }
  }
  const recent = mine
    .filter(v => v.LastConnected)
    .sort((a, b) => (b.LastConnected ?? '').localeCompare(a.LastConnected ?? ''))
    .slice(0, RECENT_COUNT)
  return { mode: 'recent', vms: recent }
}

// Reads the panel data: one pwsh call, output forced to UTF-8 so the ✓ ⚠ ✗ lights survive.
async function refresh($: Engine) {
  await update($, view, v => ({ ...v, isLoading: true }))
  try {
    const script =
      `[Console]::OutputEncoding = [Text.Encoding]::UTF8; Import-Module '${MODULE}'; ` +
      'Get-NtsPanelData | ConvertTo-Json -Depth 5 -Compress'
    const r = await $.process.run(['pwsh', '-NoProfile', '-NonInteractive', '-Command', script], {
      cwd: REPO,
      timeoutMs: 120000,
    })
    if (r.exitCode !== 0) throw new Error(r.stderr.trim().split('\n')[0] || `pwsh exit ${r.exitCode}`)
    const data = JSON.parse(r.stdout) as PanelData
    await update($, view, () => ({ data, error: null, isLoading: false }))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, view, v => ({ ...v, error: message, isLoading: false }))
  }
}

// Opens Connect-NtsVm in a new PowerShell window. Names are checked first, because they go
// into a command line: only letters, digits, dot, dash and underscore get through.
async function connect($: Engine, tenant: string, name: string) {
  if (!/^[a-z]{2,4}$/.test(tenant) || !/^[A-Za-z0-9._-]+$/.test(name)) {
    $.ui.toast(`Not a safe VM name: ${name}`)
    return
  }
  const inner = `Import-Module '${MODULE}'; Connect-NtsVm -Name ${name} -Tenant ${tenant}`
  const outer = `Start-Process pwsh -ArgumentList '-NoExit','-Command',"${inner}"`
  await $.process.run(['pwsh', '-NoProfile', '-NonInteractive', '-Command', outer], { cwd: REPO })
  $.ui.toast(`Opening ${name} in a new PowerShell window`)
  // Connect-NtsVm writes the history line once it has picked a Bastion: read again shortly after,
  // so the server shows up under Recent.
  $.clock.after(20000, () => void refresh($))
}

// Light glyph and color for a status: ok / warn / bad / off.
type Level = 'ok' | 'warn' | 'bad' | 'off'
const COLOR = { ok: 'success', warn: 'warning', bad: 'error', off: 'inactive' } as const

function inventoryLevel(t: PanelTenant): Level {
  if (t.InventoryLight === '✓') return 'ok'
  if (t.InventoryLight === '⚠' || t.InventoryLight === '…') return 'warn'
  if (t.InventoryLight === '✗') return 'bad'
  return 'off'
}

function certLevel(days: number | null): Level {
  if (days === null) return 'off'
  if (days < 0) return 'bad'
  return days <= 30 ? 'warn' : 'ok'
}

async function setEnabled($: Engine, value: boolean) {
  await update($, enabledAtom, () => value)
  await $.store.set(STORE_ENABLED, value)
}

// The background read, only while switched on.
async function refreshIfOn($: Engine) {
  if (await read($, enabledAtom)) await refresh($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, versionAtom, () => VERSION)
    await update($, optionsAtom, () => [])
    const saved = await $.store.get(STORE_ENABLED).catch(() => undefined)
    const isOn = saved !== false
    await update($, enabledAtom, () => isOn)
    await $.command.register({
      name: 'dragon',
      description: 'Open the Azure Dragon control panel',
      argumentHint: 'on | off | version',
    })
    if (isOn) {
      void $.ui.open({ id: PANE, title: 'Azure Dragon' })
      void refresh($)
    }
    $.clock.every(REFRESH_MS, () => void refreshIfOn($))

    return next(e)
  })

  on('command.run', { command: 'dragon' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'version') return { text: `Dragon Panel version ${VERSION}` }
    if (arg === 'on' || arg === 'off') {
      await setEnabled($, arg === 'on')
      return {
        text:
          arg === 'on'
            ? 'Dragon Panel is on: it opens in each new chat and reads every 15 minutes.'
            : "Dragon Panel is off: it won't open by itself or read in the background. /dragon still opens it.",
      }
    }
    await $.ui.open({ id: PANE, title: 'Azure Dragon' })
    void refresh($)

    return { text: 'Azure Dragon panel opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const { data, error, isLoading } = await read($, view)
    const ui = await read($, list)
    const setUi = (fn: (u: ServerListUi) => ServerListUi) => void update($, list, fn)

    const light = (level: Level, label: string) => (
      <Text>
        <Text color={COLOR[level]}>●</Text> {label}
      </Text>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Text weight="bold">Azure Dragon</Text>
          <Text dimColor>
            {isLoading ? 'reading…' : data ? `updated ${data.GeneratedAt}` : 'no data yet'}
          </Text>
          <Button key="refresh" dimColor onPress={() => void refresh($)}>
            Refresh
          </Button>
        </Box>

        {error && <Text color="error">Couldn't read the panel data: {error}</Text>}

        {data?.Tenants.map(t => {
          const drift = data.Drift.find(d => d.Tenant === t.Alias)
          if (!t.InScope) {
            return (
              <Box key={`tenant-${t.Alias}`} flexDirection="row" gap={1}>
                <Text dimColor>
                  {t.Alias} · {t.Name} · out of scope (production)
                </Text>
              </Box>
            )
          }
          return (
            <Box key={`tenant-${t.Alias}`} flexDirection="column" borderStyle="round" paddingX={1}>
              <Text weight="semibold">
                {t.Alias} · {t.Name}
              </Text>
              <Box flexDirection="row" gap={2} flexWrap="wrap">
                {light(inventoryLevel(t), `Inventory ${t.LastRun ?? 'never'}`)}
                {light(t.SignedIn ? 'ok' : 'off', 'Signed in')}
                {light(t.GraphMcp ? 'ok' : 'off', 'Graph MCP')}
                {t.CertDays !== null && light(certLevel(t.CertDays), `Cert ${t.CertDays} days`)}
              </Box>
              {t.Problem && <Text color="error">{t.Problem}</Text>}
              {drift && (
                <Text>
                  Drift: <Text weight="bold">{drift.Ours}</Text> ours
                  <Text dimColor>
                    {' '}
                    · {drift.NetworkDept} network dept · {drift.Naming} legacy names
                  </Text>
                </Text>
              )}
              <Button
                key={`update-${t.Alias}`}
                dimColor
                onPress={() =>
                  void $.prompt.fill({
                    text: `Refresh the ${t.Alias} inventory (Update-NtsInventory ${t.Alias}).`,
                  })
                }
              >
                Update inventory…
              </Button>
            </Box>
          )
        })}

        {data && data.Vms.length > 0 && (
          <Box flexDirection="column" gap={1}>
            <Text weight="semibold">Servers</Text>

            {/* Search across every tenant, and the running-only switch. */}
            <Box flexDirection="row" gap={1} alignItems="center">
              <Box flexGrow={1}>
                <Input
                  key="search"
                  placeholder="Search servers (sql, dc-0, AA-)"
                  value={ui.search}
                  submitLabel="search"
                  onInput={value => setUi(u => ({ ...u, search: value }))}
                  onSubmit={value => setUi(u => ({ ...u, search: value }))}
                />
              </Box>
              <Button key="running-only" dimColor={!ui.runningOnly} onPress={() => setUi(u => ({ ...u, runningOnly: !u.runningOnly }))}>
                {ui.runningOnly ? '☑ Running only' : '☐ Running only'}
              </Button>
              {ui.search && (
                <Button key="clear-search" dimColor onPress={() => setUi(u => ({ ...u, search: '' }))}>
                  Clear
                </Button>
              )}
            </Box>

            {/* One folding section per in-scope tenant. */}
            {data.Tenants.filter(t => t.InScope).map(t => {
              const all = data.Vms.filter(v => v.Tenant === t.Alias)
              if (all.length === 0) return null
              const running = all.filter(v => v.PowerState === 'running').length
              const shown = serversFor(data.Vms, t.Alias, ui)
              const isOpen = Boolean(ui.search) || !ui.closed[t.Alias]
              const caption =
                shown.mode === 'search'
                  ? `${shown.vms.length} matches`
                  : shown.mode === 'all'
                    ? `All ${shown.vms.length}, A to Z`
                    : shown.vms.length
                      ? 'Recent'
                      : 'No recent connections yet. Use Show all.'
              return (
                <Box key={`servers-${t.Alias}`} flexDirection="column" borderStyle="round" paddingX={1}>
                  <Box flexDirection="row" gap={1} alignItems="center">
                    <Button
                      key={`fold-${t.Alias}`}
                      plain
                      onPress={() => setUi(u => ({ ...u, closed: { ...u.closed, [t.Alias]: !u.closed[t.Alias] } }))}
                    >
                      {isOpen ? '▾' : '▸'} {t.Alias} <Text dimColor>{t.Name}</Text>
                    </Button>
                    <Box flexGrow={1} />
                    <Text dimColor>
                      {running}/{all.length} running
                    </Text>
                    {!ui.search && (
                      <Button
                        key={`showall-${t.Alias}`}
                        dimColor
                        onPress={() =>
                          setUi(u => ({
                            ...u,
                            showAll: { ...u.showAll, [t.Alias]: !u.showAll[t.Alias] },
                            closed: { ...u.closed, [t.Alias]: false },
                          }))
                        }
                      >
                        {ui.showAll[t.Alias] ? 'Show recent' : `Show all ${all.length}`}
                      </Button>
                    )}
                  </Box>
                  {isOpen && (
                    <Box flexDirection="column">
                      <Text dimColor>{caption}</Text>
                      {/* Four chips per row; each chip is the Connect button. */}
                      <Box flexDirection="row" flexWrap="wrap">
                        {shown.vms.map(v => (
                          <Box key={`chip-${v.Tenant}-${v.Name}`} width="25%" paddingRight={1} flexDirection="row" gap={1} alignItems="center">
                            {/* The power dot sits beside the button, not in it: the desktop draws a
                                native button in its own colors, which hid the green. */}
                            <Text color={v.PowerState === 'running' ? 'success' : 'inactive'}>
                              {v.PowerState === 'running' ? '●' : '○'}
                            </Text>
                            <Button key={`connect-${v.Tenant}-${v.Name}`} onPress={() => void connect($, v.Tenant, v.Name)}>
                              {v.Name}
                              {shown.mode === 'recent' && v.Ago ? <Text dimColor> {v.Ago}</Text> : ''}
                            </Button>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        )}

        {data && (
          <Box flexDirection="row" gap={1}>
            {light(
              data.Backup.Ok === null ? 'off' : data.Backup.Ok ? 'ok' : 'bad',
              `Backup ${data.Backup.LastRun ?? 'never'}`,
            )}
          </Box>
        )}
      </Box>
    )
  })
}
