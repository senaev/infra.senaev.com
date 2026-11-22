# 2026-11-21 — Move Senaev Personal Tools

Build Senaev Personal Tools in infra and let BRAT install and update it from GitHub releases.

## Goal

Move the plugin source and its filtered Git history into infra. Switch the vault from tracked
plugin builds to BRAT after verifying the first release.

## Context

The [plugin source](../../obsidian-personal-tools/) and its history are in infra.
BRAT manages the installed release in the vault.

## Release workflow

A merged PR with a new plugin manifest version triggers a production build and tests.
After they pass, GitHub Actions publishes the three release files under the manifest
version. An already published version is left as-is. Keep manual dispatch available
for retrying a failed publish.

## Verification

The first release’s three assets downloaded successfully, the deploy smoke tests passed,
and the vault owner confirmed that the plugin worked after the cleanup sync. Confirm that
BRAT detects and installs the next plugin release when it ships.

## Result

The reminder prerequisite is complete. [Infra PR #266](https://github.com/senaev/infra.senaev.com/pull/266/changes)
deployed the shared renderer in Obsidian Sync. The vault update added properties to 15 source
notes and switched the existing plugin to the shared renderer. All 15 live files were
verified against the merged vault revision.

An Obsidian MCP smoke test confirmed correct weekday, first-of-month, Saturday, and Sunday
reminders and ascending section order. The test notes were moved to recoverable trash.
The four-note request took 1.75 seconds including one shared vault scan.

[Infra PR #276](https://github.com/senaev/infra.senaev.com/pull/276/changes) imported 31
plugin commits with a merge commit and published [release `0.1.1`](https://github.com/senaev/infra.senaev.com/releases/tag/0.1.1).
Telegram accepted the release notification. Vault PR #10 removed the old source and build
workflow and stopped tracking the release assets. The vault owner confirmed that the plugin
works after syncing the cleanup.
