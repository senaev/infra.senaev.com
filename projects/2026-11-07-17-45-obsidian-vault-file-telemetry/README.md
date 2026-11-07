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

1. Define which vault files count for this report: include normal vault content and attachments; exclude backup/trash, Git metadata, temporary files and dependency folders. Explicitly decide how `.obsidian` configuration and hidden files should be treated so totals and alerts match files Obsidian Sync can actually synchronize. Do not follow symlinks.
2. Add a lightweight periodic read-only filesystem scan close to `obsidian-sync`, using file metadata rather than reading file contents. Define its update interval and behavior for failed scans.
3. Export low-cardinality metrics: file count, count by type, total bytes, bytes by type, maximum individual file size, over-threshold file count and scanner freshness/health. Preserve the largest file name and top-largest list in restricted diagnostic output or logs without creating a time series per file.
4. Configure scraping in the existing VictoriaMetrics setup and provide a Grafana view of totals, file types, storage and the largest files, including the actual filename and size.
5. Add a `VMRule` alert for a file exceeding **4,500,000 bytes**, routed through the existing Alertmanager notifications. Include the file path and current size in the notification without publishing the vault listing.
6. Test changes to the vault (file added, deleted, resized, renamed), extension categorization, hidden/trash paths, permission errors, symlinks, stale scanner data and alert resolve behavior. Document only the operational settings needed to maintain it.

## Verification

- Compare file totals, per-type totals and byte sums against an independent read-only vault filesystem inventory; confirm the largest file and its exact size match.
- Create a temporary file just above 4,500,000 bytes and verify the notification identifies it; reduce it below the threshold and verify the alert resolves. Delete the test file afterward.
- Verify that scraper outages or scan failures do not silently present stale measurements as healthy.
- Confirm no file contents or sensitive filenames appear in public metrics/endpoints, and that the current Obsidian Sync workload continues to synchronize normally.

## Result

Pending implementation and production verification.
