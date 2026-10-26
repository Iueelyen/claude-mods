# Progress

> What this file is for: the running record of where this project stands. Claude reads it at the start
> of work and updates it at the end of each session (/wrapup), and /todo builds the to-do list from it.
> Keep it current; keep finished history short.

## Current state
The `claude-mods` marketplace on GitHub (`Iueelyen/claude-mods`, public), kept in OneDrive and installed at user scope on the main PC. Eight mods, all passing validate and their tests:

| Mod | Version | What it does |
|---|---|---|
| Clean View | 0.1.3 | Plain checklist above the prompt, hides technical rows |
| Prompt Upgrade | 0.1.1 | `/better`: questions, rewrite, side-by-side review |
| Usage Meter | 0.1.1 | 5-hour and weekly usage bars |
| Reflect | 0.1.2 | Offers to save lasting corrections as rules |
| Team Tracker | 0.1.0 | `/team` pane: steps, helpers, time, rough cost |
| My Commands | 0.1.1 | `/wrapup`, `/todo`, `/mycommands` |
| Dragon Panel | 0.2.1 | `/dragon`: Azure Dragon control panel (only on PCs with that repo) |
| Mods menu | 0.4.1 | `/mods`: two-column control panel with switches, options and an Update button |

## Completed
- 2026-10-26: Fixed the Clean View progress checklist not showing while Claude worked (0.1.3) and the same problem in Reflect's Save bar (0.1.2); tests now include Claude Code's band placeholder. Chris confirmed the checklist is back in a new chat on the main PC.
- 2026-10-25: Dragon Panel moved in from the Azure Dragon project with an anonymous test, then given a version, an on/off switch and a `/mods` row (0.2.1); Mods menu 0.4.1.
- 2026-10-25: Mods menu Update button (0.4.0): compares GitHub with this chat and fills in an update prompt, unsent.
- 2026-10-24: My Commands (`/wrapup`, general `/todo` with a compact layout); Team Tracker; Reflect; versions shown in `/mods`; CHANGELOG; install guide; Usage Meter added.
- 2026-10-24: Clean View, Prompt Upgrade, Mods menu (two-column, desktop-safe colours); repository published on GitHub.

## In progress / unfinished
- The Dev machine still needs a manual update (old prompt) to reach Mods menu 0.4.1; after that it can use the Update button.
- The old `mods\dragon-panel` folder in the Azure Dragon project is to be removed in that project's own chat (the copy here is the one that loads now).

## Known bugs
- Command output labels show two mods (for example "mod-menu+my-commands") because My Commands checks every command typed; cosmetic only.
- Prompt Upgrade's pane loses its button colours on the desktop app (colour inside Buttons); Chris chose to leave it for now.
- Right after a push, GitHub's raw files can lag a few minutes, so the Update button may briefly see old versions.
- The Update button compares with the versions loaded in the current chat, so it offers the same update again until a new chat is opened (harmless).

## Next steps
1. Update the Dev machine (Mods menu 0.4.1, Clean View 0.1.3, Reflect 0.1.2, Dragon Panel only if it has the Azure Dragon repo), then use the Update button there; polish, S.
2. Tidy the "mod-menu+my-commands" label (My Commands 0.1.2); polish, S.
3. Desktop button-colour fix for Prompt Upgrade's pane; fix, M (Chris to decide).
4. Add a README to Dragon_Panel like the other mods; polish, S.
5. Try `/todo` and `/wrapup` in a real project and adjust their output; polish, S.

## Decisions
- One folder per mod; every mod has a version, an on/off switch and a `/mods` row; the Mods menu keeps no settings of its own.
- New mods ideas from other people are rewritten fresh, never copied without a licence.
- Dragon Panel keeps calling the Azure Dragon module by its full path (`C:\_Repos\Azure_Dragon`); it's optional on PCs without that repo.
- Prompt Upgrade's automatic mode starts off; Clean View starts on.
- Updates are filled into the prompt box for Chris to send, never sent automatically.
