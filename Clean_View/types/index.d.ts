export type CleanViewStatus = 'done' | 'active' | 'upcoming'

export type CleanViewTask = {
  id: string
  name: string
  status: CleanViewStatus
  percent: number
  hasReported: boolean
}

export type CleanViewPhase =
  | 'idle'
  | 'working'
  | 'needs-you'
  | 'stuck'
  | 'stopped'
  | 'done'

export type CleanViewChecklist = {
  title: string
  phase: CleanViewPhase
  tasks: CleanViewTask[]
  needsYouReason: string | null
  stuckReason: string | null
  startedAt: number | null
  finishedAt: number | null
  isCollapsed: boolean
}

export type CleanViewSettings = {
  /** Hold Claude's tools until it has made a plan. */
  planFirst: boolean
  /** Hide tool calls, results and progress hints. */
  hideRows: boolean
  /** Ask Haiku for a short job name. */
  nameJobs: boolean
  /** Seconds before "All done" shrinks to one line, or never. */
  collapseAfter: '5' | '15' | 'never'
}

/**
 * One option as a control panel draws it. Changed by running
 * `/simple set <key> <value>` (a toggle's value is `on` or `off`).
 */
export type CleanViewOption = {
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
    'clean-view': {
      cleanViewEnabled: boolean
      checklist: CleanViewChecklist
      tick: number
      settings: CleanViewSettings
      options: CleanViewOption[]
    }
  }
}
