# LLM workspace on Madrid

Status: completed on 2026-11-14. The senaev workspace runs on `senaev-madrid`
after an intentional fresh start. The user confirmed that everything works.
No migration tasks remain.

## Current configuration

| Workspace | Enabled | Node | Components |
|---|---|---|---|
| senaev | true | senaev-madrid | OpenCode, Telegram bot, OAuth proxy, OMP, auth proxy, Code Tools |
| galkin | true | galkin | OMP and auth proxy |

Every `llmWorkspaces` entry requires an explicit boolean `enabled`. Missing or
non-boolean values fail Helm schema validation. `enabled: false` omits that
workspace's resources; existing PVCs with `helm.sh/resource-policy: keep` survive.

All chart-defined container resource limits are removed from LLM workspaces,
including Galkin. Scheduler memory requests and existing security settings remain.
Physical node capacity and cluster admission defaults still apply.

Public DNS and Traefik remain on Hetzner. Kubernetes Services reach the Madrid
workspace through the cluster network. Datadog's node Agent and APM eligibility
include Madrid.

## Completed work

- [PR #188](https://github.com/senaev/infra.senaev.com/pull/188) added the workspace
  enable flag, disabled senaev for cutover, prepared Madrid placement and Datadog,
  and removed workspace resource limits.
- The user changed the three old Hetzner PVs to `Retain`, stopped the workspace,
  and deleted `senaev-projects`, `senaev-code` and `senaev-omp-web-state` claims.
- Commit `4f1a144e8c46cde43354e2fe3ffd154445590962` re-enabled senaev on Madrid.
  The re-enable deployment succeeded, and the workspace started with fresh storage.
- The user reported deleting the three old Hetzner storage directories,
  `/k3s-cluster/volumes/opencode-data` on Hetzner, and all three old PV records.
- [PR #189](https://github.com/senaev/infra.senaev.com/pull/189) made `enabled`
  required and explicit for both workspaces. Its deployment also succeeded.

## Verification

- Grafana confirmed all three senaev workspace pods on `senaev-madrid`, with
  available replicas and zero container restarts at verification time. Galkin
  also had an available replica.
- Code Tools passed directory listing, file reading, command execution, repository
  cloning, worktree creation, editing, committing and pushing checks through MCP.
- `npm run check:helm` passed. Render checks covered enabled/disabled workspaces;
  schema checks rejected missing and non-boolean enable flags.
- `npm run test:smoke` passed all five public website checks.
- The user subsequently confirmed that everything works, closing the remaining
  functional checks for OpenCode, OMP and Telegram.

## Storage and future moves

The Madrid workspace uses `senaev-projects`, `senaev-code` and
`senaev-omp-web-state` PVCs, plus OpenCode's node-local directory
`/k3s-cluster/volumes/opencode-data`. Local-path requested sizes are not enforced
filesystem quotas.

The old Hetzner data was intentionally deleted. It is no longer a rollback copy;
reverting only the node selector cannot restore the previous workspace.
For a future move that preserves data, stop all writers, back up both PVC data
and OpenCode's host directory, copy and verify the files, then rebind volumes to
the destination before starting the services. Keep recovery copies until verified.
