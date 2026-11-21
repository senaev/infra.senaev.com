- [ ] Verify the Hetzner pilot and expand OpenTelemetry container log collection to the other nodes.

## Stage

The Helm pilot deploys one ClickHouse on `senaev-madrid`, a persistent OpenTelemetry gateway on Hetzner, and a Hetzner-only agent. The existing Grafana gains a read-only **ClickHouse Logs** data source.

## Next steps

Add both Vault password keys, merge the pilot PR, and run the [verification](README.md#verification) before expanding collection.
