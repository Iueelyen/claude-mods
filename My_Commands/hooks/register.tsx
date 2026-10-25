import type { Register } from 'claude-code'

import { registerMyCommands } from './my-commands'

export const register: Register = on => {
  registerMyCommands(on)
}
