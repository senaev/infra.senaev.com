# 2026-10-30 — Pi integration with a web interface

- [ ] Add a Pi integration with a web interface using the existing repositories.

## Goal

- Use the Pi engine.
- Provide a web interface.
- Use the same persistent volume claim and the same repositories as the existing OpenCode setup.

## Findings

### 2026-10-30 — Project created

Requirements recorded. This project is deferred while work focuses on OpenCode.

### 2026-10-30 — OMP and OMP Web implementation plan

This updates the original Pi requirement: use upstream OMP (oh-my-pi) and
[kahme247/ompweb](https://github.com/kahme247/ompweb), without maintaining a harness
fork. Implementation is pending; this entry records the proposed design.

#### Architecture

- Build one Debian-based image containing pinned OMP, pinned OMP Web, Node.js 24,
  Bun as required by the selected OMP release, and the coding tools already used in
  [opencode-serve/Dockerfile](../../opencode-serve/Dockerfile). Install dependencies
  at build time; disable in-app updates. OMP Web is the main process, with a small
  init for signals and child reaping; it owns OMP RPC subprocesses per session.
- Add an independent one-replica Deployment with Recreate, ClusterIP Service,
  probes, resource limits, and an enable flag in the existing senaev-com Helm
  chart. Run alongside OpenCode for evaluation; do not replace OpenCode or its
  Telegram client in this project.
- Mount the existing opencode-telegram-git PVC at /projects/git. Schedule on the
  same node as its existing consumers, matching the current RWO/local-volume
  arrangement. Coordinate writers across OMP, OpenCode and Code Tools; sharing
  checkout files does not provide locking.
- Persist the complete OMP home (~/.omp), including sessions, auth database,
  settings, plugins and OMP Web state, in a separate dedicated data volume on that
  node. Keep runtime state writable; seed defaults only when absent. Do not put
  OMP state into OpenCode's config/state directories.
- Reuse Git identity and scoped GitHub/SSH credentials through existing Vault /
  External Secrets patterns. Inject only the secrets the service needs. Match
  workspace ownership; do not recursively change permissions on shared repos.

#### Authentication and ingress

- Proposed hostname: omp.senaev.com, using existing Traefik HTTPS and Basic Auth
  middleware patterns. DNS is a deployment prerequisite.
- OMP Web must listen on the pod network for a Kubernetes Service; loopback-only
  advice does not apply across pods. Verify the selected release's bind checks.
- Use Traefik Basic Auth followed by trusted-header injection: configure OMP Web's
  OMP_WEB_PASSWORD_HASH and OMP_WEB_TRUSTED_HEADER_SHA256; Traefik overwrites
  X-Omp-Web-Auth with a random secret only after successful Basic Auth. This gives
  one browser login while keeping the app's non-loopback listener authenticated.
  Store proxy secret and hashes through Vault/External Secrets; do not commit them.
- A NetworkPolicy permits the web port only from the existing Traefik pods.
  No NodePort or public pod port. Verify middleware secret handling before
  implementation; never render a secret value from Helm values into Git.
- Forward streaming connections with suitable timeouts/buffering settings.
  Restrict the route to the exact hostname and verify origin/host behavior.

#### Implementation sequence

1. Compatibility spike: choose and record exact OMP/OMP Web versions; verify
   rpc-ui, new sessions, model switching, extension questions, background-agent
   lifecycle and the trusted-header flow. Confirm whether browser disconnects
   keep work running; do not confuse persisted history with crash recovery.
2. Add the image, minimal startup/config seeding, Helm resources and auth wiring.
   Add the service to the existing reusable image-build/release workflow; avoid
   unrelated CI refactoring.
3. Translate current OpenCode providers/models, instructions, MCP endpoints,
   commands, skills and tool permissions into OMP equivalents. Inventory and
   document unsupported settings; do not copy config files blindly or promise
   OpenCode transcript migration. Provider OAuth may need a fresh login.
4. Build and smoke-test the image, lint/render Helm, and open an implementation
   PR. Deploy only through the repository's normal approved workflow.
5. After CI/deployment, verify through the browser and available Datadog/Grafana
   logs and metrics. Record versions, remaining gaps and rollback instructions.

#### Acceptance and rollback

- From a phone/browser: authenticate once, select a project, create/resume/fork
  sessions, change model and reasoning level, edit files, run checks, and use MCP.
- Confirm streamed output, cancellation, subagent updates, completion notices,
  SSH/GitHub operations and required custom extensions.
- Close/reopen the browser during work. Separately restart the pod and confirm
  stored sessions, credentials and settings survive; document interruption of
  running commands/agents rather than claiming automatic recovery.
- Confirm unauthenticated ingress and forged trusted headers fail, direct
  non-Traefik access is blocked, and probes do not require a model request.
- OpenCode, Telegram and Code Tools must continue working. Revert the Helm/image
  change to roll back; retain OMP state and shared repositories. Back up OMP state
  before upgrades because rolling back an image may not reverse state migrations.

References: [OMP RPC](https://omp.sh/docs/rpc),
[OMP Web deployment/authentication](https://github.com/kahme247/ompweb),
[current deployment](../../provisioning/helm/senaev-com/templates/opencode-serve.yaml).

### 2026-10-30 — Implementation and review

The user authorized implementation and excluded coordination between agents from
this project. The implementation uses upstream OMP 18.14.0 and OMP Web 0.6.0 in one
custom image, with a same-pod nginx sidecar and Traefik Basic Auth. This supersedes
the trusted-header plan: Traefik header middleware cannot reference a Secret
directly, whereas loopback avoids a second password and secret distribution.

OMP now uses the checksum-verified binary instead of the npm source dependency
tree. Separate state and shared repository PVCs, one replica/Recreate, conditional
ingress, probes, minimal credentials and an ingress NetworkPolicy are implemented.
The feature remains disabled pending image publication, DNS and a Vault htpasswd
entry. OpenCode and its Telegram client are unchanged.

See [deployment, migration and acceptance steps](../../omp-web/README.md). Runtime
compatibility, enabled/disabled Helm rendering, repository checks and PR image
build results will be recorded below. Workstation-only OpenCode plugins and
transcripts are explicitly not claimed as migrated.

Review iterations simplified the runtime to a verified binary and a loopback
proxy; retained the state PVC on disable; pinned and verified Helm/yq downloads;
and made seeded configuration owner-writable with private state directories.
The seeded files are required on first boot, avoiding a silent fallback to OMP's
default approval mode if a configuration mount is missing.

Runtime smoke passed: browser API session creation, Haiku-to-Sonnet selection,
a harmless shell command, and role settings retained after a web-server restart.
No model API request was made. OMP intentionally does not materialize empty
conversations before an assistant message; real transcript recovery remains a
post-deployment check. Both chart modes render, and the enabled chart lints.

Local lint, typecheck, Python/shell syntax and default/enabled Helm checks passed.
The first full suite passed 1660/1661 tests; an unchanged CSV validation test hit
its real subprocess deadline under load. Its complete file passed 34/34 tests on
isolated rerun. The normal pre-push hook and PR CI remain required.

## Result

Implementation is prepared on a branch for review; no merge or deployment has
been performed. Activation requires DNS, the Vault Basic Auth entry, image
publication and enabling the chart flag, followed by the browser/monitoring
acceptance checks in the service README.

### 2026-10-31 — Activation prerequisites and CI review

The user created DNS and the Vault Basic Auth field. DNS for omp.senaev.com
resolves to the same address as opencode.senaev.com. All initial PR build/test
checks passed, including the image smoke test and proxy validation.

Review follow-up limits image releases to image/workflow changes, preserving
chart validation on pull requests. Missing deployments now fail for existing
services; OMP Web alone opts into the first-image bootstrap exception. The
root runtime remains the documented trusted-user choice because existing shared
repositories are root-owned; changing their permissions is outside this task.
Activation remains separate: merge/publish first, then enable the chart. No
Vault secret value has been read or printed and no merge has been performed.

### 2026-10-31 — Remove the additional deployment validation job

At the user's request, removed the OMP-specific validate-deployment job and its
build dependency, and removed chart-only triggers from the image workflow.
Standard repository/Helm checks and the image's runtime smoke test remain.

### 2026-10-31 — Manual first deployment

The user will perform the first deployment manually. Removed the missing-
deployment exception and its input entirely, restoring build-service.yml to
the main-branch version. Subsequent image releases use normal rollout restart
and fail when their Deployment is absent.

### 2026-10-31 — Remove the image smoke script

At the user's request, removed omp-web/smoke.py and its Docker build step.
The image copies only start.sh; standard repository checks and manual
post-deployment acceptance checks remain. Earlier smoke-test results above
are historical and no longer describe a build requirement.
