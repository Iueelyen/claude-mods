/** One command in the library, as the Mods menu lists it. */
export type MyCommand = {
  /** What you type after the slash. */
  name: string
  description: string
  argumentHint?: string
}

/**
 * One option as a control panel draws it. My Commands has none yet; the list
 * is published so the Mods menu reads every mod the same way.
 */
export type MyCommandsOption = {
  key: string
  label: string
  kind: 'toggle' | 'choice' | 'action'
  value: string
  choices?: Array<{ value: string; label: string }>
  actionLabel?: string
  hint?: string
  group?: 'General' | 'Behavior' | 'Data'
}

declare module 'claude-code' {
  interface PluginState {
    'my-commands': {
      /** This mod's version, as its plugin.json states it. */
      version: string
      isEnabled: boolean
      /** The commands found in the library, in name order. */
      commands: MyCommand[]
      options: MyCommandsOption[]
    }
  }
}
