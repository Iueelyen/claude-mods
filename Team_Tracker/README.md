# Team Tracker

A **Team** pane that shows what Claude is doing behind the scenes:

- **Steps**: a progress bar for the job ("3 of 5 done") and the step it's on now. When Clean View is running a plan, the steps are Clean View's, so the two always agree; otherwise they follow Claude's own to-do list.
- **Helpers**: every helper (subagent) Claude sends off, with a letter badge, what it's working on, whether it's running, done, stopped or failed, how long it has taken, which model it ran on, and its tokens with a rough cost.
- **Whole job**: how many helpers, the total rough cost and how long it all took.

While helpers work, the status line says how many are running and done. Type `/team` to open the pane; in a window wide enough for a side panel, it opens by itself when Claude sends off its first helper.

**Cost:** none. Team Tracker only watches and draws. The dollar figures are what the same work would cost at Anthropic's API list prices (October 2026); on a Claude plan your subscription covers it.

## Commands

- `/team`: open the Team pane
- `/team on`, `/team off`: switch it on or off
- `/team version`: show the version
- `/team set <option> <value>`: change an option (also in `/mods`)

## Options

| Option | Command | Default |
|---|---|---|
| Open by itself (in wide windows) | `/team set open on\|off` | on |
| Show costs | `/team set cost on\|off` | on |
| Status line | `/team set status on\|off` | on |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install team-tracker --marketplace Iueelyen/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope. From a shell:

```
claude plugin install team-tracker --marketplace Iueelyen/claude-mods
```

In the Claude desktop app: click + next to the prompt box, then Plugins, Add marketplace with `Iueelyen/claude-mods`, then add the plugin.

## Files

- `hooks/register.tsx`: entry point
- `hooks/team-tracker.tsx`: following helpers and steps, the pane, `/team`
- `hooks/logic.ts`: pure helpers (prices and cost, formatting, following the to-do tools)
- `types/index.d.ts`: shared state (`team-tracker.version`, `isEnabled`, `options`, `helpers`, `steps`) the Mods menu reads
- `tests/team-tracker.test.tsx`: run with `claude plugin test <this folder>`

Written fresh for this repository; the idea comes from Christian Peverelli's Team Tracker mod (WeAreNoCode).
