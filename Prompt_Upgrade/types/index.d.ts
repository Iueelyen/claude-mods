export type UpgradeQuestion = {
  question: string
  options: string[]
}

export type UpgradeAnswer = {
  /** The chosen option, or the person's own words from "Other". */
  value?: string
  isSkipped?: boolean
}

export type UpgradeStep =
  | 'compose'
  | 'reading'
  | 'questions'
  | 'rewrite'
  | 'review'
  | 'error'
  | 'history'

export type UpgradeFlow = {
  id: string
  step: UpgradeStep
  original: string
  questions: UpgradeQuestion[]
  answers: UpgradeAnswer[]
  /** Which question has its "Other" box open, if any. */
  otherOpen: number | null
  upgraded: string | null
  added: string[]
  isEditing: boolean
  /** The step whose model call failed, for Try again. */
  failedAt: 'reading' | 'rewrite' | null
  /** A quiet line shown in the pane (e.g. "Copied"), never a pop-up. */
  note: string | null
}

export type UpgradeRecord = {
  id: string
  at: number
  original: string
  upgraded: string
  added: string[]
}

export type UpgradeSettings = {
  /** The most questions to ask; 0 goes straight to the rewrite. */
  questions: '0' | '1' | '2' | '3'
  rewriteModel: 'haiku' | 'sonnet' | 'opus'
  /** Move on to the rewrite as soon as every question is answered or skipped. */
  autoContinue: boolean
}

/**
 * One option as a control panel draws it. Changed by running
 * `/better set <key> <value>` (a toggle's value is `on` or `off`).
 */
export type UpgradeOption = {
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
    'prompt-upgrade': {
      /** This mod's version, as its plugin.json states it. */
      version: string
      flow: UpgradeFlow | null
      /** The whole mod's switch: off, nothing is intercepted and /better only says how to turn it on. */
      isEnabled: boolean
      autoMode: boolean
      history: UpgradeRecord[]
      settings: UpgradeSettings
      options: UpgradeOption[]
    }
  }
}
