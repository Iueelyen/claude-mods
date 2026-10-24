# Install all mods on another PC

How to install every mod in this repository on a Windows PC, once. After that, every new Claude Code session on that PC loads the mods by itself: there's nothing to type at the start of a chat.

| Mod | What it does | Command |
|---|---|---|
| Clean View (`clean-view`) | Hides tool rows and shows a plain checklist above the prompt | `/simple` |
| Prompt Upgrade (`prompt-upgrade`) | Improves a rough prompt before it's sent | `/better` |
| Usage Meter (`usage-meter`) | Shows your 5-hour and weekly usage under the prompt | `/meter` |
| Mods menu (`mod-menu`) | Control panel to switch mods and their options | `/mods` |

## Before you start

1. **The Claude desktop app** is installed and you're signed in.
2. **Git** is installed. Open PowerShell and run `git --version`. If it says "not recognized", install Git from https://git-scm.com/download/win (accept every default), then **fully quit the Claude app** (right-click its icon by the clock, then Quit) and reopen it.

## Option 1: Ask Claude to do it (easiest)

Open a **Code** session in the Claude app and paste this:

```
Install all my Claude Code mods from my GitHub marketplace Iueelyen/claude-mods for my user. Before you change anything, tell me what you'll run and wait for my yes.
1. Check Git is installed (git --version). If it isn't, stop and tell me.
2. Find the Claude Code command-line program. If `claude` isn't on the PATH, use the newest claude.exe in the Claude app's data folders (under %LOCALAPPDATA%).
3. Run: claude plugin marketplace add Iueelyen/claude-mods --scope user
   (If it says the marketplace already exists, run: claude plugin marketplace update claude-mods)
4. Install every mod the marketplace lists, each with: claude plugin install <mod>@claude-mods --scope user
   Today that's clean-view, prompt-upgrade, usage-meter and mod-menu.
5. Run claude plugin list and tell me whether every mod is enabled, with its version.
If anything fails, show me the exact error and explain it in plain English.
```

## Option 2: In the Claude app, by clicking

1. In a **Code** session, click **+** next to the prompt box, then **Plugins**.
2. Click **Add marketplace**, type `Iueelyen/claude-mods`, then **Sync**.
3. Add each mod: **clean-view**, **prompt-upgrade**, **usage-meter** and **mod-menu**.

## Option 3: In PowerShell

Copy and run this whole block. It finds the Claude command-line program, adds the marketplace and installs every mod:

```powershell
$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) {
  $claude = Get-ChildItem "$env:LOCALAPPDATA" -Recurse -Filter claude.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match 'claude-code' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $claude) { Write-Host "Couldn't find claude.exe. Open the Claude app's Code tab once, then try again."; return }

& $claude plugin marketplace add Iueelyen/claude-mods --scope user
& $claude plugin marketplace update claude-mods
foreach ($mod in 'clean-view', 'prompt-upgrade', 'usage-meter', 'mod-menu') {
  & $claude plugin install "$mod@claude-mods" --scope user
}
& $claude plugin list
```

If the first line after the search says the marketplace already exists, that's fine: the next line refreshes it.

## Check it worked

1. Start a **new** Code session (sessions that were already open don't pick up new mods).
2. Above the prompt you should see **● Clean View: ON**, and under it your usage bars.
3. Type `/mods`: the control panel lists every mod as installed.

## If something goes wrong

| What you see | What to do |
|---|---|
| "Failed to add marketplace" in the app | Check Git is installed, fully quit and reopen the Claude app, try again. Still failing: use Option 1, which shows the real error. |
| One mod didn't install | Install just that one: `claude plugin install <mod>@claude-mods --scope user`, or click it in **+**, **Plugins**. |
| Mods don't appear | Start a new session. Then run `claude plugin list` and check each says enabled. |

## Getting updates later

When a mod changes in this repository, run:

```
claude plugin marketplace update claude-mods
claude plugin update <mod>@claude-mods --scope user
```

then start a new session. A mod added later is installed the same way as in Option 1 or 3.

## Settings

Each PC keeps its own settings (which mods are on, and their options). Change them with `/mods` on that PC.
