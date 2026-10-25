---
description: Show everything left to do on this project - a summary, one ordered table with effort bars, and the next sprint
argument-hint: "[focus]"
---

Show the person everything still to do on this project, as one compact, ordered list.
Read-only: do not edit, create or commit any file, except the one case in step 1 below.
Optional focus from the person (blank = everything): $ARGUMENTS

## 1. Read the sources fresh (never answer from memory: the list changes every session)
- `PROGRESS.md` in the project folder (where things stand, next steps).
- The project's backlog or to-do list, if there is one: look for files such as `BACKLOG.md`, `TODO.md`, `ROADMAP.md`, or a backlog / roadmap file under `docs`. If a backlog has a separate "done" archive, skip the archive.
- The newest session or handoff note, if the project keeps them (its "Next" section).
- The project's current version, if it has one (`package.json`, `pyproject.toml`, a VERSION file, the latest git tag, or the changelog).

**If there is no PROGRESS.md**, this is the one file you may create. Make it in this layout, filled in from what you can find (README, git history, TODO / FIXME notes in the code, open issues if visible), tell the person you created it, then carry on:

```
# Progress

> What this file is for: the running record of where this project stands. Claude reads it at the start
> of work and updates it at the end of each session (/wrapup), and /todo builds the to-do list from it.
> Keep it current; keep finished history short.

## Current state
## Completed
## In progress / unfinished
## Known bugs
## Next steps
(in order; each item: short name, kind = fix / feature / polish / platform / decision, effort = S / M / M-L / L / ?)
## Decisions
```

Skip anything struck through (`~~...~~`) or marked done. Merge duplicates (the same item under two ids) into one row.

## 2. Order it, using your own judgment
Start from the order the project's own files give, then apply what makes sense: dependencies first, bugs that break daily use before polish, items that share a test next to each other. Keep the person's standing decisions (PROGRESS.md "Decisions", CLAUDE.md) unless you flag them. Wherever your order differs from theirs, say so in the "Why here" column ("moved up: ...").

## 3. The output, exactly in this shape (no emoji other than the effort bar squares, no legend)

**Line 1, the heading:** `**<Project name> · v<version>**` (leave out the version if the project has none).

**Then the summary table**, one row:

| Left | Fixes | Features | Polish | Platform | Decisions | Est. work |
|---|---|---|---|---|---|---|
| **<total>** | n | n | n | n | n | ≈ <total effort, e.g. 6 sessions> |

Leave out a kind column whose count is 0.

**Then ONE table** with every item in the overall order:

| # | Milestone | Item | Kind | Effort | Why here |
|---|---|---|---|---|---|

- **#**: one overall order, 1, 2, 3...
- **Milestone**: the project's own milestone or version line (e.g. `2.x`, `3.0`), or `Now`, `Next`, `Later` if it has none. Small "someday" ideas go last as `Later`, grouped into one row per idea group.
- **Item**: the item's id if it has one, then a short name; no icons.
- **Kind**: one word: `Fix`, `Feature`, `Polish`, `Platform` (security / infrastructure), or `Decision` (needs the person's input first).
- **Effort**: a four-square bar, then the size and a rough time:
  - S: `🟩⬜⬜⬜ S · 1-2 h`
  - M: `🟨🟨⬜⬜ M · 3-4 h` (one session)
  - M-L: `🟧🟧🟧⬜ M-L · 1-2 sessions`
  - L: `🟥🟥🟥🟥 L · <n> sessions`
  - not sized yet: `⬜⬜⬜⬜ ? · discuss`
- **Why here**: a few words, only where it helps: "moved up: ...", "needs #4", "same screen as #3", "starts 3.0". Leave it blank otherwise.

## 4. The next sprints, two compact lines under the table
- `**Next sprint** · <version> <item> · <version> <item> · ... · *≈ <effort>* · *decide first:* <anything needing a decision, or leave this part out>`
  About 3-4 items, each its own release (version bump, changelog, the person's test, deploy). The person's testing time is the limit; prefer items tested on the same screen or area. Leave out version numbers if the project doesn't use them.
- `**Sprints after that** · 2: <theme or items> · 3: <theme or items> · ...`

## 5. Close, in one or two short lines
- `*Changed from the project's order:* <what moved>` (or `*Same order as the project's list.*`)
- Then: "Tell me any changes to the order or grouping, and I'll update the list after you OK it." (Only after the person answers and says yes: edit the backlog or PROGRESS.md, show the diff, and follow CLAUDE.md's rules.)

Keep it compact: no paragraphs, no filler, nothing outside the shape above. With a focus, show only the matching items (and say "focus: <topic>" after the heading).
