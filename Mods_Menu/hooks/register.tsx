import type { Register } from 'claude-code'

import { registerModMenu } from './mod-menu'

export const register: Register = on => {
  registerModMenu(on)
}
