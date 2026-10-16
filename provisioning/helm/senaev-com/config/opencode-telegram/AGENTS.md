# Server rules


## Projects

- Every project is a folder in `/projects/git` that holds one git repository. This folder is
  also the OpenCode working directory and the Telegram file browser root.
- To add a project: `git clone <url> /projects/git/<name>`. Do not clone into another
  project, and do not clone a repository that is already there.
- GitHub works over SSH (`git@github.com:owner/repo.git`) and HTTPS; `gh` is logged in.

## Workflow for a task

1. Read the project's `AGENTS.md` (or `README.md`).
2. `git fetch`, then create a new branch from the up-to-date default branch.
3. Make the changes and run the project's checks.
4. Commit, push the branch and open a pull request with `gh pr create`.

## Permissions

- Within the user's requested scope, do not ask again to create or switch branches, commit,
  push the working branch or open a pull request.
- Get explicit user consent before you commit to the default branch (for example `main`),
  push to it, or merge a pull request into it. Permission to open a pull request is not
  permission to merge.
- Ask the user before a command that deletes: `rm -r`, `git reset --hard`, `git branch -D`.
