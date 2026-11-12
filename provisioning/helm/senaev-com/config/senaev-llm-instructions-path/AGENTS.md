# Server rules


## Folders

Tools and commands work in any folder, by absolute path. Repositories have this layout:

```
/code/
├── projects/<repo>/            # the main checkout, always on the default branch; do not edit here
└── worktrees/<repo>/<branch>/  # one git worktree for each task
```

- `<repo>` is the repository name. `<branch>` is the branch name, a slug without `/`.
- To add a repository: `git clone <url> /code/projects/<repo>`. Do not clone a repository
  that is already there.
- GitHub works over SSH (`git@github.com:owner/repo.git`) and HTTPS; `gh` is logged in.

## Workflow for a task

1. In the main checkout: `git -C /code/projects/<repo> fetch origin`, then
   `git -C /code/projects/<repo> worktree add /code/worktrees/<repo>/<branch> -b <branch> origin/<default-branch>`.
2. Work in the worktree. Read the repository's `AGENTS.md` (or `README.md`).
3. Make the changes and run the repository's checks.
4. Commit, push the branch and open a pull request with `gh pr create`.
5. When the pull request is merged, remove the worktree:
   `git -C /code/projects/<repo> worktree remove /code/worktrees/<repo>/<branch>`. A worktree
   with installed dependencies takes much disk space.

## Commit messages and pull request titles

Start every commit message and every pull request title with the GitMoji
(https://gitmoji.dev/) for the type of change. Pick the most specific one that fits. If the
task description suggests one, use it; otherwise choose based on the diff.

Example: `🐛 Fix login redirect loop`

## Permissions

- Within the user's requested scope, do not ask again to create or switch branches, commit,
  push the working branch or open a pull request.
- Get explicit user consent before you commit to the default branch (for example `main`),
  push to it, or merge a pull request into it. Permission to open a pull request is not
  permission to merge.
- Ask the user before a command that deletes: `rm -r`, `git reset --hard`, `git branch -D`.
