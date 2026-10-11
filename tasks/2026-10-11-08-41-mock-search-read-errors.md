# 2026-10-11 — Mock search read errors

## Goal

Run the unreadable-file search test under every execution user, including root.

## Context

[searchTool.test.ts](../obsidian-sync/src/vault-tools/tools/searchTool.test.ts) skipped its read-error test under root because chmod 000 cannot deny root access.

## Plan

Mock readFile for locked.md with EACCES, preserve real reads for other files, reset the mock after each test, and remove the skip condition.

## Verification

Run all checks with npm run simple-checks and inspect git diff --check. The formerly skipped test must pass under root.

## Findings

### 2026-10-11 08:41 UTC — Replace permission-dependent fixture

Added a partial node:fs/promises mock. Only locked.md raises EACCES during the read-error test; other reads use the actual implementation. Removed chmod and the root skip. Checks pending.

### 2026-10-11 08:44 UTC — Verify the change

Full simple-checks run: 1094 tests passed with no skips; typecheck, Python, shell and Helm checks passed. Lint reported require-await in the mock. Replaced async/throw with Promise.reject, then reran full lint, the 10 search tests, obsidian-sync typecheck and git diff --check: all passed.

## Result

The read-error test runs under root and other users using a deterministic EACCES mock. Production code is unchanged. Changes are not committed or pushed.
