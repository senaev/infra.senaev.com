- [ ] Expand OpenTelemetry container log collection beyond the Hetzner pilot.

## Stage

The pilot is deployed and verified. ClickHouse on `senaev-madrid` receives logs from the
agent and gateway on Hetzner. The read-only Grafana datasource returned live logs.

## Next steps

Run the controlled outage check in the [verification](README.md#verification), then
expand the agent's node selection in stages.
