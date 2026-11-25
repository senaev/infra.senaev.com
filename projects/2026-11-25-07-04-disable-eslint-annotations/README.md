# 2026-11-25 — Disable ESLint annotations on pull requests

- [ ] No workflow turns ESLint warnings or errors into pull request annotations

## Goal

ESLint problems must not appear as annotations on pull requests, for any package. Until now
Obsidian Personal Tools showed them (for example the `obsidianmd/validate-license` warnings on
`obsidian-personal-tools/LICENSE` in [#305](https://github.com/senaev/infra.senaev.com/pull/305)).
Lint problems stay in the job log, and an ESLint error still fails the check.

## Context

- `actions/setup-node` registers the problem matchers `eslint-stylish` and `eslint-compact`
  (and `tsc`) on every job that uses it. A matcher turns matching log lines into annotations.
- Workflows that run ESLint:
  - `.github/workflows/obsidian-personal-tools.yml`: `npm run lint` of the plugin, on its own,
    so the matcher annotated every warning.
  - `.github/workflows/check.yml`: the root ESLint, for every other package, inside
    `npm run simple-checks`. `concurrently` puts `[lint] ` before every line, so the matcher did
    not match by accident. Turning it off makes that explicit and keeps it off if the output
    format changes.
- `.github/workflows/publish-senaev-utils.yml` uses `setup-node` but does not run ESLint.

## Plan

1. In both workflows, right after `setup-node`, a step `Turn off ESLint annotations` runs
   `::remove-matcher owner=eslint-stylish::` and `::remove-matcher owner=eslint-compact::`.
   The `tsc` matcher stays.
2. Note it in `AGENTS.md`.

The first version of this pull request did the opposite (a formatter that wrote annotations for
the root lint); it is in the worklog.

## Verification

On the pull request, a temporary commit adds one ESLint warning to the plugin and one to a root
package. Both lint jobs must pass with 0 annotations, and the warnings must be in the logs. The
commit is removed before review.
