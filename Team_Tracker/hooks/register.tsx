import type { Register } from 'claude-code'

import { registerTeamTracker } from './team-tracker'

export const register: Register = on => {
  registerTeamTracker(on)
}
