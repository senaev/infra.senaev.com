# 2026-10-13 — Separate Code Tools from OpenCode

## Goal
Move Code Tools into its own pod so it can restart independently of OpenCode and its Telegram bot.

## Context
- `provisioning/helm/senaev-com/templates/opencode-serve.yaml` currently runs both servers in one container.
- Keep the existing `opencode-telegram-git` PVC and `/projects/git` path, the same node selector, one replica and `Recreate`.
- Obsidian Sync is already a separate Deployment.

## Plan
1. Add a dedicated Code Tools image, Deployment, probes and network policy.
2. Remove Code Tools from the OpenCode image and startup.
3. Publish required images before Helm applies the split; support the first deployment.
4. Check rendered Helm resources, existing tests and full repository checks; open a PR.

## Verification
After merge, wait for image builds and Helm rollout. Use public MCP projects/read/search/run; verify both pods mount the same PVC on the same node and independent restarts. Do not restart the cluster while preparing this PR.

## Findings
### 2026-10-13 19:48 UTC — Read-only inspection
The existing Deployment has `replicas: 1`, `strategy.type: Recreate`, no readiness probe, and a ReadWriteOnce PVC. Code Tools already provides `/health` and graceful shutdown. Helm currently does not wait for service image builds.

### 2026-10-13 19:53 UTC — Implementation and verification
- Dedicated `code-tools` image/Deployment/Service; `/health` startup/readiness probes; cluster-helper-only ingress.
- Existing PVC and `/projects/git` retained. Required pod affinity pins Code Tools to OpenCode's node. One replica and Recreate retained.
- OpenCode startup now directly execs its server; its image no longer includes Code Tools. OpenCode ingress is denied; the bot uses localhost.
- Dedicated build workflow and PR-only image checks. Helm waits for checks and image-only builds before applying either split template. First Code Tools build tolerates an absent Deployment; API/connectivity errors still fail.

Verification output:
```text
Rendered Helm resource assertions passed.
Workflow YAML parsed successfully.
OpenCode startup: workdir and direct server exec verified.
Test Files 162 passed (162)
Tests 1258 passed (1258)
```
`npm run simple-checks`: all six checks exited 0. `actionlint` passed for all changed workflows; `git diff --check` passed. No Docker daemon is installed in the MCP pod, so image builds are checked by the PR workflows, without publishing or deploying.

### 2026-10-13 — Registry access refinement
Use the dedicated `code-tools` tag in the existing `ghcr.io/senaev/opencode-serve` package. This keeps the existing cluster pull access instead of introducing a new package whose visibility may require setup. The independent image build and Deployment are unchanged.

## Result
Prepared the split for review on `refactor/separate-code-tools-pod`. No production resources changed. Code Tools updates will be independent of OpenCode, while retaining short Recreate outages, shared working trees and in-memory operation state. Cross-process edit coordination remains necessary.

After merge, verify rollout and topology with:
```sh
kubectl -n senaev-com rollout status deployment/code-tools --timeout=300s
kubectl -n senaev-com rollout status deployment/opencode-telegram --timeout=300s
kubectl -n senaev-com get pods -l 'app in (code-tools,opencode-telegram)' -o wide
```
Then run public MCP projects, read, search and run calls, and test the Telegram bot. Confirm `/projects/git` contains existing repositories in both pods. Any restart test changes cluster state and should be explicitly scheduled; it invalidates Code Tools operation IDs.

### 2026-10-13 — Deployment verified; follow-up cleanup
PR #88 merge commit: `082c48ffb038082a128ba641b51fa6f028910ce6`.
All four workflows completed successfully: Check, opencode-serve, code-tools and Update Helm Charts.
Public MCP projects/read/search/run succeeded; the run hostname is `code-tools-55578c56df-6hcs6`, confirming the separate pod. Obsidian read also succeeded.

Prepare a separate PR to remove both `allow_missing_deployment` and `restart_deployment`.
Extract `build-image.yml` for image-only Helm prerequisites; `build-service.yml` builds then restarts the now-existing Deployment. Also explicitly pull the mutable Code Tools image tag on every restart, preventing stale cached images.

### 2026-10-13 — Scope refined for steady-state operation
Remove all migration-only Helm image planning and prerequisite builds as well as both deployment flags. A separate build-only workflow is therefore unnecessary and is not included in this PR. Keep the existing shared service workflow with strict restart/status calls for an existing Deployment, PR-only image validation, image tag selection, Helm checks/wait and the permanent pod/storage/probe configuration.
Remove the irrelevant OpenCode source trigger from Code Tools PR image checks. Retain `imagePullPolicy: Always` to refresh its mutable non-latest tag.

### 2026-10-13 — Follow-up verified
All six `npm run simple-checks` checks exited 0, including 1258 tests. Actionlint passed across all workflows, Helm lint passed and `git diff --check` passed. No migration flags/planning remain in workflow code or permanent instructions. Code Tools `/health` returned `{"status":"ok"}`.

## Follow-up result
Prepared steady-state cleanup on `refactor/remove-deployment-build-flags` for a separate PR. Deployment monitoring and public MCP checks are complete. This cleanup is not merged or deployed; explicit merge approval is required.
