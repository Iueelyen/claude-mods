# Prompt Upgrade

A Claude Code mod that turns a rough prompt into a great one before it is sent. It opens a pane, asks up to three quick multiple-choice questions, rewrites the prompt, and shows your original and the upgrade side by side. Nothing is sent until you press **Run it**.

## Commands

- `/better <your rough prompt>`: upgrade that prompt.
- `/better`: open a box to type one.
- `/better on` / `/better off`: automatic mode. While it's on, a prompt you type goes to the pane first. It starts off.
- `/better history`: your last 20 upgrades. Click one to reopen its review.
- `/better disable` / `/better enable`: switch the whole mod off or on (also in the `/mods` menu). While it's off, nothing is intercepted and `/better` only says how to turn it back on.

While automatic mode is on, these still go straight to Claude: slash commands, prompts with files or images attached, messages sent while Claude is working, short replies like "yes" or "keep going", and anything starting with `>` (the `>` is removed before sending).

## Options

Change these in the `/mods` menu, or type them:

| Option | Command | Default |
|---|---|---|
| Automatic mode | `/better set auto on\|off` (same as `/better on\|off`) | off |
| Questions to ask | `/better set questions 0\|1\|2\|3` (0 goes straight to the rewrite) | 3 |
| Rewrite model | `/better set model haiku\|sonnet\|opus` (Opus uses the most usage) | sonnet |
| After the last answer | `/better set continue auto\|wait` | auto |
| History | `/better set history clear` | |

Options are remembered after a restart, per computer, and can be changed while the mod is off.

## The four steps

Your prompt, Questions, Rewrite, Review. Questions come from a fast model (Haiku); the rewrite from the model the Rewrite model option names (Sonnet by default). Cancel, or closing the pane, puts your original words back in the prompt box. If a model call fails, your prompt is safe: Try again, Send my original, or Cancel.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-upgrade --marketplace Iueelyen/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope. From a shell:

```
claude plugin install prompt-upgrade --marketplace Iueelyen/claude-mods
```

In the Claude desktop app: click + next to the prompt box, then Plugins, Add marketplace with `Iueelyen/claude-mods`, then add the plugin.

## Files

- `hooks/register.tsx`: entry point
- `hooks/prompt-upgrade.tsx`: the pane, commands and intercept
- `hooks/logic.ts`: pure helpers (which prompts are intercepted, reading the model's replies, layout)
- `types/index.d.ts`: shared state (`prompt-upgrade.flow`, `autoMode`, `history`)
- `tests/prompt-upgrade.test.tsx`: run with `claude plugin test <this folder>`
