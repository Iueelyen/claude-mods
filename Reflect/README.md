# Reflect

Turns your lasting corrections into rules Claude keeps.

When you tell Claude something like "never use em dashes" or "always run the tests before you say it works", a bar appears above the prompt:

**Save as a rule?** "Never use em dashes"  [ All projects ] [ This project ] [ Skill: writing ] [ No thanks ]

- **This project**: adds it to `CLAUDE.md` in your project folder.
- **All projects**: adds it to `CLAUDE.md` in your Claude folder (`~/.claude`), which every session reads.
- **Skill: name**: adds it to that skill's `SKILL.md` (one button per skill you have).
- **No thanks**: nothing is saved.

Rules go under a "Rules saved by Reflect" heading, each with the date. Reflect makes the file or heading if it's missing, never changes anything else in the file, and won't save the same rule twice.

**Cost:** a free word check runs on each message you type. Only a message that sounds like a lasting correction gets one small Haiku call to decide whether it's a rule. Messages starting with `>` and slash commands are skipped.

## Commands

- `/reflect`: turn it on or off (`/reflect on`, `/reflect off`)
- `/reflect version`: show the version
- `/reflect set <option> <value>`: change an option (also in `/mods`)

## Options

| Option | Command | Default |
|---|---|---|
| Suggest first (which button is highlighted) | `/reflect set suggest auto\|project\|everywhere` | auto |
| Show skill buttons | `/reflect set skills on\|off` | on |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install reflect --marketplace Iueelyen/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope. From a shell:

```
claude plugin install reflect --marketplace Iueelyen/claude-mods
```

In the Claude desktop app: click + next to the prompt box, then Plugins, Add marketplace with `Iueelyen/claude-mods`, then add the plugin.

## Files

- `hooks/register.tsx`: entry point
- `hooks/reflect.tsx`: the check, the bar above the prompt, saving, `/reflect`
- `hooks/logic.ts`: pure helpers (which messages are checked, reading the model's reply, adding a rule to a file)
- `types/index.d.ts`: shared state (`reflect.version`, `isEnabled`, `options`, `offer`) the Mods menu reads
- `tests/reflect.test.tsx`: run with `claude plugin test <this folder>`

Written fresh for this repository; the idea comes from Christian Peverelli's Reflect mod (WeAreNoCode).
