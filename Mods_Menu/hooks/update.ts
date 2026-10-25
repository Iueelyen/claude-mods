// Pure helpers for the Update button: what the repository offers, what this
// computer has loaded, and the prompt that brings one in line with the other.

export const REPO = 'Iueelyen/claude-mods'
export const MARKETPLACE = 'claude-mods'
const RAW = `https://raw.githubusercontent.com/${REPO}/main`

export const MARKETPLACE_URL = `${RAW}/.claude-plugin/marketplace.json`

export const NEW_CHAT_ALERT = '⚠ Updates installed. Open a new chat to see the changes; this chat still has the old versions.'

export const READY_TOAST = 'Update ready in your prompt box. Press Send, then open a new chat to see the changes.'

/** Each mod the marketplace lists, with the folder its files are in. */
export function parseMarketplace(text: string): Array<{ name: string; folder: string }> {
  let data: { plugins?: Array<{ name?: unknown; source?: unknown }> }
  try {
    data = JSON.parse(text) as typeof data
  } catch {
    return []
  }
  return (data.plugins ?? [])
    .filter(p => typeof p.name === 'string' && typeof p.source === 'string')
    .map(p => ({ name: String(p.name), folder: String(p.source).replace(/^\.\//, '').replace(/\/+$/, '') }))
}

export function pluginJsonUrl(folder: string): string {
  return `${RAW}/${folder}/.claude-plugin/plugin.json`
}

export function parseVersion(text: string): string | undefined {
  try {
    const v = (JSON.parse(text) as { version?: unknown }).version
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
  } catch {
    return undefined
  }
}

/** -1, 0 or 1, comparing dotted version numbers part by part (0.3.10 is newer than 0.3.9). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

export type RepoMod = { name: string; version: string | undefined }

/**
 * What to do on this computer. `local` holds the version each mod the menu knows
 * has loaded in this chat (undefined: not installed); a repository mod the menu
 * doesn't know yet is `unknown`: install it, or update it if it's there already.
 */
export type UpdatePlan = {
  missing: RepoMod[]
  outdated: Array<{ name: string; from: string; to: string }>
  unknown: RepoMod[]
  current: RepoMod[]
}

export function planUpdate(repo: RepoMod[], local: Map<string, string | undefined>): UpdatePlan {
  const plan: UpdatePlan = { missing: [], outdated: [], unknown: [], current: [] }
  for (const mod of repo) {
    if (!local.has(mod.name)) {
      plan.unknown.push(mod)
      continue
    }
    const have = local.get(mod.name)
    if (have === undefined) plan.missing.push(mod)
    else if (mod.version !== undefined && compareVersions(have, mod.version) < 0) {
      plan.outdated.push({ name: mod.name, from: have, to: mod.version })
    } else plan.current.push(mod)
  }
  return plan
}

export function isUpToDate(plan: UpdatePlan): boolean {
  return plan.missing.length === 0 && plan.outdated.length === 0 && plan.unknown.length === 0
}

const FIND_CLAUDE =
  "Find the Claude Code command-line program. If `claude` isn't on the PATH, use the newest claude.exe in the Claude app's data folders under %LOCALAPPDATA%."
const REFRESH = `Refresh the marketplace: claude plugin marketplace update ${MARKETPLACE}\n   (If it says ${MARKETPLACE} doesn't exist, run: claude plugin marketplace add ${REPO} --scope user)`
const FAILS = 'If anything fails, show me the exact error and explain it in plain English.'
const withVersion = (m: RepoMod) => (m.version ? `${m.name} ${m.version}` : m.name)

/** The prompt that brings this computer in line with the repository. */
export function updatePrompt(plan: UpdatePlan, repo: RepoMod[]): string {
  const steps: string[] = [FIND_CLAUDE, REFRESH]
  if (plan.missing.length > 0) {
    steps.push(
      `Install these mods (not on this computer yet), each with: claude plugin install <mod>@${MARKETPLACE} --scope user\n   ${plan.missing.map(withVersion).join(', ')}`,
    )
  }
  if (plan.outdated.length > 0) {
    steps.push(
      `Update these mods, each with: claude plugin update <mod>@${MARKETPLACE} --scope user\n   ${plan.outdated.map(o => `${o.name} ${o.from} -> ${o.to}`).join(', ')}`,
    )
  }
  if (plan.unknown.length > 0) {
    steps.push(
      `For these mods, install each one if it isn't installed (claude plugin install <mod>@${MARKETPLACE} --scope user), or update it if it is (claude plugin update <mod>@${MARKETPLACE} --scope user):\n   ${plan.unknown.map(withVersion).join(', ')}`,
    )
  }
  steps.push(
    `Run claude plugin list and show me each mod's version. They should be: ${repo.map(withVersion).join(', ')}, all enabled.`,
    `Finish with this alert on its own line: "${NEW_CHAT_ALERT}"`,
  )
  return [
    `Update my Claude Code mods from my ${MARKETPLACE} marketplace (GitHub: ${REPO}) for my user. Before you change anything, tell me what you'll run and wait for my yes.`,
    '',
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    FAILS,
  ].join('\n')
}

/** When GitHub can't be read from here: ask Claude to check and update everything itself. */
export function fallbackPrompt(): string {
  return [
    `Update all my Claude Code mods from my ${MARKETPLACE} marketplace (GitHub: ${REPO}) for my user. Before you change anything, tell me what you'll run and wait for my yes.`,
    '',
    `1. ${FIND_CLAUDE}`,
    `2. ${REFRESH}`,
    `3. For every mod the ${MARKETPLACE} marketplace lists: install it if it isn't installed, or update it if it is, with --scope user.`,
    "4. Run claude plugin list and show me each mod's version.",
    `5. Finish with this alert on its own line: "${NEW_CHAT_ALERT}"`,
    '',
    FAILS,
  ].join('\n')
}
