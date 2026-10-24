/** The mod selected in the menu's left column, or null for the first one. */
export type ModMenuSelected = string | null

declare module 'claude-code' {
  interface PluginState {
    'mod-menu': {
      selected: ModMenuSelected
    }
  }
}
