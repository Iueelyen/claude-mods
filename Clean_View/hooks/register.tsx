import type { Register } from 'claude-code'

import { registerCleanView } from './clean-view'

// One entry point; more mods can be registered beside Clean View here later.
export const register: Register = on => {
  registerCleanView(on)
}
