# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Kubernetes Infrastructure-as-Code for a personal multi-VPS cluster (infra.senaev.com). Runs K3s across different nodes connected via Tailscale VPN. Services include a personal website, media server stack, VPN, monitoring, and Kafka-based Telegram integration.

## Deployment Commands

```shell
make                # Full deploy: cluster + all services
make cluster        # Control-plane + worker nodes only
make control-plane  # Bootstrap K3s control-plane (rsyncs files, SSHs in)
make workers        # Connect all worker nodes
make services       # Deploy all K8s namespaces (traefik → secrets → telemetry → senaev-com)
make senaev-com     # Deploy only the senaev-com namespace
make rsync          # Sync provisioning/ to control-plane server
```

All `make` targets read `.env` for server IPs, usernames, and worker configs. The flow is: rsync provisioning files to the control-plane → SSH and run bootstrap scripts → helm upgrade.

## Architecture

### Deployment Pipeline

Local machine → `make` → rsync to control-plane → SSH runs shell scripts → `helm upgrade --install` per namespace. No CI/CD — deployment is manual from a local machine.

### Namespace Layout

| Namespace    | Purpose                                                  | Chart(s)                                                          |
| ------------ | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `traefik`    | Ingress controller (Traefik v3.2, Let's Encrypt ACME)    | `provisioning/helm/traefik/`                                      |
| `vault`      | HashiCorp Vault + External Secrets Operator              | `provisioning/helm/vault/`, `provisioning/helm/external-secrets/` |
| `telemetry`  | Victoria Metrics monitoring (Operator, Grafana, VMAgent) | `provisioning/helm/vm-operator/`, `provisioning/helm/vm-stack/`   |
| `senaev-com` | All application services (15+ services)                  | `provisioning/helm/senaev-com/`                                   |

### Multi-VPS Scheduling

Services are pinned to specific VPS nodes via `nodeSelector` with label `vps=hetzner|yandex-cloud|home`. Each service in `values.yaml` declares its target VPS.

### Secrets Flow

Vault (bootstrap-vault.sh) → External Secrets Operator → K8s Secret `senaev-com-kv-secrets` → Pods. Vault unseal key stored at `/k3s-cluster/vault_unseal_key.json` on the control-plane. Secrets must be manually populated in Vault UI after initial bootstrap.

### Kafka/Telegram Integration

Telegram webhook → `telegram-webhook-endpoint` (Node.js, port 3000) → Redpanda Kafka topic `telegram-webhook-data` → `cluster-helper` consumer → actions (torrent downloads, notifications).

## Key Patterns

- **Adding/modifying a service**: Edit `provisioning/helm/senaev-com/values.yaml` (toggle `enabled`, set `vps`, configure ports/paths), then add/edit corresponding template in `provisioning/helm/senaev-com/templates/`.
- **Namespace deployment**: `provisioning/control-plane/upgrade-namespace.sh <chart> <namespace>` — creates namespace, applies CRDs if present, runs `helm upgrade --install`. Multiple charts can deploy into the same namespace.
- **Bootstrap order matters**: traefik → vault (external-secrets + vault) → telemetry (vm-operator + vm-stack) → senaev-com. The Makefile `services` target enforces this.
- **Shell scripts use `set -euo pipefail`** and source env from `provisioning/common/.env`.

## Project Structure

```
provisioning/
  common/           # Shared .env (K3S_VERSION, K3S_CLUSTER_PATH) and prepare-node.sh
  control-plane/    # Bootstrap scripts (control-plane, vault, secrets, telemetry, upgrade-namespace)
  worker/           # Worker node bootstrap and health check
  helm/             # Helm charts (multiple charts can deploy into one namespace via upgrade-namespace.sh)
scripts/            # Local-side helpers (rsync, worker connection)
Makefile            # Top-level orchestration, reads .env
.env                # Server IPs, usernames, WORKERS JSON array (not committed — use .env.example)
```
