- [ ] Add Obsidian vault file inventory metrics, largest-file reporting and an alert for files over 4.5 MB.

## Stage

Project scoped; implementation not started.

## Decisions

- Reuse the existing Obsidian filesystem access and VictoriaMetrics / Alertmanager stack.
- Warning threshold: 4,500,000 bytes, before the 5 MB Sync Standard limit.
- Keep metric labels low-cardinality and do not publish private vault filenames.

## Next steps

Choose the detailed scan/metrics exposure approach; implement, test and deploy the inventory, Grafana view and alert; verify the notification end-to-end.
