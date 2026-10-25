/** A file a rule can be saved to, and how the button names it. */
export type ReflectPlace =
  | { kind: 'project'; path: string }
  | { kind: 'everywhere'; path: string }
  | { kind: 'skill'; skill: string; path: string }

/** A rule waiting for the person to pick where it goes. */
export type ReflectOffer = {
  rule: string
  /** The suggested place first. */
  places: ReflectPlace[]
  /** When it was caught, in ms; an offer older than 30 minutes is dropped. */
  at: number
}

export type ReflectSettings = {
  /** Which button is highlighted: the model's guess, or always one place. */
  suggestFirst: 'auto' | 'project' | 'everywhere'
  /** Offer one button per skill. */
  showSkills: boolean
}

/**
 * One option as a control panel draws it. Changed by running
 * `/reflect set <key> <value>` (a toggle's value is `on` or `off`).
 */
export type ReflectOption = {
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
    reflect: {
      /** This mod's version, as its plugin.json states it. */
      version: string
      isEnabled: boolean
      settings: ReflectSettings
      options: ReflectOption[]
      offer: ReflectOffer | null
    }
  }
}
