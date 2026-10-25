# Changelog

Every change to a mod raises its version (in its `.claude-plugin/plugin.json` and the `VERSION` line in its code) and adds a line here. Newest first.

To see which version a PC is running: open `/mods` (the version shows next to each mod's name), or type `/simple version`, `/better version`, `/meter version`, `/reflect version`, `/team version` or `/mods version`.

## Clean View (`clean-view`)

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

### 0.1.0 (2026-10-24)
- First release, written fresh: when you correct Claude in a lasting way, offers to save it as a rule in this project's CLAUDE.md, your all-projects CLAUDE.md, or a skill. Won't save the same rule twice. `/reflect on|off`, `/reflect version`, listed in `/mods` with its version.
- Options (in `/mods` or `/reflect set`): suggest first, show skill buttons.

## Team Tracker (`team-tracker`)

### 0.1.0 (2026-10-24)
- First release, written fresh: `/team` opens a Team pane with the job's steps (Clean View's when it runs a plan), every helper Claude sends off with its time, model, tokens and rough cost at October 2026 API prices, and a whole-job total. Status line while helpers run. `/team on|off`, `/team version`, listed in `/mods` with its version.
- Options (in `/mods` or `/team set`): open by itself, show costs, status line.

## Mods menu (`mod-menu`)

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
