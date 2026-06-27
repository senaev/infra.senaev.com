# AGENTS.md

This file provides guidance to any AI coding agent working with this repository.

## What this repo is

Personal infrastructure for `infra.senaev.com` — a distributed K3s cluster across multiple VPS providers, managed via Terraform, Helm, and shell scripts. Includes custom microservices and media server automation.

## Issues and investigations

Active incidents, debug sessions, and task work are tracked in [`issues/`](issues/).
See [`issues/AGENTS.md`](issues/AGENTS.md) for the full workflow, file naming convention,
and document structure.

Short version:
- Each file covers one incident or task: `YYYY-MM-DD-<short-slug>.md`
- The file is the source of truth — paste all command outputs and findings there as you go
- Append under `## Findings`; never rewrite earlier sections

## Git discipline

Always ask for explicit user consent before performing any of the following git operations:

- `git add` / staging files
- `git commit`
- `git checkout` / `git switch` (branch changes)
- `git push`

Never stage, commit, switch branches, or push without an explicit request from the user.

## Key conventions

- Full VPN services architecture in [`AGENTS.VPN.md`](AGENTS.VPN.md), human documentation is [`XRAY_VPN.md`](XRAY_VPN.md)
- Worker nodes connect via Tailscale; Tailscale hostnames used throughout (not public IPs)
 - All alerting and operational notifications go to Telegram

## Service Deployment

Each namespace is a Helm chart under `provisioning/helm/<chart>/`. All charts share `provisioning/helm/common-values.yaml` merged at deploy time alongside the chart's own `values.yaml`.

CI deploys via `.github/workflows/update-helm-charts.yml` on push to `main`. It runs a matrix over all charts; each job skips if its chart directory didn't change, otherwise SCPs `provisioning/` to the server, SSHes in to run `upgrade-namespace.sh <chart> <namespace>`, and sends a Telegram notification.

## Secrets Management

Secrets are managed using HashiCorp Vault and the External Secrets Operator.

1.  **Vault:** Secrets are stored in Vault under the `senaev-com-kv` path.
2.  **External Secrets Operator:** The External Secrets Operator is configured to read secrets from Vault and create corresponding Kubernetes secrets.
3.  **Kubernetes Secrets:** The applications running in the cluster can then mount these Kubernetes secrets as environment variables or files.

## Supabase Integration

Supabase is used as a managed Postgres backend.

Credentials (`SUPABASE_PROJECT_URL`, `SUPABASE_PUBLISHABLE_KEY`) are stored in Vault and injected as env vars via the `senaev-com-kv-secrets` Kubernetes secret.

