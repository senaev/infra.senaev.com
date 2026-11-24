## 2026-11-22 21:35 UTC — Prepared the smaller node agent and startup probe

The user chose the OpenTelemetry Collector Kubernetes `0.165.0` image for the node agents and normal Kubernetes image pulls. The compressed Linux amd64 image drops from about 110 MiB to 49 MiB. The startup probe checks port `13133` every five seconds and allows 24 failures before Kubernetes restarts the container. Both changes are in [PR #287](https://github.com/senaev/infra.senaev.com/pull/287/changes).

The pinned binary validated the rendered configuration with synchronous log emission enabled. In the local upgrade test, the Kubernetes build resumed the Contrib agent's on-disk queue and offsets and delivered 24 queued records and one new record to ClickHouse. All 25 records were distinct. The local test used CRI fixtures and skipped Kubernetes API enrichment. The [PR checks passed](https://github.com/senaev/infra.senaev.com/actions/runs/45072700999).

## 2026-11-22 21:05 UTC — Completed the all-node rollout

[PR #286](https://github.com/senaev/infra.senaev.com/pull/286/changes) expanded the log agent DaemonSet to all seven Linux nodes. Slow image pulls and liveness restarts during startup delayed readiness. Helm reached its five-minute wait limit with six of seven pods updated. The deployment retry succeeded after the agents became ready. [First attempt](https://github.com/senaev/infra.senaev.com/actions/runs/45066157360/attempts/1), [successful retry](https://github.com/senaev/infra.senaev.com/actions/runs/45066157360/attempts/2).

```text
Error: UPGRADE FAILED: resource DaemonSet/telemetry/otel-agent-agent not ready. status: InProgress, message: Updated: 6/7
context deadline exceeded
```

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
