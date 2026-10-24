# Clean View

A Claude Code mod that makes Claude feel calm and friendly for people who aren't technical. While Claude works, it hides the tool calls, file changes and command output, and shows one simple checklist above the prompt: the plan, the step happening now, and how far along it is.

```
Build my landing page · 1m 12s                     [ ● Clean View: ON ]
✓ Read your brand notes            ██████████  Done
▶ Build the pricing section        ██████░░░░  60%
○ Add the contact form             ░░░░░░░░░░  Next
○ Polish the footer                ░░░░░░░░░░  Up next
```

## Turning it on and off

- Click the **Clean View** button at the right of the band above the prompt, or
- type `/simple on`, `/simple off`, or just `/simple` to flip it.

Your choice is remembered after a restart. When it's off, everything Claude does is shown again.

Tip: press ctrl+o to see the full details of a hidden step at any time.

## Options

Change these in the `/mods` menu, or type them:

| Option | Command | Default |
|---|---|---|
| Plan first (hold tools until Claude makes a plan) | `/simple set plan on\|off` | on |
| Hide technical rows | `/simple set hide on\|off` | on |
| Name jobs with Haiku | `/simple set name on\|off` | on |
| Shrink after done | `/simple set collapse 5\|15\|never` | 5 |

Options are remembered after a restart, per computer.

## What it changes while it's on

- Asks Claude to plan every request in plain-English steps and report progress.
- Holds Claude's tools until it has made a plan (helper agents are never held).
- Hides tool rows. Permission prompts and Claude's written replies still show.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install clean-view --marketplace Iueelyen/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope. From a shell:

```
claude plugin install clean-view --marketplace Iueelyen/claude-mods
```

In the Claude desktop app: click + next to the prompt box, then Plugins, Add marketplace with `Iueelyen/claude-mods`, then add the plugin.

## Files

- `hooks/register.tsx`: entry point; calls `registerCleanView(on)`
- `hooks/clean-view.tsx`: the mod
- `types/index.d.ts`: shared state (`clean-view.cleanViewEnabled`, `checklist`, `tick`) other mods can read
- `tests/clean-view.test.tsx`: run with `claude plugin test <this folder>`
