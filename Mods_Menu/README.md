# Mods menu

A control panel for your Claude Code mods. Type `/mods` to open it.

- **Left:** every mod, with ● on, ○ off or · not installed. Click one to select it (gold).
- **Right:** the selected mod's name and OFF/ON switch, what it does, and its settings grouped under General, Behavior and Data. Each setting is a row of choices with the current one in gold, or a button for an action such as Clear history. Its commands are listed at the bottom.
- **Top:** how many mods are installed and on, and an **Update** button. It reads this repository's mod list on GitHub (public files only; nothing is sent), compares it with the versions loaded in this chat, and puts a prompt in your prompt box to install what's missing and update what's out of date. It doesn't send it: you read it and press Send, then open a new chat to see the changes. If everything is current it says so; if GitHub can't be reached, the prompt asks Claude to check everything itself.
- **Versions:** each mod's version shows next to its name (`/mods version` shows the menu's own).

Under about 70 columns the panel stacks into one column. Esc closes it.

## How it works

The menu keeps no settings of its own. Each mod keeps its own switch and options and remembers them after a restart (per computer). The menu reads what each mod publishes and changes it by running that mod's own command:

| Mod | On / off | Options |
|---|---|---|
| Clean View | `/simple on` / `/simple off` | `/simple set <option> <value>` |
| Prompt Upgrade | `/better enable` / `/better disable` | `/better set <option> <value>` |

A mod that's off is still loaded but does nothing, so switching is instant; its options can still be changed. A mod that isn't installed on this computer shows "Not installed".

## Adding a new mod to the panel

1. In the new mod, publish an on/off value and an `options` list in its own `$.state`. Each option is `{ key, label, kind: 'toggle' | 'choice' | 'action', value, choices?, actionLabel?, hint?, group?: 'General' | 'Behavior' | 'Data' }`.
2. Give it a command that switches it on and off, and that answers `set <key> <value>` (a toggle's value is `on` or `off`).
3. Publish its version as `version` in its `$.state`, matching its plugin.json.
4. Add one entry for it to `readMods` in `hooks/mod-menu.tsx`, reading its `version` too.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install mod-menu --marketplace Iueelyen/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope. From a shell:

```
claude plugin install mod-menu --marketplace Iueelyen/claude-mods
```

In the Claude desktop app: click + next to the prompt box, then Plugins, Add marketplace with `Iueelyen/claude-mods`, then add the plugin.

## Files

- `hooks/register.tsx`: entry point
- `hooks/mod-menu.tsx`: the `/mods` command and the pane
- `types/index.d.ts`: the menu's own state (`mod-menu.selected`)
- `tests/mod-menu.test.tsx`: run with `claude plugin test <this folder>`
