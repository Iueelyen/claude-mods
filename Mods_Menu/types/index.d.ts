/** The mod selected in the menu's left column, or null for the first one. */
export type ModMenuSelected = string | null

/** A one-line message under the menu's heading (the Update button's result), or null. */
export type ModMenuNote = string | null

declare module 'claude-code' {
  interface PluginState {
    'mod-menu': {
      selected: ModMenuSelected
      note: ModMenuNote
    }
  }
}
