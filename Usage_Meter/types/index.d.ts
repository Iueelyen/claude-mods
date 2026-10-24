export type UsageMeterSettings = {
  /** Mark each window green, amber past 70% and red past 90%. */
  colours: boolean
  /** Show a toast once when a window passes 90%. */
  warn: boolean
}

/** One window as the meter last saw it. */
export type UsageMeterWindow = {
  percentUsed: number
  /** ISO 8601, when the engine reported one. */
  resetsAt?: string
}

export type UsageMeterReading = {
  fiveHour: UsageMeterWindow | null
  weekly: UsageMeterWindow | null
}

/**
 * One option as a control panel draws it. Changed by running
 * `/meter set <key> <value>` (a toggle's value is `on` or `off`).
 */
export type UsageMeterOption = {
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
    'usage-meter': {
      isEnabled: boolean
      settings: UsageMeterSettings
      options: UsageMeterOption[]
      reading: UsageMeterReading
    }
  }
}
