- [ ] Code Tools works in any folder by absolute paths; repositories and worktrees live under `/code`.

**Stage:** PR #160 open; fixing the review findings.

**Done:**
- Contract and code-tools: absolute paths, `cwd` for `run`, `code-projects` removed.
- Helm: new `<name>-code` PVC at `/code` next to `/projects`; `/AGENTS.md` describes the folder layout.
- Review fixes in the source code (symlink writes, one-level list with `readdir`, partial `rg` results, smaller items).

**In progress:** tests for the review fixes.

**Next steps:** full checks, push to PR #160, deploy, connector refresh by the user.
