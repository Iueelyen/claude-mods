export type TeamHelperStatus = 'running' | 'done' | 'stopped' | 'failed'

/** One helper (subagent) Claude sent off during the current job. */
export type TeamHelper = {
  /** The Agent call's tool_use_id, or the agent's id when only that is known. */
  id: string
  agentId?: string
  /** A, B, C... in the order the helpers started. */
  badge: string
  task: string
  model?: string
  status: TeamHelperStatus
  startedAt: number
  endedAt?: number
  tokens: number
  /** Rough cost at API list prices, in dollars. */
  usd: number
}

export type TeamStepStatus = 'pending' | 'in_progress' | 'completed'

export type TeamStep = { id: string; content: string; status: TeamStepStatus }

export type TeamTrackerSettings = {
  /** Open the pane by itself when a job's first helper starts, where panes dock beside the chat. */
  autoOpen: boolean
  showCost: boolean
  statusLine: boolean
}

/**
 * One option as a control panel draws it. Changed by running
 * `/team set <key> <value>` (a toggle's value is `on` or `off`).
 */
export type TeamTrackerOption = {
  key: string
  label: string
  kind: 'toggle' | 'choice' | 'action'
  value: string
  choices?: Array<{ value: string; label: string }>
  /** An action's button label. */
  actionLabel?: string
  hint?: string
  /** The heading a control panel files it under. */
  group?: 'General' | 'Behavior' | 'Data'
}

declare module 'claude-code' {
  interface PluginState {
    'team-tracker': {
      /** This mod's version, as its plugin.json states it. */
      version: string
      isEnabled: boolean
      settings: TeamTrackerSettings
      options: TeamTrackerOption[]
      helpers: TeamHelper[]
      steps: TeamStep[]
      /** The clock, in ms, moved each second while a helper runs. */
      tick: number
      /** True once the main loop starts a turn with no helper running: the next helper starts a new job. */
      isNewJob: boolean
    }
  }
}
