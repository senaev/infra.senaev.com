# 2026-10-18 — Self-hosted log storage on ClickHouse

- [ ] Collect and keep all container logs in the cluster in a self-hosted, ClickHouse-based tool, and query them in its UI

## Goal

Today Datadog keeps all logs. We want our own open-source solution in the cluster to
keep and query logs. Use a ClickHouse-based stack (SigNoz, Uptrace or HyperDX), because
it gives a Datadog-like UI and can also take traces and metrics later.

Datadog stays during the evaluation. We decide later whether to turn off Datadog log collection.

## Context

- Datadog Agent chart: `provisioning/helm/datadog/values.yaml`. It collects logs from
  `senaev-media` and `hetzner` only (`containerCollectAll`). See
  `tasks/2026-06-15-connect-datadog-to-my-cluster.md`.
- Metrics stack: VictoriaMetrics + Grafana in the `telemetry` namespace
  (`provisioning/helm/vm-operator/`, `provisioning/helm/vm-stack/`). Operators and
  stateful services are pinned to `hetzner` (`nodeSelector: vps: hetzner`).
- Chart pattern: a thin wrapper chart with a vendored `.tgz` subchart in `charts/`,
  deployed by `upgrade-namespace.sh <chart> <namespace>` and by CI
  (`.github/workflows/update-helm-charts.yml`).
- Ingress pattern: `ingressClassName: traefik-hetzner`, a `letsencrypt` certresolver, and
  basic-auth middleware for admin UIs (see `vm-stack/values.yaml`).
- Secrets: Vault `senaev-com-kv` → External Secrets → `senaev-com-kv-secrets`.
- `senaev-media` is a sensitive home node (see root `AGENTS.md`). A DaemonSet on it must
  not touch the host network. Roll it out to that node last, and only after we ask the user.

## Plan

1. **Tool: [SigNoz](https://github.com/SigNoz/signoz)** (decided 2026-10-18). Use the
   official chart `signoz` from https://charts.signoz.io (0.146.0 on 2026-10-18). It
   deploys ClickHouse, ZooKeeper, the SigNoz backend + UI and the SigNoz OTel collector.
2. **Check capacity on `hetzner`** (read-only): `kubectl top nodes`, `df -h`, free RAM.
   ClickHouse needs about 2–4 GiB RAM and a PVC. Decide the PVC size and the retention
   (proposal: 14 days for logs).
3. **Vendor the chart** into `provisioning/helm/<tool>/charts/` and add a wrapper `Chart.yaml`
   and `values.yaml`:
   - pin ClickHouse, the backend and the UI to `vps: hetzner`
   - disable traces/metrics ingestion that we do not need yet, and set the retention TTL
   - set resource requests/limits
   - Ingress on `signoz.senaev.com`, TLS with `letsencrypt`, and auth
     (the tool's own login, or a basic-auth middleware).
4. **Log collection: a separate OTel Collector DaemonSet** (decided 2026-10-18). Use the
   SigNoz `k8s-infra` chart (0.17.1 on 2026-10-18): the `filelog` receiver on
   `/var/log/pods` and `k8sattributes` enrichment, with logs sent over OTLP to the SigNoz
   collector. Turn off its metrics presets for now. Start on `hetzner` only, then add
   `firstvds`, then `senaev-media` (ask first). The Datadog Agent does not change.
5. **Secrets.** Put the admin password and any ClickHouse credentials in Vault →
   `senaev-com-kv-secrets`.
6. **CI.** Make sure the matrix in `update-helm-charts.yml` picks up the new chart. Run
   `npm run check:helm`.
7. **Alerting (optional).** Send an alert to Telegram when ClickHouse disk usage is high,
   with a vmalert rule or the tool's own alerts through the cluster-helper webhook.

## Verification

- Open the UI at the chosen hostname, log in, and see logs from pods on `hetzner`
  (for example traefik and cluster-helper) within one minute of their creation.
- Filter by namespace, pod and container, and run a full-text search for a known log line.
- Compare a sample with Datadog log search for the same time range: no gaps.
- After the retention period, the oldest logs are removed and ClickHouse disk usage stays flat.
- `senaev-media` stays reachable (`tailscale status` shows `direct`, SSH works) after the
  collector is rolled out there.

## Findings

### 2026-10-18 — Task created

Options compared in chat: VictoriaLogs, Loki, OpenSearch, ClickHouse-based tools,
Quickwit/OpenObserve. The user chose the ClickHouse-based stack.

### 2026-10-18 — Decisions

- Tool: SigNoz (chart `signoz` 0.146.0).
- Hostname: `logs.senaev.com`. *(Changed to `signoz.senaev.com` on 2026-10-18.)*
- Collector: a separate OTel Collector DaemonSet (chart `k8s-infra` 0.17.1). Datadog
  does not forward logs to SigNoz.
