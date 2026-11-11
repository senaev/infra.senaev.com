- [ ] Code Tools works in any folder by absolute paths; repositories and worktrees live under `/code`.

**Stage:** implementation in the `code-tools-worktrees` branch.

**Done:**
- Contract and code-tools: absolute paths, `cwd` for `run`, `code-projects` removed, `list` on `rg`.
- Helm: new `<name>-code` PVC at `/code` next to `/projects`; `/AGENTS.md` describes the folder layout.
- All tests updated; `npm run simple-checks` passes (1747 tests).

**Next steps:** commit, PR, review cycles, deploy, connector refresh by the user.
