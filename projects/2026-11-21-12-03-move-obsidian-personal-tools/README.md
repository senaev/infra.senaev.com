# 2026-11-21 — Move Senaev Personal Tools

Build Senaev Personal Tools in infra and let BRAT install and update it from GitHub releases.

## Goal

Move the plugin source and its filtered Git history into infra. Switch the vault from tracked
plugin builds to BRAT after verifying the first release.

## Context

The vault still contains the source and installed build. The local migration branch contains a draft history import and release workflow.

## Plan

1. Refresh the import from vault main and retain the plugin folder’s commit history.
2. Open the infra migration PR and land it with a merge commit to preserve the imported history.
3. Publish GitHub releases automatically from infra main and install the first release through BRAT.
4. Land the vault cleanup after verifying that BRAT installs and updates the plugin.

## Release workflow

A merged PR with a new plugin manifest version triggers a production build and tests.
After they pass, GitHub Actions publishes the three release files under the manifest
version. An already published version is left as-is. Keep manual dispatch available
for retrying a failed publish.

## Verification

Check the release assets `main.js`, `manifest.json`, and `styles.css`. In Obsidian, verify
the installed version, daily-note reminders, widgets, and Tasks queries. Verify that BRAT
detects a subsequent release before completing the migration.

## Result

The reminder prerequisite is complete. [Infra PR #266](https://github.com/senaev/infra.senaev.com/pull/266/changes)
deployed the shared renderer in Obsidian Sync. The vault update added properties to 15 source
notes and switched the existing plugin to the shared renderer. All 15 live files were
verified against the merged vault revision.

An Obsidian MCP smoke test confirmed correct weekday, first-of-month, Saturday, and Sunday
reminders and ascending section order. The test notes were moved to recoverable trash.
The four-note request took 1.75 seconds including one shared vault scan. The plugin migration,
first BRAT release, and vault cleanup are pending.
