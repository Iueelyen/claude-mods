# Changelog

Every change to a mod raises its version (in its `.claude-plugin/plugin.json` and the `VERSION` line in its code) and adds a line here. Newest first.

To see which version a PC is running: open `/mods` (the version shows next to each mod's name), or type `/simple version`, `/better version`, `/meter version`, `/reflect version`, `/team version`, `/mycommands version`, `/dragon version` or `/mods version`.

## Clean View (`clean-view`)

### 0.1.3 (2026-10-26)
- Fix: the progress checklist stopped showing while Claude worked (since 0.1.2). The band put Claude Code's own placeholder inside its fixed-width box, which Claude Code refuses, so nothing drew. What's beneath now goes after the checklist, outside that box.

### 0.1.2 (2026-10-24)
- Other mods' bands above the prompt (such as Reflect's offer) now show under the checklist instead of being hidden.

### 0.1.1 (2026-10-24)
- Reports its version to the Mods menu; `/simple version` shows it.

### 0.1.0 (2026-10-24)
- First release: hides tool rows while Claude works and shows a plain checklist above the prompt, with an on/off button and `/simple on|off`.
- Options (in `/mods` or `/simple set`): hide technical rows, plan first, name jobs with Haiku, shrink after done.

## Prompt Upgrade (`prompt-upgrade`)

### 0.1.1 (2026-10-24)
- Reports its version to the Mods menu; `/better version` shows it.

### 0.1.0 (2026-10-24)
- First release: `/better` asks a few quick questions, rewrites the prompt and shows both side by side; nothing is sent until Run it. Automatic mode, history of the last 20 upgrades, `/better enable|disable`.
- Options (in `/mods` or `/better set`): automatic mode, questions to ask, rewrite model, after the last answer, clear history.

## Usage Meter (`usage-meter`)

### 0.1.1 (2026-10-24)
- Reports its version to the Mods menu; `/meter version` shows it.

### 0.1.0 (2026-10-24)
- First release: 5-hour and weekly usage bars under the prompt, with the 5-hour reset time; `/meter on|off`.
- Options (in `/mods` or `/meter set`): warning colours, pop-up near the limit.

## Reflect (`reflect`)

### 0.1.2 (2026-10-26)
- Fix: the "Save as a rule?" bar had the same fixed-width-box problem as Clean View 0.1.2 and could fail to show. What's beneath now goes after the bar.

### 0.1.1 (2026-10-24)
- Ignores the instructions My Commands sends (they're full of "never" and "do not" but are never a correction), so no Haiku check is spent on them.

### 0.1.0 (2026-10-24)
- First release, written fresh: when you correct Claude in a lasting way, offers to save it as a rule in this project's CLAUDE.md, your all-projects CLAUDE.md, or a skill. Won't save the same rule twice. `/reflect on|off`, `/reflect version`, listed in `/mods` with its version.
- Options (in `/mods` or `/reflect set`): suggest first, show skill buttons.

## Team Tracker (`team-tracker`)

### 0.1.0 (2026-10-24)
- First release, written fresh: `/team` opens a Team pane with the job's steps (Clean View's when it runs a plan), every helper Claude sends off with its time, model, tokens and rough cost at October 2026 API prices, and a whole-job total. Status line while helpers run. `/team on|off`, `/team version`, listed in `/mods` with its version.
- Options (in `/mods` or `/team set`): open by itself, show costs, status line.

## My Commands (`my-commands`)

### 0.1.1 (2026-10-24)
- `/todo` has a compact new layout: a summary line (items left by kind, estimated work), one ordered table with milestone, kind and a coloured effort bar (🟩 S, 🟨 M, 🟧 M-L, 🟥 L, ⬜ ?), then one line each for the next sprint and the sprints after it. No icons, no legend.

### 0.1.0 (2026-10-24)
- First release: your own slash commands in every chat, one instructions file each in `library/`. `/wrapup` (CLAUDE.md rules, PROGRESS.md created or updated, README if needed, commit if there's a git repository or a plain note if not, "Safe to /clear") and a general `/todo [focus]` (colour-coded tables per milestone, next sprint; creates PROGRESS.md if missing). `/mycommands list|on|off|version`, listed in `/mods` with its version and commands.

## Dragon Panel (`dragon-panel`)

### 0.2.1 (2026-10-25)
- Reports its version to the Mods menu (`/dragon version`), and gets an on/off switch (`/dragon on|off`, also in `/mods`). Off: it no longer opens by itself or reads in the background; `/dragon` still opens it. On is the default; the panel works exactly as before.

### 0.2.0 (2026-10-25)
- Moved into this repository from the Azure Dragon project, with its types and test (the test uses made-up tenants, servers and numbers). Calls the Azure Dragon PowerShell module by its full path, so it only works on a PC with that repo.

## Mods menu (`mod-menu`)

### 0.4.1 (2026-10-25)
- Lists Dragon Panel with its version and switch, so the Update button tracks it like the others.

### 0.4.0 (2026-10-24)
- An **Update** button: compares GitHub with the versions loaded in this chat and puts an update prompt (what to install, what to update, the versions to expect) in the prompt box, unsent. A notice and the prompt's last line both say to open a new chat to see the changes. Says so when everything is current; falls back to a check-everything prompt when GitHub can't be reached.

### 0.3.4 (2026-10-24)
- My Commands' settings now list each command with what it does (a COMMANDS section, long descriptions wrapped).

### 0.3.3 (2026-10-24)
- Lists My Commands, with its version and the commands it holds.

### 0.3.2 (2026-10-24)
- Lists Team Tracker, with its switch, options and version.

### 0.3.1 (2026-10-24)
- Lists Reflect, with its switch, options and version.

### 0.3.0 (2026-10-24)
- Shows each mod's version next to its name; `/mods version` shows the menu's own.

### 0.2.1 (2026-10-24)
- Lists Usage Meter.

### 0.2.0 (2026-10-24)
- Two-column control panel: mods on the left, the selected mod's switch and grouped settings on the right.
- The selected choice is a gold box with dark text, readable on the desktop app.

### 0.1.0 (2026-10-24)
- First release: `/mods` lists each mod with an on/off switch.
