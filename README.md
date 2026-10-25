# Claude Mods

Mods for [Claude Code](https://claude.com/claude-code) that make it calmer and friendlier to use:

| Mod | What it does | Commands |
|---|---|---|
| **Clean View** (`clean-view`) | While Claude works, hides tool calls, file changes and command output, and shows one plain checklist above the prompt. | `/simple`, `/simple set` |
| **Prompt Upgrade** (`prompt-upgrade`) | Turns a rough prompt into a great one: a few quick questions, a rewrite, and a side-by-side review. Nothing is sent until you press Run it. | `/better`, `/better history`, `/better set` |
| **Usage Meter** (`usage-meter`) | Shows your 5-hour and weekly plan usage as small bars under the prompt, with the time the 5-hour limit resets. | `/meter`, `/meter set` |
| **Reflect** (`reflect`) | When you correct Claude in a lasting way, offers to save it as a rule for this project, all your projects, or a skill. | `/reflect`, `/reflect set` |
| **Mods menu** (`mod-menu`) | A control panel: switch each mod on or off and change its options. | `/mods` |

## Install

Install once on each computer. After that, every new Claude Code session loads the mods by itself. For a step-by-step guide to setting up another PC, see [Install All Mods](Install%20All%20Mods.md).

**In a Claude Code terminal session**, type each line at the prompt, answer `y` to add the marketplace, then pick the user scope:

```
/plugin install clean-view --marketplace Iueelyen/claude-mods
/plugin install prompt-upgrade --marketplace Iueelyen/claude-mods
/plugin install usage-meter --marketplace Iueelyen/claude-mods
/plugin install reflect --marketplace Iueelyen/claude-mods
/plugin install mod-menu --marketplace Iueelyen/claude-mods
```

**From a shell:**

```
claude plugin install clean-view --marketplace Iueelyen/claude-mods
claude plugin install prompt-upgrade --marketplace Iueelyen/claude-mods
claude plugin install usage-meter --marketplace Iueelyen/claude-mods
claude plugin install reflect --marketplace Iueelyen/claude-mods
claude plugin install mod-menu --marketplace Iueelyen/claude-mods
```

**In the Claude desktop app** (Code tab): click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `Iueelyen/claude-mods`, then add each plugin.

To check: start a new session and type `/mods`.

## Updating

Claude Code reads the newest version from this repository. To get it right away, run `claude plugin update <mod>` and start a new session.

## Layout

- `.claude-plugin/marketplace.json`: the list of mods this repository offers
- `CHANGELOG.md`: each mod's versions and what changed
- `Clean_View/`, `Prompt_Upgrade/`, `Usage_Meter/`, `Reflect/`, `Mods_Menu/`: one folder per mod, each with its own README
- Each mod's tests run with `claude plugin test <mod folder>`

## License

MIT, see [LICENSE](LICENSE).
