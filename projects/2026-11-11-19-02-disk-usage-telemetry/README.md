# 2026-11-11 — Disk usage telemetry

Lightweight disk usage diagnostics and clear low-space alerts for every VPS.

## Goal

- Low-space alerts and notifications show a stable VPS name and enough data to act.
- We can see which directories and files use the space, at a low cost for the node.
- Keep new code to a minimum; reuse the existing metrics stack.

## Context

- Work in the worktree `/code/worktrees/infra.senaev.com/disk-usage-telemetry` (branch `disk-usage-telemetry`), after [Code Tools worktrees](../2026-11-11-19-02-code-tools-worktrees/README.md) is deployed.
- Earlier incident: [firstvds disk space low](../2026-07-27-firstvds-disk-space-low/).
- The `/code` PVC uses `local-path`, which does not enforce its size. Worktrees with their own `node_modules` fill the hetzner root disk, which also holds the control plane. The low-space alert must exist before agents use worktrees much (PR #160 review).

## Plan

1. 📌 Alerts and notifications: a stable VPS name, node name, mountpoint, device, available/total space, percentage and a Grafana link. Put the values that change in annotations, not labels.
2. 📌 A minimal collector: one scan of selected directories each hour; directory sizes as metrics, the top 20 files as structured logs. Use the node-exporter textfile collector and the existing Prometheus-compatible stack.
3. 📌 One trial scan on galkin: measure elapsed time, CPU and disk I/O, then choose the final limits.
   - Low CPU and I/O priority, no overlapping runs, a 30-second timeout target.
   - Do not read file contents; measure allocated blocks; exclude virtual and duplicate mounts.
   - Do not show an incomplete scan as complete; export freshness and errors.
4. 📌 No file paths as metric or log labels.
5. ❓ Check separately whether we need checks for open deleted files and extra scans on low space, without making the code larger than necessary. Account for HDD spin-ups.
6. 📌 A compact PR, several review cycles and the related checks. Report the final change size, the measured overhead and the limitations.

## Verification

- A test alert shows the VPS name, mountpoint, space values and a working Grafana link.
- The scan metrics are fresh in Grafana, and an error or timeout is visible as such.
