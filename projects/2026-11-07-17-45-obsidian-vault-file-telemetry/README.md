# 2026-11-07 — Obsidian vault file telemetry and size alert

Monitor the files in my Obsidian vault and warn before an individual file exceeds Obsidian Sync's practical size limit.

## Goal

- Show **total number of files** in the vault, split by file type/extension (Markdown, CSV, images, PDF and other types).
- Show **total storage used**, storage by file type, and individual file sizes; make the **largest file's path and exact byte size** visible, ideally with a short list of the largest files.
- Alert automatically when **any file is larger than 4.5 MB (4,500,000 bytes)**, including the offending vault-relative path and size in the alert details. Clear the alert when the condition is resolved.
- Make this usable from the existing observability stack; no new standalone monitoring service unless there is a strong reason.

## Context

- The `obsidian-sync` deployment already mounts the live vault filesystem and runs continuous Obsidian Sync. We recently split an oversized `transactions.csv` into yearly files to stay below the Sync Standard 5 MB per-file limit.
- The infra repository already uses VictoriaMetrics (`VMRule`) and Alertmanager for alerts in `provisioning/helm/senaev-com/templates/alerts.yaml`, with an established notification route.
- Collect **metadata only** (file size, type, relative path where needed), never file contents. Keep full file paths out of high-cardinality metric labels and avoid exposing private filenames publicly.

## Plan

1. Count non-hidden vault content, including attachments and backup CSVs; exclude dot-prefixed paths (`.trash`, `.git`, `.obsidian`), `plugins/`, `node_modules/` and symlinks. Never read file contents.
2. Scan on scrape with 15-second caching and single-flight concurrency. Failed scans expose `obsidian_vault_scan_success 0` and do not report stale inventory as current.
3. Export bounded metrics: total count and bytes, counts and bytes grouped by extension, largest-file bytes with one `path` label, oversized-file count and scanner health. A separate authenticated endpoint returns the top ten files and supports exact-path size lookup.
4. Add `VMServiceScrape` and a Grafana dashboard with totals, by-type figures and the largest file path/size. Restrict metrics scraping to telemetry vmagent through Kubernetes NetworkPolicy.
5. Add a `VMRule` alert for the largest file exceeding **4,500,000 bytes** (2-minute delay), with file path and bytes in the notification; a second alert catches missing/stale scanner data.
6. Test changes to the vault (file added, deleted, resized, renamed), extension categorization, hidden/trash paths, permission errors, symlinks, stale scanner data and alert resolve behavior. Document only the operational settings needed to maintain it.

## Verification

- Compare file totals, per-type totals and byte sums against an independent read-only vault filesystem inventory; confirm the largest file and its exact size match.
- Create a temporary file just above 4,500,000 bytes and verify the notification identifies it; reduce it below the threshold and verify the alert resolves. Delete the test file afterward.
- Verify that scraper outages or scan failures do not silently present stale measurements as healthy.
- Confirm no file contents or sensitive filenames appear in public metrics/endpoints, and that the current Obsidian Sync workload continues to synchronize normally.

## Result

Implemented in the PR worktree; unit/integration tests and Helm render checks pass. Production scrape, dashboard and alert delivery must be verified after merging and deploying the PR.

Related project files: [status](project-status.md) · [worklog](project-worklog.md).
