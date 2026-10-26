# Rules and conventions Claude follows in this project

This repository is the `claude-mods` marketplace: Claude Code mods (function-hook plugins), one folder per mod, installed on every PC from GitHub (`Iueelyen/claude-mods`). The repository is **public**.

## Working with Chris
- Chris isn't a developer: explain in plain English, briefly.
- Before building or changing anything, list what it will do, every file created or changed, every command run, and anything that costs usage or is hard to undo, then **wait for an explicit "yes"**. If the scope grows while working, say so.
- Show the changes and wait for an OK before committing or pushing when asked to.
- End by telling Chris the one step to see the change (usually: open a new chat).

## Privacy (public repo)
- Never commit client, tenant, server or personal data: no real company names, tenant codes, server names, emails, IDs, IP addresses, internal URLs, keys or passwords.
- Tests use made-up data (for example Contoso, tenants `aa`/`bb`, servers `AA-*`, round numbers).
- Before every commit: run a secret/key scan and a grep for client-like names; report anything found.
- Project-specific commands (such as a project's own `/todo`) stay in that project, not here; mods here must be general.
- Never copy third-party code without a licence: write a fresh version and credit the idea in the README.

## Every mod
- Folder `Name_Of_Mod/` with `.claude-plugin/plugin.json` (name, version, description, author, license MIT, types), `hooks/hooks.json`, `hooks/register.tsx`, `types/index.d.ts`, tests, README.
- Publishes in its own `$.state`: `version`, `isEnabled`, `options` (option list: key, label, kind toggle/choice/action, value, choices, hint, group General/Behavior/Data).
- Has a command that answers `on`, `off`, `set <key> <value>` and `version`.
- Gets an entry in `Mods_Menu/hooks/mod-menu.tsx` `readMods`, or the Update button can never report "up to date".
- Is listed in `.claude-plugin/marketplace.json`, the main README table and install lines, and all three options in `Install All Mods.md`.

## Every change
- Raise the version in **both** the mod's `plugin.json` and the `VERSION` line in its code (they must match), and add a dated line to `CHANGELOG.md` (newest first).
- Run `claude plugin validate <mod folder>` and `claude plugin test <mod folder>`; fix everything they report.
- Commit with a descriptive message; push only when Chris says so.
- After pushing: `claude plugin marketplace update claude-mods`, then `claude plugin update <mod>@claude-mods --scope user`, then open a new chat.

## Code rules learned the hard way
- Never name a variable `h` in a `.tsx` file (it shadows the JSX factory; the draw throws).
- Functions that take `$` must be top-level functions in the file.
- `$.state` references need literal `plugin` and `key`.
- The desktop app draws Buttons natively and drops any colour inside them: show a selected state as a coloured Box/Text, not a Button; keep coloured dots outside Buttons.
- A mod drawing above the prompt (`AbovePrompt`) must call `next(e)` and include what's beneath, so other mods' bands still show, but never inside a Box that has a `width`: Claude Code refuses its own placeholder (`{ type: 'engine' }`, what `next(e)` answers when nothing is beneath) there and drops the whole band. Put it after the fixed-width box, in an outer Box with no width. Band tests must include a hook beneath answering `{ type: 'engine', ref: 0 }`.
- A plugin's `commands/` folder loads as extra prefixed commands; My Commands keeps its files in `library/` instead.
- In tests, `$.fs` paths arrive in Windows form (`C:\...`): normalise before comparing. A test hook answering `state.get` must pass the mod's own keys to `next(e)`.
- Use the Edit tool (not shell `sed` or `node -e`) for lines containing non-ASCII characters such as `·`; the shell mangles them.

## Style
- Calm, dark, professional: gold `#F2C46D`, hairline `#262B33`, muted `#7D8590`, text `#E6EDF3`, green `#3DD68C`, ink `#0D1117`. No emoji in panes (except where a mod's design calls for it, such as effort bars in `/todo`).
- Size every row to the pane width; check narrow and wide widths in tests.
