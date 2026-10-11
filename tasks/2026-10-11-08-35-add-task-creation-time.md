# 2026-10-11 — Add task creation time

## Goal

Include the UTC creation hour and minute in new task filenames. Keep existing task filenames unchanged.

## Context

Naming rules are documented in [../AGENTS.md](../AGENTS.md) and [AGENTS.md](AGENTS.md).

## Verification

Inspect the diff and run `git diff --check`; confirm no existing task files were renamed.

## Findings

### 2026-10-11 08:35 UTC — Update naming instructions

Updated both instruction files to require `YYYY-MM-DD-HH-mm-<short-slug>.md` for new tasks, using the UTC creation timestamp and zero-padded 24-hour hours and minutes. Explicitly preserved existing filenames. Created this working log using the new format.

## Result

Both instruction files now define the UTC filename format for new tasks. Existing task files remain unchanged.
