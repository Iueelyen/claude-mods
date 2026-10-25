import type { Register } from 'claude-code'

import { registerReflect } from './reflect'

export const register: Register = on => {
  registerReflect(on)
}
