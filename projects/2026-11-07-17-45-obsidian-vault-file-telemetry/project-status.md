- [ ] Add Obsidian vault file inventory metrics, largest-file reporting and an alert for files over 4.5 MB.

## Stage

Implementation done locally in PR #129; awaiting final review, CI and production verification.

## Completed

- Metadata-only vault scan with 15-second scrape cache, extension totals, top ten, biggest file and 4.5 MB threshold.
- Internal `/metrics` with low-cardinality labels and authenticated `/vault/file-stats` details.
- VictoriaMetrics scraping, Grafana dashboard and Alertmanager-to-Telegram warning plus stale-data alert.
- Tests for inventory counts, hidden/symlink exclusions, exact threshold, authentication and scan failure.

## Next steps

Review/commit/push the implementation; check PR CI. After merge/deploy, verify Grafana scrape, dashboard, and end-to-end alert/resolve using a controlled temporary file.
