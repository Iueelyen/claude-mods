---
description: End-of-session wrap-up - save rules, progress and notes, commit to git if there's a repository, then say it's safe to /clear
---

End-of-session wrap-up. Do these steps in order, then report back briefly.

1. **CLAUDE.md** (in the project folder). Add any NEW lasting rules, conventions or decisions from this session: how the person wants things done from now on, not what was done today. Leave out sprint details. Keep the file under 200 lines. If there is no CLAUDE.md yet, create one holding just those rules under a short heading that says what the file is for ("Rules and conventions Claude follows in this project").

2. **The progress file** (in the project folder). This is the file the project names as its progress file: `PROGRESS.md` by default, but if the project's CLAUDE.md says another file is the progress file (for example `BACKLOG.md`), use that one and do not create PROGRESS.md. The project's own instructions always win over this step. Bring it up to date: completed work, unfinished work, known bugs and recommended next steps. Replace the old "Next steps" section rather than adding a second one.
   While updating it, **keep the progress file short**:
   - Add today's entry at the top of "Completed" (newest first).
   - Keep only the last 3 dated entries in "Completed". Move older entries, word for word, to the top of a "Completed (archived)" section in `docs/progress-archive.md`. If that file doesn't exist, create it starting with a 3-line header: what it is (the archived history of the progress file), that it isn't loaded automatically, and that /wrapup moves old entries into it. Never delete anything; only move it.
   - Keep a short "Milestones" list under "Completed": one line per date or phase. When an entry is archived, fold a few words about it into the matching milestone line (add the line if there is none).
   - Keep "Current state" to one line per feature, with the file names where it lives. If a line has grown into a paragraph, move the long version, word for word, to a "Current state (detailed)" section in the archive and leave one line behind.
   - Never archive open work: "In progress", "Known bugs", "Next steps" and "Decisions" stay in the progress file.
   - Count the progress file's words before and after this step, for the report.
   If there is no progress file yet, create PROGRESS.md (or the file the project names) with exactly this layout, filled in from this session and what you can see of the project (README, git history, notes in the code):

   ```
   # Progress

   > What this file is for: the running record of where this project stands. Claude reads it at the start
   > of work and updates it at the end of each session (/wrapup), and /todo builds the to-do list from it.
   > Keep it current; keep finished history short (older entries move to docs/progress-archive.md).

   ## Current state
   (what the project is, its current version if it has one; one line per feature, with the files where it lives)

   ## Completed
   - YYYY-MM-DD: what was finished (newest first; only the last 3 dated entries)

   ### Milestones
   - YYYY-MM-DD or phase: a few words (one line each)

   ## In progress / unfinished

   ## Known bugs

   ## Next steps
   (in order; each item: short name, kind = fix / feature / polish / security / needs a decision, effort = S / M / M-L / L / ?)

   ## Decisions
   (standing choices to keep unless the person changes them)
   ```

3. **README.md**: update it only if features, setup or usage changed this session.

4. **Git**: check whether this project is inside a git repository (`git rev-parse --is-inside-work-tree`).
   - If it is: show a short summary of the file changes (list `docs/progress-archive.md` among them if it changed), then stage and commit them with a descriptive commit message. Do not push unless the person asks. Then run `git status` and confirm the working tree is clean (say what is left if it isn't).
   - If it is not: say plainly "No git repository here, so I skipped the commit." and go on.

5. **Report**: in the wrap-up summary, say how many entries were moved to `docs/progress-archive.md` and the progress file's word count before and after. If it is still over about 3,500 words, say so and suggest what else could move.

6. End with: **"Safe to /clear"**.

Anything extra from the person: $ARGUMENTS
