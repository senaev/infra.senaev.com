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
