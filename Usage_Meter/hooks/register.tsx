import type { Register } from 'claude-code'

import { registerUsageMeter } from './usage-meter'

export const register: Register = on => {
  registerUsageMeter(on)
}
