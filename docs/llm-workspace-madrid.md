# Fresh LLM workspace on Madrid

The user chose an empty workspace on Madrid. This PR is the disable stage:
`llmWorkspaces.senaev.enabled: false` omits all senaev workspace resources,
including OpenCode/Telegram, OMP, Code Tools, ingress, policies and secrets.
Galkin remains enabled. Every workspace now requires an explicit boolean `enabled`.
Existing PVCs have `helm.sh/resource-policy: keep` and survive this deployment.

All LLM workspace container resource limits are removed, including Galkin's.
Scheduler memory requests and security settings remain. Madrid placement and
Datadog collection are prepared for the subsequent re-enable deployment.

## Disable and clear claims

1. Merge this PR and wait for deployment using GitHub and an independent terminal:
   disabling Code Tools makes this MCP's code operations unavailable.
2. Verify the senaev-code-tools, senaev-opencode-telegram and senaev-omp-web pods
   have all terminated. Do not delete their claims while writers remain.
3. Confirm the PVs behind senaev-projects, senaev-code and senaev-omp-web-state
   use `Retain` (already set manually by the user). Delete only these three PVCs:

   ```bash
   kubectl -n senaev-com delete pvc senaev-projects senaev-code senaev-omp-web-state
   ```

   The retained PVs and their Hetzner files remain for recovery. Do not delete
   other workspace, legacy, Vault or telemetry volumes.

## Re-enable on Madrid in a separate PR

1. Confirm senaev-madrid is Ready with `vps=senaev-madrid`. Confirm its
   `/k3s-cluster/volumes/opencode-data` is absent or empty; OpenCode uses this
   separate host directory. Leave the old Hetzner directory intact.
2. Set `llmWorkspaces.senaev.enabled: true`, keeping `vps: senaev-madrid`, and
   deploy. The deleted claims are recreated; local-path provisions fresh volumes
   on Madrid. The original retained PVs keep their old claim UIDs and must not
   be cleared/rebound for this fresh start.
3. Verify all three deployments are Ready on Madrid, claims are Bound to Madrid
   PVs, and OpenCode/OMP login, Telegram and Code Tools work. Reclone repositories
   and recreate logins/sessions as needed. Verify Datadog logs/traces, Grafana
   node/pod health and absence of OOMs; run `npm run test:smoke`.

Public DNS and Traefik stay on Hetzner; Services reach Madrid through the cluster.
Physical capacity and admission defaults still apply; inspect live resource limits.

## Recovery

Keep original PVs, files and OpenCode host state until the fresh workspace is
accepted. To recover them, stop all workspace writers first, preserve any new
Madrid work, and explicitly rebind the original retained volumes before deploying
back to Hetzner. Simply reverting the node selector is insufficient once claims
have been recreated on Madrid. Physical storage cleanup is a separate action.
