# Git Guide — Wedding Live Photo Wall

How to track and push changes for this project. Assumes you're working from
`C:\Users\timmy\Desktop\Coding\wedding-app`, which is already connected to
**https://github.com/timothygey/wedding-photo-live-wall** (branch `main`).

This is source control only — pushing to GitHub does **not** deploy your
changes to the live site. See `DEPLOYMENT.md` for that (`firebase deploy`).
The two are independent: you can push to GitHub without deploying, and
deploy without pushing. Doing both keeps GitHub as an accurate backup of
whatever is actually live.

---

## Everyday workflow

1. Make your edits (HTML/CSS/JS, `functions/index.js`, rules files, etc.).
2. Check what changed:
   ```powershell
   git status
   git diff
   ```
3. Stage the files you want to commit:
   ```powershell
   git add <file1> <file2>
   # or, to stage everything that changed:
   git add .
   ```
   Prefer naming specific files over `git add .` when you're not sure
   everything in the working tree should be committed (e.g. stray local
   test files).
4. Commit with a short message describing *why*, not just *what*:
   ```powershell
   git commit -m "Increase wall photo limit to 20"
   ```
5. Push to GitHub:
   ```powershell
   git push
   ```

That's the whole loop: **edit → `git add` → `git commit` → `git push`**.

---

## Checking things before you commit

| Command | What it shows |
|---|---|
| `git status` | Which files are modified/staged/untracked |
| `git diff` | Line-by-line unstaged changes |
| `git diff --staged` | Line-by-line changes already staged for commit |
| `git log --oneline` | Recent commit history |
| `git log --oneline --graph --all` | History including branches |

---

## Undoing things

| Situation | Command |
|---|---|
| Unstage a file (keep the edits) | `git restore --staged <file>` |
| Discard uncommitted edits to a file | `git restore <file>` (⚠️ permanently loses those edits) |
| Change the message of the last commit (not yet pushed) | `git commit --amend` |
| See what a specific commit changed | `git show <commit-hash>` |

Avoid `git reset --hard` or amending/rewriting commits that have already
been pushed — it rewrites history that GitHub already has, which causes
problems if you ever push from another machine.

---

## Pulling changes (if you ever edit from a second machine, or edit on GitHub.com directly)

```powershell
git pull
```

Run this **before** you start editing on a given machine, so you're not
working from a stale copy. If `git push` is ever rejected because the
remote has commits you don't have locally, run `git pull` first, resolve
any conflicts it reports, then `git push` again.

---

## What's intentionally excluded from Git

Defined in `.gitignore` (root) and `functions/.gitignore`:

- `node_modules/` — reinstalled via `npm install`; contains machine-specific compiled binaries (`sharp`) that shouldn't travel between machines.
- `.firebase/` — the Firebase CLI's local deploy cache, not source.
- `firebase-debug*.log`, `.env`, `*.local` — local-only logs/secrets.

If `git status` ever shows `node_modules` or `.firebase` as untracked and
about to be added, double check you haven't accidentally deleted or
edited the `.gitignore` file.

---

## Quick reference

```powershell
git status                 # what changed
git add .                  # stage everything
git commit -m "message"    # commit staged changes
git push                   # send commits to GitHub
git pull                   # fetch + merge latest from GitHub
git log --oneline          # recent history
```
