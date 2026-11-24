- [x] Deploy OpenTelemetry container log collection across all seven Linux nodes.
- [x] Deploy the smaller agent, startup probe and node label on replayed logs.
- [x] Compare ClickHouse and Datadog on their three shared nodes.
- [x] Verify delivery of a test log from `proxmox`.

## Stage

Completed on 2026-11-24. The DaemonSet has seven ready agents and all seven nodes have
delivered labeled logs. ClickHouse on `senaev-madrid` retains logs for 450 days and
Grafana reads the data through **ClickHouse Logs**. The user skipped the production
recovery drill after local testing verified queue recovery.

## Evidence

The [worklog](project-worklog.md) records the `proxmox` probe, rollout checks and the
Datadog comparison.
