- [x] Deploy Obsidian vault file counts, type/size metrics, largest-file diagnostics, and an alert rule for any file over 4.5 MB.

## Stage

Completed and operating in production on 2026-11-07.

## Completed

- [PR #129](https://github.com/senaev/infra.senaev.com/pull/129) merged; GitHub CI and both Helm releases passed.
- Metadata-only scanner, low-cardinality Prometheus metrics, authenticated top-ten/exact-path size diagnostics, and eight-panel [Obsidian Vault dashboard](https://grafana.senaev.com/d/obsidian-vault) deployed.
- Verified live scrape `up=1`, inventory scanner health `1`, file totals and largest-file metrics; no container restarts or active alerts at verification.
- VictoriaMetrics alert for the largest file above 4,500,000 bytes and a scanner-health alert are installed.

## Follow-up (nonblocking)

- A controlled >4.5 MB test file was **not** created in production. Real Telegram notification delivery and subsequent alert resolution were not exercised end-to-end; only deployment, rule configuration, scraping and live healthy-state evaluation were verified.
