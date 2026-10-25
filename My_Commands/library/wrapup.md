---
description: End-of-session wrap-up - save rules, progress and notes, commit to git if there's a repository, then say it's safe to /clear
---

End-of-session wrap-up. Do these steps in order, then report back briefly.

1. **CLAUDE.md** (in the project folder). Add any NEW lasting rules, conventions or decisions from this session: how the person wants things done from now on, not what was done today. Leave out sprint details. Keep the file under 200 lines. If there is no CLAUDE.md yet, create one holding just those rules under a short heading that says what the file is for ("Rules and conventions Claude follows in this project").

2. **PROGRESS.md** (in the project folder). Bring it up to date: completed work, unfinished work, known bugs and recommended next steps. Replace the old "Next steps" section rather than adding a second one.
   If there is no PROGRESS.md yet, create it with exactly this layout, filled in from this session and what you can see of the project (README, git history, notes in the code):

   ```
   # Progress

   > What this file is for: the running record of where this project stands. Claude reads it at the start
   > of work and updates it at the end of each session (/wrapup), and /todo builds the to-do list from it.
   > Keep it current; keep finished history short.

   ## Current state
   (what the project is, its current version if it has one, what works today)

   ## Completed
   - YYYY-MM-DD: what was finished (newest first)

   ## In progress / unfinished

   ## Known bugs

   ## Next steps
   (in order; each item: short name, kind = fix / feature / polish / security / needs a decision, effort = S / M / M-L / L / ?)

   ## Decisions
   (standing choices to keep unless the person changes them)
   ```

3. **README.md**: update it only if features, setup or usage changed this session.

4. **Git**: check whether this project is inside a git repository (`git rev-parse --is-inside-work-tree`).
   - If it is: show a short summary of the file changes, then stage and commit them with a descriptive commit message. Do not push unless the person asks. Then run `git status` and confirm the working tree is clean (say what is left if it isn't).
   - If it is not: say plainly "No git repository here, so I skipped the commit." and go on.

5. End with: **"Safe to /clear"**.

Anything extra from the person: $ARGUMENTS
