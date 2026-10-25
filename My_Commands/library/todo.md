---
description: Show everything left to do on this project as ordered, colour-coded tables with effort, milestones and a suggested next sprint
argument-hint: "[focus]"
---

Show the person everything still to do on this project, as one ordered, colour-coded list.
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
(in order; each item: short name, kind = fix / feature / polish / security / needs a decision, effort = S / M / M-L / L / ?)
## Decisions
```

Skip anything struck through (`~~...~~`) or marked done. Merge duplicates (the same item under two ids) into one row.

## 2. Order it, using your own judgment
Start from the order the project's own files give, then apply what makes sense: dependencies first, bugs that break daily use before polish, items that share a test next to each other. Keep the person's standing decisions (PROGRESS.md "Decisions", CLAUDE.md) unless you flag them. Wherever your order differs from theirs, say so in the "Why here" column ("moved up: ...").

## 3. The tables
Legend first, exactly this:

**Effort:** 🟢 S (1-2 h) · 🟡 M (one session) · 🟠 M-L (1-2 sessions) · 🔴 L (several sessions) · ⚪ ? (discuss first)
**Kind:** 🐞 fix · ✨ feature · 🔧 polish · 🔒 security / platform · 💬 needs a decision from the person

Then ONE markdown table PER MILESTONE (markdown cannot merge cells, so never put divider rows inside a table). Use the project's own milestones or versions if it has them; otherwise use **Now**, **Next** and **Later / someday**. Each table gets its own heading line above it, for example:
`### ━━ Now (on <version>) ━━`
`### ━━ Next ━━`
`### ━━ Later / someday (not scheduled) ━━`

Same columns in every table: `# | Item | Kind | Effort | What it is (one line) | Why here`
- The # keeps counting across the tables (one overall order).
- Effort cell = the colour dot + the letter + a rough time, e.g. `🟡 M ~3-4 h`.
- Item cell = the item's id if it has one + a short name; the planned version if known.
- Later / someday: keep it short (one row per group of small ideas).

## 4. Suggested next sprint
A short boxed section (blockquote) under the tables:
- **Next sprint:** about 3-4 items, each its own release (version bump, changelog, the person's test, deploy). The person's testing time is the limit; prefer items tested on the same screen or area.
- One line per item: the version it would get (if the project uses versions), its effort, why it belongs in this sprint.
- The total effort for the sprint, and anything that needs a decision from the person BEFORE it starts.

Then **Sprints after that:** a small table `Sprint | Items | Theme` grouping the rest the same way.

## 5. Close
- One line: what you changed compared to the project's own order (or "same order as the project's list").
- End with: "Tell me any changes to the order or grouping, and I'll update the list after you OK it." (Only after the person answers and says yes: edit the backlog or PROGRESS.md, show the diff, and follow CLAUDE.md's rules.)

Keep it brief: no filler, no paragraphs outside the sections above.
