# Project worklog

## 2026-11-14 18:42 UTC — Migration project initialized

Created branch/worktree `telemetry-madrid-migration` from `origin/main` at `d269c50f` for the requested relocation of Grafana, VM stack and telemetry data. Used existing node name `senaev-madrid`; confirm destination during execution preparation.

Repository inspection returned:

```text
provisioning/helm/telemetry/vm-operator/values.yaml:3:    vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:13:      vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:65:        vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:71:        vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:90:        vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:126:        vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:130:      vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:181:    vps: hetzner
```

These values place central telemetry on Hetzner but do not establish live placement or PVC details. Grafana persistence is enabled; vmagent queue durability needs inspection. No dedicated log/trace backend chart was found under telemetry; the older ClickHouse project is a proposal, not deployment evidence.

Documented inventory, durable collection, backup/restore, staged transfer, ingress dependencies, verification and rollback with post-cutover write reconciliation. No cluster or deployment configuration changed.
