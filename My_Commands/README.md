# My Commands

Your own slash commands, in every Claude Code chat on every computer where this mod is installed. Each command is one instructions file in the `library` folder: type `/name` and Claude follows that file, with anything you type after the name passed in.

## The commands

| Command | What it does |
|---|---|
| `/wrapup` | End-of-session wrap-up: adds new lasting rules to CLAUDE.md, brings PROGRESS.md up to date (creating it in a standard layout if missing), updates README.md if needed, then commits to git if the project is in a repository (and says so and skips it if not). Ends with "Safe to /clear". |
| `/todo [focus]` | Everything left to do on the project: a summary line (items left by kind, estimated work), one ordered table with milestone, kind and a coloured effort bar, then the next sprint and the ones after it. Read-only, except that it creates PROGRESS.md if the project has none. |

`/mycommands` lists them; `/mycommands on` / `off` switches them all; `/mycommands version` shows the version. My Commands is also in `/mods`.

## Adding a command

Add a file to `library/`, named the way you'll type it (`review.md` becomes `/review`: lowercase letters, digits and hyphens). Start it with:

```
---
description: One line saying what it does (shown in the / menu)
argument-hint: "[what to type after it]"
---

The instructions for Claude. Use $ARGUMENTS where what you type after the name should go.
```

Then raise the version in `.claude-plugin/plugin.json` and in `hooks/my-commands.tsx`, add a line to the changelog, commit and push. Each computer picks it up with `claude plugin update my-commands@claude-mods` and a new session.

A name Claude Code already uses for a built-in command is skipped; `/mycommands` shows which commands loaded.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install my-commands --marketplace Iueelyen/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope. From a shell:

```
claude plugin install my-commands --marketplace Iueelyen/claude-mods
```

In the Claude desktop app: click + next to the prompt box, then Plugins, Add marketplace with `Iueelyen/claude-mods`, then add the plugin.

## Files

- `library/*.md`: the commands
- `hooks/register.tsx`: entry point
- `hooks/my-commands.tsx`: reads the library, registers each command, runs it
- `hooks/library.ts`: pure helpers (file names, frontmatter, $ARGUMENTS)
- `types/index.d.ts`: shared state (`my-commands.version`, `isEnabled`, `commands`) the Mods menu reads
- `tests/my-commands.test.tsx`: run with `claude plugin test <this folder>`
