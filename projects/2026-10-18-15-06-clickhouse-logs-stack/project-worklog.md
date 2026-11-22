## 2026-11-22 17:08 UTC — Enabled synchronous log emission on the agent

The user confirmed both Vault password entries were added. The agent now passes `--feature-gates=stanza.synchronousLogEmitter` so filelog hands off each batch to the persistent exporter queue before advancing its checkpoint. Collector v0.165.0 accepted the rendered agent configuration.

A local CRI fixture queued 24 logs with the gateway offline. After a forced agent stop, the gateway came online and the restarted agent delivered the queued logs to ClickHouse.

```text
Recovered all 24 distinct fixture logs in ClickHouse after the abrupt agent restart.
```

## 2026-11-22 00:34 UTC — Set log retention to 450 days

The user set the pilot's retention to 450 days before the first deployment. ClickHouse accepted the rendered Helm schema on a fresh database and reported:

```text
TTL toDateTime(Timestamp) + toIntervalDay(450)
```

## 2026-11-21 20:48 UTC — Implemented the Hetzner pilot

The user chose `senaev-madrid` for ClickHouse and kept the gateway and persistent queue on Hetzner. The first DaemonSet agent is restricted to Hetzner. The ClickHouse server uses the OpenTelemetry Collector Contrib v0.165.0 table definition, adjusted for the 14-day TTL. Grafana uses the read-only account. The ClickHouse and OTLP services have ingress NetworkPolicies.

The rendered collector configuration was validated with the v0.165.0 binary. A local test with ClickHouse 26.8.43.13 ingested a CRI stdout fixture, rejected inserts by the Grafana account, and confirmed the table TTL. The gateway accepted logs and recovered its disk queue after a restart while ClickHouse was down.

```text
TTL toDateTime(Timestamp) + toIntervalDay(14)
Ingested CRI stdout log with agent and gateway
Recovered one copy of each test log after ClickHouse outage and gateway kill/restart
```

Production rollout awaits the Vault keys and PR merge. The local exercise used a CRI fixture and skipped Kubernetes API enrichment.
