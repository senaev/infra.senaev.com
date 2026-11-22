- [x] Verify the Hetzner pilot and deploy OpenTelemetry container log collection on all seven Linux nodes.
- [ ] Deploy and verify the smaller agent image and startup probe from [PR #287](https://github.com/senaev/infra.senaev.com/pull/287/changes).

## Stage

Cluster-wide collection is deployed. ClickHouse runs on `senaev-madrid`, the persistent OpenTelemetry gateway runs on Hetzner, and Grafana reads the 450-day logs table through **ClickHouse Logs**.

## Next steps

After PR #287 rolls out, check the DaemonSet, recent logs from every node and Datadog parity on shared nodes. See the [verification steps](README.md#verification).
