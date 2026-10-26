// What Get-NtsPanelData returns (as JSON), and what the panel keeps in $.state.
// Property names match the PowerShell objects exactly, so JSON.parse needs no mapping.

export type PanelTenant = {
  Alias: string
  Name: string
  InScope: boolean
  SignedIn: boolean
  InventoryLight: string | null // ✓ ⚠ ✗ - … from Get-NtsInventoryStatus
  LastRun: string | null
  Problem: string | null
  CertDays: number | null
  GraphMcp: boolean
}

export type PanelVm = {
  Tenant: string
  Name: string
  PowerState: string | null
  JoinType: string | null
  LastConnected: string | null // UTC, from Connect-NtsVm's local history
  Ago: string | null // "10 min", "yesterday", ...
}

export type PanelDrift = {
  Tenant: string
  Ours: number
  NetworkDept: number
  Naming: number
}

export type PanelData = {
  GeneratedAt: string
  Tenants: PanelTenant[]
  Vms: PanelVm[]
  Drift: PanelDrift[]
  Backup: { LastRun: string | null; Ok: boolean | null }
}

// The panel's state: the last data read, the last error, and whether a read is running.
export type PanelView = {
  data: PanelData | null
  error: string | null
  isLoading: boolean
}

// How the server list is shown: search text, the running-only switch, and per tenant
// whether it's folded closed and whether it shows all servers instead of recent ones.
export type ServerListUi = {
  search: string
  runningOnly: boolean
  closed: Record<string, boolean>
  showAll: Record<string, boolean>
}

declare module 'claude-code' {
  interface PluginState {
    'dragon-panel': { view: PanelView; list: ServerListUi }
  }
}
