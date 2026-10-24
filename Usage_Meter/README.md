# Usage Meter

A Claude Code mod that shows how much of your plan's usage limits you've used, as one line under the prompt:

```
5h 🟢 ▰▰▰▱▱▱▱▱ 42% ↻3:15pm  ·  week 🟢 ▰▱▱▱▱▱▱▱ 18%
```

- **5h**: how much of your 5-hour limit you've used, and the time it resets.
- **week**: how much of your weekly limit you've used.

The numbers come from Claude itself and update after each reply. Before the first reply of a session the line says it's waiting. The limits only exist on a Claude subscription; with an API key there is nothing to show.

## Turning it on and off

- Switch it in the `/mods` menu, or
- type `/meter on`, `/meter off`, or just `/meter` to flip it.

Your choice is remembered after a restart.

## Options

Change these in the `/mods` menu, or type them:

| Option | Command | Default |
|---|---|---|
| Warning colours (green, amber past 70%, red past 90%) | `/meter set colours on\|off` | on |
| Pop-up when the 5-hour or weekly use passes 90% | `/meter set warn on\|off` | on |

## Install

```
claude plugin install usage-meter --marketplace Iueelyen/claude-mods
```

Then start a new session.
