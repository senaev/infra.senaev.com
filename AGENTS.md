# AGENTS.md

This file provides guidance to any AI coding agent working with this repository.

## What this repo is

Personal infrastructure for `infra.senaev.com` — a distributed K3s cluster across multiple VPS providers, managed via Terraform, Helm, and shell scripts. Includes custom microservices and media server automation.

## ⚠️ Never merge a pull request without the user's approval

**IMPORTANT: Do not merge any pull request until the user approves that pull request.** A merge to
`main` deploys to production. Open the pull request, send the user its link, and wait. Approval
counts for one pull request only: "deploying is okay" for one change does not cover the follow-up
pull requests of the same task, even small fixes or logging changes. Ask again for each one.

## Project flow

Create a project only when the user explicitly asks for one, not automatically for
each request or command. Store it in [`projects/`](projects/) as a folder
`YYYY-MM-DD-HH-mm-<short-slug>/`, using the UTC creation date and time.
Keep existing folders unchanged. Follow [`projects/AGENTS.md`](projects/AGENTS.md)
for the folder layout, the main document, the status and the worklog.

## Main checkout and worktrees

Never change anything in the main checkout of this repository: no edits, commits, branch
switches or stashes. It stays on `main`, and several agents use it at the same time. Use it only
to pull `main` and to add or remove worktrees. Do every task in its own worktree, made from the
latest `main`.

## Sensitive nodes: `proxmox`, `senaev-media`, `proxmox-madrid` and `senaev-madrid`

`proxmox` (bare metal) and `senaev-media` (VM 100 on it) are at home, behind the home
router. `proxmox-madrid` (bare metal, Proxmox VE) and `senaev-madrid` (a VM on it) are
in Madrid, behind their own router. There is no remote console and no other way in: they
are reachable only over the tailnet (and each VM also from its Proxmox host over the
LAN). **If we lose network access to them, we cannot recover them remotely, and the
result is an unacceptable loss.**

Be extremely careful with these nodes and their networks:

- Treat any change that can affect their connectivity as high risk: `tailscaled` (restart,
  upgrade, flags, `/etc/default/tailscaled`), firewall, routes, sysctl, network interfaces,
  `k3s-agent` network flags, and anything that touches `tailscale0`.
- Never change two home nodes at the same time. Change one, then confirm that it is
  reachable (`tailscale status` shows `direct`, SSH works) before the next one.
- Never restart `tailscaled` on hetzner (the SSH jump host) while a home node is not
  fully connected: after a restart, peers need the new disco key from the Tailscale
  coordination server, and the home ISP connection to it is unreliable. This caused a
  10-minute outage of senaev-media on 2026-10-05 — see
  [`projects/2026-10-04-k3s-dual-stack-ipv6`](projects/2026-10-04-k3s-dual-stack-ipv6/README.md).
- Tailscale key expiry must stay disabled for every node (admin console, Machines). An
  expired key logs `tailscaled` out; on a home node that means no way in. On 2026-11-04 it
  logged hetzner out and made all workers `NotReady`. `bootstrap-node-networking.sh` fails
  when a node key can expire. A new node needs key expiry disabled right after it joins. See
  [`projects/2026-10-18-16-05-home-development-llm-server`](projects/2026-10-18-16-05-home-development-llm-server/README.md).
- Prefer a change that fails safe: verify the result, keep the old state restorable, and
  give the user a rollback command before running anything risky.
- Ask the user before any such change, even when the rest of the task is already approved.

## Key conventions

- Never run `kubectl` (or `helm` against a cluster) on the local machine: its kube context points at a work cluster, not at this one. To inspect this cluster, ask the user.
- Full VPN services architecture in [`AGENTS.VPN.md`](AGENTS.VPN.md), human documentation is [`XRAY_VPN.md`](XRAY_VPN.md)
- Worker nodes connect via Tailscale; Tailscale hostnames used throughout (not public IPs)
- The cluster is dual-stack (IPv4 primary, IPv6 secondary). k3s takes node IPs from `tailscale0` (`--flannel-iface`), so no node IP is hard-coded. Pod/Service CIDRs live in `provisioning/common/.env` and are fixed at cluster creation — changing them needs a full rebuild. See [`projects/2026-10-04-k3s-dual-stack-ipv6`](projects/2026-10-04-k3s-dual-stack-ipv6/README.md)
- All alerting and operational notifications go to Telegram
- When you show a pull request link to the user, link to its changes page, `https://github.com/<owner>/<repo>/pull/<number>/changes`, not to the main page of the pull request
- Never log a whole request body or other external JSON (webhooks, API payloads). Log only the fields that the code uses, by name: a payload can hold IDs, tokens and personal data that the logs (Datadog, Loki) must not keep

## Service Deployment

Charts live under `provisioning/helm/<chart>/` or grouped as
`provisioning/helm/<namespace>/<chart>/`; the leaf directory is the release name.
Releases in the same namespace deploy sequentially in path order. All charts share `provisioning/helm/global-values.yaml` merged at deploy time alongside the chart's own `values.yaml`. Its values all sit under `global` and are read as `.Values.global.<name>`, because Helm passes only `global` to subcharts.

CI is coordinated by `.github/workflows/deploy.yml`: check → discover affected
images/charts → build and publish images → sync provisioning once → Helm upgrade
and wait for readiness. New top-level `<service>/Dockerfile` files and Helm charts
are discovered automatically; optional service exceptions can be declared in
`.github/deploy-config.json`. Grouped charts derive their namespace from the folder.
See [the deployment guide](.github/README.md) when adding a service.

Services publish and deploy `:latest` with `imagePullPolicy: Always`. After Helm
creates/updates releases, CI restarts workloads using rebuilt images and waits
for rollout readiness. Chart-only updates do not trigger additional restarts.
Common values or upgrade-script changes select every chart.
Runs are serialized across builds and deployment; planning uses the last successful
push deployment to include changes from replaced pending runs.

### Verify services with monitoring MCP tools

When Datadog MCP or Grafana MCP tools are available, use their read-only metrics,
logs and deployment information to check this personal infrastructure. Scope queries
to the affected services and the relevant time window.

For any change requiring post-CI/CD or post-deployment verification, wait for the
relevant CI/CD or deployment to finish, then inspect the available signals for
deployment readiness, service health, restarts and errors in logs. Combine these findings with the relevant smoke tests below; a successful CI/CD
run alone does not establish service health. Report what was verified, any problems
found, and any checks that the available tools could not perform.

### Network speed between nodes (iperf3 monitor)

The iperf3 monitor measures throughput between node pairs; use it before adding a new speed
check. Config: `iperf3Monitor` in `provisioning/helm/telemetry/vm-stack/values.yaml`, code in
`files/iperf3-agent/` and `files/iperf3-scheduler/`, Grafana dashboard `iperf3.json`.

- An agent with an iperf3 server (port 5201) runs on each node of `sourceVpsList`. The
  scheduler on senaev-madrid runs the `tests` pairs one by one, 300 s apart; each test is
  `iperf3 -c <target> -t 10 -b 20M`, so the source sends to the target, capped at 20 Mbit/s.
- Targets are node names that resolve to Tailscale addresses (100.x), so the traffic is
  WireGuard over UDP on the tailnet, not a public TCP connection. It can differ from what a
  public TCP/TLS connection (for example the VPN) gets on the same path.
- Metrics in VictoriaMetrics, by `source` and `target`: `iperf3_received_bits_per_second`,
  `iperf3_sent_bits_per_second`, `iperf3_retransmits`, `iperf3_test_failures_total`,
  `iperf3_tests_total`. Agent logs `🔎 Target resolution` show the address that was tested.
- To measure a new direction, add a `source`/`target` pair to `tests`; both nodes must be
  in `sourceVpsList`.

### Smoke test after a deploy

Run `npm run test:smoke` from the repository root, always through npm. It checks that the
public websites answer, and needs no cluster access. The list of URLs is in
`scripts/smoke-test-websites.test.ts`.

For the Obsidian MCP connector, ask ChatGPT to read a note, search the vault and add a diary
record, then check the `📓 Obsidian MCP message` logs of cluster-helper.

For the code MCP connector, ask ChatGPT to list a folder under `/code`, then check the
`🧑‍💻 Code MCP message` logs of cluster-helper.

For the Grafana MCP connector, ask ChatGPT to list the Grafana dashboards and to query `up`
for the last hour, then check the `📈 Grafana MCP message` logs of cluster-helper.

For the Telegram MCP connector, ask Claude Code to send a short Markdown message to the
`owner` channel, then check that it arrived and the `✉️ Telegram MCP message` logs of cluster-helper.

## MCP endpoints

cluster-helper serves four OAuth-protected MCP endpoints on `mcp.senaev.com`, with one
authorization server on `auth.senaev.com` (`cluster-helper/src/oauth/`). The list of endpoints
and their wiring are in `cluster-helper/src/mcpEndpoints.ts`, tested by `mcpEndpoints.test.ts`:

| Path | Server |
|---|---|
| `/obsidian` | cluster-helper itself: the obsidian-* tools, forwarded to obsidian-sync |
| `/code-tools` | cluster-helper itself: the code-* tools, forwarded to code-tools |
| `/grafana` | proxied to `mcp-grafana` (`provisioning/helm/telemetry/vm-stack/templates/mcp-grafana.yaml`) |
| `/telegram` | cluster-helper itself: `telegram-send_message`, posted by the senaev.com bot |

The Telegram MCP has one tool, `telegram-send_message(channel, text)`: `text` is Telegram Rich
Markdown (`sendRichMessage`, up to 32000 characters), sent unchanged. `channel` is a name from
the allowlist `cluster-helper/src/telegramMcp/telegramMcpChannels.ts` (`owner`, `cluster`,
`media-server`, `vpn-subscription`, `obsidian-tasks`, `tricky-dad`, `job-search-framework`), which maps each name to the
chat id that cluster-helper already has in its env. The client never sees a chat id: the tool
list shows only the names, and a Telegram error has the chat id replaced with the name. To add
a chat, add an entry there; the bot must be in the chat (an admin in a channel). A chat that only
receives posts also goes into `cluster-helper/src/ignoredChatsWhitelist.ts`, or each message in it
logs `Received Telegram message from unexpected chat`.
The tool description (`TELEGRAM_RICH_MARKDOWN_SYNTAX`) lists the syntax checked in Telegram:
`==highlight==`, `||spoiler||` and `>` quotes; a single newline is joined into the line before it.

Each endpoint is its own OAuth resource (RFC 8707): the token `aud` is the resource that the
client asked for, and a token for one endpoint is rejected by the others. All of them share the
same login and authorization server. `/obsidian` is the default resource for a client that sends
none. The only login is Google: a verified Gmail address listed in Vault `GOOGLE_OAUTH_ADMIN_EMAILS`.
The username and password login was removed on 2026-11-17; that changed the token signing key
(now derived from `AUTH_TOKEN_SIGNING_SECRET` alone), so every earlier token stopped working and
each client (ChatGPT connectors, Claude Code, OpenCode) must log in again with Google. Google
blocks its sign-in in embedded webviews (`disallowed_useragent`): open the login link in the
system browser. ChatGPT needs one connector for each endpoint. The combined `/chat-gpt` endpoint was
replaced by `/obsidian` and `/code-tools` on 2026-11-16.

There is no client registration: the allowed clients are hard-coded in
`authorizationServer.ts` by their Client ID Metadata Document URL — ChatGPT, OpenCode
(`https://opencode.ai/oauth/opencode/client.json`, loopback redirect on any port) and Claude Code
(`https://claude.ai/oauth/claude-code-client-metadata`, `http://localhost:<port>/callback` or
`127.0.0.1`; Claude Code sends this client id only with that loopback redirect). One more client
is static: OpenCode of the senaev workspace uses its public callback, and OpenCode sends its CIMD
client id only when no `redirect_uri` is configured, so each cluster-helper server in `opencode.mcp`
sets `oauth.client_id: opencode.senaev.com`, allowed only with
`https://opencode.senaev.com/auth/mcp/callback`.

`mcp-grafana` runs in the telemetry namespace as part of the vm-stack release, alongside Grafana. cluster-helper calls `http://mcp-grafana.telemetry.svc.cluster.local:8000/mcp`; its cross-namespace NetworkPolicy requires both namespace senaev-com and pod label app=cluster-helper. `mcp-grafana` has Editor rights in Grafana. Its init container logs in with the Grafana admin
and creates the `mcp-grafana` service account and a new token on every pod start, so there is
no manual step on a new cluster. The `watch-service-account-token` sidecar checks the token every
minute and makes a new one if Grafana rejects it (for example after Grafana lost its database);
`mcp-grafana` reads the token file on every call, so it needs no restart. Only cluster-helper can reach its MCP port through the NetworkPolicy; no public ingress or shared internal bearer token is configured. OAuth is checked by cluster-helper, which strips client credentials before proxying. See
[`projects/2026-10-18-15-00-grafana-mcp-for-chatgpt`](projects/2026-10-18-15-00-grafana-mcp-for-chatgpt/README.md).

## LLM endpoint

cluster-helper serves an OpenAI-compatible API for the models that run in the cluster, on
the public port with no host constraint: `https://api.senaev.com/llm` from outside and
`http://cluster-helper:3000/llm` inside (n8n is allowed by the NetworkPolicy). Routes:
`GET /llm/models` and `POST /llm/chat/completions`; the body and the answer (also SSE) pass
through unchanged. One API key for all clients, Vault `LLM_ENDPOINT_API_KEY`, checked
before the body is read. The model list is `cluster-helper/src/llm/llmEndpointModels.ts`.
See [`projects/2026-11-06-10-23-personal-llm-connector`](projects/2026-11-06-10-23-personal-llm-connector/README.md).

## Alerting heartbeat

vmagent, VMSingle, vmalert and Alertmanager all run on senaev-madrid, so when that node or the
stack is down no alert can fire. A dead man's switch covers this: the always-firing
`alerting-heartbeat` rule (`provisioning/helm/senaev-com/templates/alerts.yaml`) is true only
while node-exporter samples are fresh, and Alertmanager sends it every minute to
`POST /alertmanager/heartbeat` on the internal port of cluster-helper, which runs on hetzner.
When no heartbeat arrives for 5 minutes, cluster-helper posts `🚨 Alerting is down` to the
cluster Telegram chat once, and `✅ Alerting recovered` when heartbeats return
(`cluster-helper/src/alerts/alertingHeartbeatMonitor.ts`). After a cluster-helper restart it
waits 5 minutes before judging. It does not cover an outage of hetzner itself.

## Telegram public API

`POST https://api.senaev.com/telegram-public-bot-api/<method>` with a JSON body is a thin proxy
to the Bot API of the senaev.com bot, for scripts outside the cluster and the tailnet: the body
goes to `https://api.telegram.org/bot<token>/<method>`, only the token is added, and the answer
comes back unchanged. JSON only, up to 1 MiB. All methods and chats are allowed. Clients send
`Authorization: Bearer <secret>`, Vault `TELEGRAM_PUBLIC_API_SECRET`, checked before the body
is read. Code: `cluster-helper/src/telegramPublicApi.ts`. See
[`projects/2026-11-12-14-15-public-telegram-notification-path`](projects/2026-11-12-14-15-public-telegram-notification-path/README.md).

## Shared Toolchain

The root `package.json` is not a workspace root. It is a private manifest that owns the
shared toolchain — eslint, vitest, typescript, `@types/node`, lefthook — while every package
keeps its own dependencies and its own lockfile. Packages are still built and deployed one
by one, and Docker build contexts stay per-package.

Run all checks from the repository root; the packages have no check scripts of their own:

```
npm run simple-checks   # all checks below at once, concurrently -- what the pre-push hook runs
npm run lint            # eslint, one root eslint.config.mjs for all packages
npm run typecheck       # tsc --noEmit per package, in sequence
npm test                # fast unit suite (100 ms per-case target, not a hard timeout)
npm run test:integration # real filesystem/process/worker and dependency integration coverage
npm run test:all         # both suites; this is the CI/pre-push test gate
npm run check:python    # syntax of every *.py file (ast.parse, writes no __pycache__)
npm run check:shell     # syntax of every *.sh file (sh -n for #!/bin/sh scripts, else bash -n)
npm run check:helm      # helm lint of every chart, with global-values.yaml + its values.yaml
```

The three `check:*` scripts are in `scripts/check-syntax.sh`. They find files with `git ls-files`,
so a new file is checked without a config change, also before it is first committed. They need
`python3`, `bash` and `helm` on the `PATH`; the GitHub `ubuntu-latest` runner has all three.

`simple-checks` runs the other scripts with `concurrently`, so it takes about as long as the
slowest one instead of their sum. Output is streamed live behind a coloured `[lint]`,
`[typecheck]`, `[test]` or `[check:*]` prefix, and a timings table is printed at the end. Every
check runs to completion even when another fails, so one push reports every problem at once;
the exit code is non-zero if any of them failed.

The concurrent check limits Vitest to half the available CPUs so native worker and
child-process tests can make progress alongside lint and typecheck. Standalone
`npm test` and `npm run test:all` continue to use all available CPUs when run alone.

Because there is no workspace hoisting, typed linting, `tsc` and the tests each need the
package's own `node_modules`. A fresh clone therefore needs `npm ci` at the root **and** in
every package. `npm run ci:all` (`scripts/ci-all.sh`) does both, for every folder with a
committed `package-lock.json`; `.github/workflows/check.yml` runs it too.

Config lives at the root: `eslint.config.mjs` (React rules scoped to senaev-utils),
`tsconfig.base.json` and `vitest.config.mts`.

`vitest.config.mts` reuses thread workers only for an explicit allowlist of pure
`senaev-utils` tests in the `senaev-utils-pure` project. Keep tests with module mocks,
environment mutations, DOM, filesystem or process behavior in the isolated project.
Review isolation requirements before adding tests to an allowlisted directory.
Use `npm run test:all -- --project='senaev-utils*'` to run all library projects.

Integration files end in `.integration.test.ts`; all others belong to unit projects.
Keep real filesystem security, atomicity, process signals and worker cancellation in
the integration suite. Higher-level code/vault file tests use the synchronous diff
core as a double for native workers, keeping actual diff output and cooperative
cancellation checkpoints; the library integration suite still tests real workers.
Do not mock the behavior being asserted. CI and pre-push always run `test:all`.

### Test design and runtime

Every new or modified unit test must be designed to pass in **less than 100 ms**,
including its per-test setup and cleanup. Investigate cases above that budget with
standalone Vitest duration reports before considering the work complete.

- Mock external services, network calls, subprocesses, workers and other expensive
  collaborators when their real implementation is not the behavior being asserted.
- Use fake timers for delays, retries, timeouts and polling. Advance the clock to
  explicit boundaries; use controlled promises for synchronization instead of sleeps.
- Use the smallest representative fixtures that cover the relevant boundaries.
  Reuse immutable expensive fixtures, but keep mutable test state independent.
- A test that checks file permissions must not expect a fixed mode: the umask of the
  runner trims the mode given at creation (the Claude Code and OMP containers use
  `umask 077`). Compare with the file's own mode before the action, or set the mode with
  `chmod`, which ignores the umask.
- Never mock the function or behavior under test, remove assertions, skip coverage,
  or increase timeouts merely to meet the budget.
- When real cryptography, filesystem safety, process behavior or large stress inputs
  are essential and cannot fit the budget, keep that coverage in an explicitly
  documented integration test and retain fast unit coverage of the surrounding logic.
  Moving a test is not a runtime optimization: report integration durations too.

The 100 ms budget is a test-design requirement, not a brittle wall-clock timeout:
shared CI load can affect measurements. Measure slow cases in isolation to distinguish
unnecessary work from scheduling contention, then fix the cause.

Every package extends `tsconfig.base.json`, so the library is held to the same strictness as
the services — including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
senaev-utils overrides only `module`, `moduleResolution`, `esModuleInterop` and `lib`,
because browser bundlers compile it too.

`.github/workflows/check.yml` gates the coordinated deployment workflow and npm
publishing. Deploy checks every push and pull request; PRs build affected images
without publishing or accessing the cluster.

### Git hooks

`core.hooksPath` on this machine points at Datadog's managed global hooks, so plain
`lefthook install` fails with a permission error. The global `pre-push` scans for secrets and
then chains into the repo-level hook, so both can coexist — install lefthook into
`.git/hooks` without taking the global path over:

```
git config --local core.hooksPath .git/hooks
npx lefthook install
git config --local --unset core.hooksPath
```

Never leave `core.hooksPath` overridden: that silently disables the managed secret scanner
for this repository.

Lefthook also installs a `post-checkout` hook, `scripts/post-checkout.sh`: `git worktree add`
runs `npm run ci:all` in the new worktree, so it is ready for the checks. Git runs this hook on
every checkout, so the script acts only when the previous HEAD is the all-zeros commit, which
happens only in a new worktree. Skip it with `SKIP_WORKTREE_INSTALL=1` or
`git worktree add --no-checkout`. A new worktree has no `node_modules` yet, so the `lefthook`
setting in `lefthook.yml` makes the hooks call the lefthook of the main checkout when the worktree
has none: the main checkout needs its `node_modules`. Lefthook rewrites the shared hooks from the
`lefthook.yml` of the worktree that runs them when its checksum differs, so a hook run in a
worktree without this setting drops it, and the next new worktree prints "Can't find lefthook"
and installs nothing; a hook can also fail once while it rewrites itself. Both stop once every
worktree has the same `lefthook.yml`; until then run `npx lefthook install` in an up-to-date one. Hooks are shared by all worktrees, but a worktree created from
a commit before this hook has no `post-checkout` entry in its `lefthook.yml`, so nothing runs
there. If the managed global hooks do not chain `post-checkout` into the repo-level hook, it
does not run on that machine; then run `npm run ci:all` by hand.

## Shared Package: senaev-utils

`senaev-utils/` holds the shared TypeScript library, moved here from its own repo with its full history. It ships raw source (`files: ["src"]`, no build step), so consumers import the TypeScript directly.

The services in this repo consume it **by path**: `"senaev-utils": "file:../senaev-utils"`, which npm links as a symlink into `node_modules`. A change to `senaev-utils/` is therefore picked up immediately, with no version bump and no publish step in between.

It is **also published to npm**, because `supabase-list-notes` lives in a separate repo and pins an exact published version. `.github/workflows/publish-senaev-utils.yml` lints, tests and typechecks it, then publishes `1.0.0-ci.<run_id>.<attempt>` under the `ci` dist-tag on every push to `main` that touches `senaev-utils/**`. That external consumer is why publishing stays on npm, and why the package must keep `@types/node` in `dependencies` and must not raise `engines.node` past `>=18`.

Services linking the library use the repository root as their Docker context.
The planner rebuilds packages declaring a `senaev-utils` dependency when the
library changes. The root `.dockerignore` keeps that context small; services
must not carry their own. Context exceptions are declared in the deployment config.

Publishing uses npm **trusted publishing** (OIDC, no token). The trusted publisher on npmjs.com is bound to both the repository and the workflow filename, so renaming either breaks publishing until it is updated.

## Secrets Management

Secrets are managed using HashiCorp Vault and the External Secrets Operator.

1.  **Vault:** Secrets are stored in Vault under the `senaev-com-kv` path.
2.  **External Secrets Operator:** The External Secrets Operator is configured to read secrets from Vault and create corresponding Kubernetes secrets.
3.  **Kubernetes Secrets:** The applications running in the cluster can then mount these Kubernetes secrets as environment variables or files.

## Supabase Integration

Supabase is used as a managed Postgres backend.

Credentials (`SUPABASE_PROJECT_URL`, `SUPABASE_PUBLISHABLE_KEY`) are stored in Vault and injected as env vars via the `senaev-com-kv-secrets` Kubernetes secret.


## Code Tools and OpenCode

Code Tools has its own image (`code-tools/Dockerfile`,
`ghcr.io/senaev/code-tools`), Deployment and Service
(`provisioning/helm/senaev-com/templates/llm-workspace/_code-tools.tpl`). OpenCode and its Telegram
bot stay in the `senaev-opencode-telegram` Deployment. Both pods, OMP and Claude Code mount the
workspace's `senaev-code` PVC at `/code`; only OMP also mounts its `senaev-projects` PVC at
`/projects`. The workspace `vps` node selector puts them on one node. Code Tools and OpenCode use one replica
and `Recreate`; a Code Tools update still has a short outage and loses in-memory operation IDs.

The code tools take absolute paths and work in any folder. The repository layout under
`/code` (`projects/<repo>` and `worktrees/<repo>/<branch>`) is described only in the
workspace instructions, `/AGENTS.md`. The PVCs use `local-path`, which does not enforce their
size: worktrees with their own `node_modules` use the node's root disk. LLM workspaces have no container resource limits; scheduler memory
requests remain. To preserve node-local data when moving nodes, copy it and rebind PVCs;
see `projects/2026-11-14-21-40-llm-workspace-madrid/README.md`.

OpenCode 2 serves its built-in web UI at `https://opencode.senaev.com` through the
existing Traefik ingress. Native authentication uses Vault `OPENCODE_PASSWORD` via
the separate `senaev-opencode-auth` secret; the Telegram client uses the same password over
localhost. Config and state persist
in the existing node-local data volume; health probes authenticate against `/api/info`.
See `projects/2026-10-30-11-04-opencode-v2-web-migration/CUTOVER.md` before cutover.

The shared working trees have no cross-process locking: coordinate edits between
OpenCode and Code Tools. Do not enable overlapping Code Tools replicas without
addressing operation routing and filesystem coordination.

Code Tools is discovered by the coordinated deployment workflow, with its own
image build and `latest` image. OpenCode and its Telegram bot deploy together after
all affected images are published. Helm handles both first installation and updates;
image refreshes run after Helm in the same coordinated job.

Every workspace requires an explicit boolean `enabled`. `enabled: false` omits
all its rendered resources; existing kept PVCs survive. Both current workspaces
are enabled.

LLM workspace values live in `llmWorkspaces`, and the templates in
`provisioning/helm/senaev-com/templates/llm-workspace/`. The entry name prefixes all
resource names. Each workspace has its own code PVC (`<name>-code`), a projects PVC
(`<name>-projects`, rendered only when OMP is enabled) and instructions ConfigMap (`<name>-instructions`, from `instructionsPath`), and enables any of
OpenCode, OMP, Code Tools, Claude Code and Codex. OpenCode requires `git` and `telegram`; Code Tools
requires OpenCode; Claude Code and Codex require `git`. A new entry inherits nothing from another; the schema is
`provisioning/helm/senaev-com/values.schema.json`.

MCP servers are set per tool, not per workspace: `opencode.mcp` (OpenCode remote servers; the
template adds `type` and the OAuth callback) and `claudeCode.mcp` (a `url` per server). In
`senaev` both have Datadog and Grafana, and only Claude Code also has Obsidian and Telegram. OMP has no MCP servers: its `mcp.json` is written with an
empty list. Code Tools is itself an MCP server and takes none.

OMP runs every command without approval, so it is isolated. It reads its keys only from its
own `<name>-omp-web-env` secret, not from `senaev-com-kv-secrets`, because a node can read
every secret that its pods use. Its NetworkPolicy allows egress only to DNS and the public
internet destinations, excluding private, tailnet and link-local ranges. The same
egress baseline (including workspace Traefik HTTPS on TCP 443) and disabled
service-account token automount apply to OpenCode and
Code Tools through `templates/llm-workspace/_access.tpl`. Preserve each component's
caller-specific ingress. New coding components must include both access helpers.
Standard NetworkPolicy local-node/NAT exceptions and public endpoints mean this
is not complete host isolation. Existing users, credentials and shared storage
are unchanged.
The shared pod helper explicitly sets `seccompProfile.type: RuntimeDefault` for
all coding pods, including their init containers and sidecars. Keep container
overrides from silently disabling this baseline; test debugging and build tools
for compatibility after deployment.

| Workspace | Node | Components | Ingress |
|---|---|---|---|
| `senaev` | senaev-madrid | OpenCode, OMP (`omp.senaev.com`), Code Tools, Claude Code, Codex (no remote control) | traefik-hetzner |
| `galkin` | galkin | OMP only (`omp.galkin.senaev.com`) | traefik-hetzner (DNS points to hetzner) |

Do not rename the `senaev` entry: that replaces its PVCs, and cluster-helper calls
`senaev-code-tools`. Preserve its host data directory.

## Claude Code

The `claudeCode` component (`templates/llm-workspace/_claude-code.tpl`, image `claude-code/`)
runs `claude remote-control` in `/code`, so the Claude mobile app (tab Code) and claude.ai/code
drive Claude Code on the shared `/code` volume. It has no Ingress: Remote Control
makes outbound connections only. The only ingress is the prompt API, from n8n. It is enabled
only in `senaev`.

- The login is the Claude Pro subscription. Remote Control accepts only a full claude.ai login,
  not `claude setup-token`, so no Vault secret holds it. It expires after about 30 days
  (`claude auth status` shows `loginExpiresAt`). Until a login exists the main container waits
  and checks every 30 seconds. Do not set `ANTHROPIC_API_KEY` or `ANTHROPIC_BASE_URL`.
- The `telegram-login` container (`claude-code/telegram-login/`, run by `tsx`, using
  `senaev-utils` for the Telegram calls, the message formatting, the logger and the shutdown)
  renews the login from Telegram. The bot is @senaev_claude_helper_bot, with the
  token in Vault `TG_TOKEN_CLAUDE_HELPER_BOT`. It answers only in the private chat with the user
  `claudeCode.telegram.user` (`TG_SENAEV_USER_ID`; the chat id is the user id). `/auth`
  sends a login link; the user opens it and sends the code from the page back; the bot deletes
  that message. When nobody is logged in it says so once, with no link. From 5 days before
  `loginExpiresAt` it warns once a day. When the workspace enables Codex, the same helper logs
  Codex in (see Codex below). It runs apart from
  Claude Code, which has no approvals, so the bot token is not in that container. Manual login:
  `kubectl -n senaev-com exec -it deploy/senaev-claude-code -c claude-code -- claude auth login`.
- `<clusterRootPath>/volumes/claude-code` (`/k3s-cluster/volumes/claude-code`) is a node folder
  mounted as `HOME`: the login, the trust answers and the session history. It keeps the sessions
  across restarts. Do not delete it. The folder name is fixed in the template, as for OpenCode
  (`volumes/opencode-data`); two workspaces on one node would share it.
- Sessions run without approvals (`bypassPermissions`) as root; `IS_SANDBOX=1` allows this in the
  container. The git token of the workspace is in its env. The SSH key is not in the container:
  the `ssh-agent` sidecar (`templates/llm-workspace/_ssh-agent.tpl`) holds it, and Claude Code
  signs through `SSH_AUTH_SOCK=/ssh-agent/agent.sock`, a read-only mount. The model of new
  sessions is `claudeCode.model`; the phone can change it with `/model`.
- MCP servers: `claudeCode.mcp` of the workspace, a `url` for each server (now Datadog,
  Grafana, Obsidian and Telegram). The template passes them as `WORKSPACE_MCP_SERVERS`, and `start.sh`
  writes them as `mcpServers` in `~/.claude.json` (user scope) on each start, replacing that list:
  a server added by hand is removed. Every server uses OAuth. The CLI login
  (`claude mcp login --no-browser <name>`) redirects to `http://localhost:<port>/callback`, and
  Claude Code has no setting for another redirect URI, so there is no public callback. In
  Telegram, `/mcp` posts a message at once and turns it into the panel: a title and one button for
  each server, by its status in `claude mcp list` — `✅ <name>: log out` when connected,
  `🔑 <name>: log in` when it needs a login, `❌ <name>: log in` when it fails to connect
  (callback data `mcp:logout:<name>`, `mcp:login:<name>`). The dialog works like the torrent search in
  cluster-helper (`sendTelegramEditableMessage`, `editTelegramMessage`): a button press is answered
  with a short notice, and the panel is rewritten in place. Login replies to the panel with its
  own editable message: it runs `claude mcp login --no-browser <name>` under `script` (the CLI
  needs a terminal) and puts the link there. After the login, the browser opens the localhost
  page that does not load; the user sends its address to the bot, which passes it to the CLI and
  deletes the message. The link message then ends with the result, and the panel shows the new
  status. Logout runs `claude mcp logout <name>`. The tokens are in `~/.claude/.credentials.json`
  in `HOME`; new sessions use them. Every 10 minutes the bot posts the panel once when a server
  needs a login; the servers it told about are in `~/.claude/telegram-login/mcp-notices.json`, so a
  restart does not repeat it.
- The prompt API (`claude-code/prompt-api/`, run by `tsx`) runs prompts for n8n in the same
  container: `start.sh` starts it in the background before the login check, then starts Remote
  Control; when either process exits, the container exits and restarts. `POST
  http://<name>-claude-code:8080/run` with `{ "prompt": "..." }` runs `claude -p` without approvals
  in `/prompt-api`, a folder in the container, so that its sessions and scratch files stay apart
  from `/code`; it answers when the run ends with `{ status, result, isError, durationMs,
  numTurns, costUsd }` (`result` is the last message of Claude, in Markdown), 502 when the run
  fails, 409 while another prompt runs. One run at a time, at most 60 minutes. The runs have
  everything the container has: the login, the MCP logins, the git token, the SSH agent and
  `/code`. There is no token: the NetworkPolicy lets only the n8n pod of the namespace reach
  port 8080, and nothing else reaches the pod. The n8n `job-search-round` workflow uses it every
  day at 02:30 UTC: the prompt tells Claude to follow the note `LLM Job Search Round` of the
  Obsidian vault, and n8n sends the answer to the Job Search Framework chat through
  `http://cluster-helper/telegram/send-message` (Telegram Rich Markdown); errors go to the
  cluster chat.
- The Claude Code version is pinned in `claude-code/Dockerfile`. Raise it in a pull request.
- The readiness probe checks only the prompt API, which starts before the login check, so a deploy does not wait for the login.

See [`projects/2026-11-15-18-42-claude-code-remote-control`](projects/2026-11-15-18-42-claude-code-remote-control/README.md).

## Codex

The `codex` component (`templates/llm-workspace/_codex.tpl`, image `codex/`) keeps a Codex CLI
with the ChatGPT login of the user on the shared `/code` volume. It has no Ingress and no Service,
and the NetworkPolicy has no ingress. Enabled only in `senaev`.

- Remote control (`codex.remoteControl`) is **off since 2026-11-20**: the account cannot use it
  yet. The server enrollment fails with `HTTP 403 ... {"detail":"Multi-factor authentication
  required"}`, and the ChatGPT app on Android shows no Codex entry. When it is on, `start.sh` runs
  `codex remote-control --no-daemon` in `/code` (outbound only,
  `wss://chatgpt.com/backend-api/wham/remote/control/server`; device name: the hostname
  `senaev-codex`); that server exits when its first connection fails, and the container restarts.
  When it is off, `start.sh` waits for the login and then only sleeps.
- The login is the ChatGPT subscription; remote control rejects an API key. The `telegram-login`
  container of the claude-code pod logs Codex in, with the same bot and chat as Claude Code: the
  template mounts `<clusterRootPath>/volumes/codex` there and sets `CODEX_HOME`, and the
  claude-code image has the same pinned `codex` CLI (`claude-code/telegram-login/codex.ts`,
  `codexLogin.ts`). `/codex_auth` first checks `codex login status`: when Codex is logged in, it
  answers `✅ Codex is logged in.` with a `🚪 Log out` button (callback data `codex:logout`), which
  runs `codex logout` and rewrites the message; after such a logout the bot starts no login by
  itself until the next `/codex_auth`. When Codex is logged out, it runs `codex login --device-auth` and sends the link
  (`https://auth.openai.com/codex/device`) and the one-time code. Nothing goes back through the
  chat: the CLI waits until the user enters the code on the page, then exits; the bot checks the
  exit code, the text `Successfully logged in` and `codex login status`, and sends
  `✅ Codex is logged in.` or the reason of the failure. The code expires after 15 minutes. Every 10
  minutes the bot checks `codex login status`; when Codex is logged out it starts a login by itself,
  once for each time the login is lost. Manual login:
  `kubectl -n senaev-com exec -it deploy/senaev-codex -c codex -- codex login --device-auth`.
- `<clusterRootPath>/volumes/codex` is mounted as `HOME`; `~/.codex` holds the login, the remote
  control enrollment and the sessions. Do not delete it.
- `start.sh` writes `~/.codex/config.toml` on each start (no approvals, `danger-full-access`, no
  update check, `/code` trusted), replacing changes made by hand, and links `/AGENTS.md` as
  `~/.codex/AGENTS.md`: Codex does not read the `AGENTS.md` of a parent folder outside a repository.
  The remote control module is logged at info (`RUST_LOG`).
- Git as in Claude Code: `GH_TOKEN` in env, the SSH key only in the `ssh-agent` sidecar.
- The Codex version is pinned in `codex/Dockerfile` and `claude-code/Dockerfile`. Raise both in
  one pull request, after a test: the remote control protocol still changes.

See [`projects/2026-11-19-21-17-codex-remote-control`](projects/2026-11-19-21-17-codex-remote-control/README.md).

Secrets in LLM workspaces: an agent can read everything in the container where it runs. Keep
credentials in a sidecar or proxy and give the agent container only a socket or a local
endpoint, as `_ssh-agent.tpl` does for the SSH key in Claude Code, OpenCode, Code Tools and
OMP: only their `ssh-agent` sidecar mounts the key, and the agent container gets
`SSH_AUTH_SOCK`. A new coding component that needs git over SSH uses the same helper. The
inventory and the future tasks are in
[`projects/2026-11-15-21-54-isolate-secrets-from-llm-workspaces`](projects/2026-11-15-21-54-isolate-secrets-from-llm-workspaces/README.md).

## Datadog APM whitelist

The Datadog node agent runs only on the nodes in the `agents` node affinity of
`provisioning/helm/datadog/values.yaml`. APM injection uses the same node list as a whitelist
in `apm.instrumentation.targets`. The admission webhook runs before scheduling and selects
pods only by labels, so a pod with `admission.datadoghq.com/enabled: "true"` must also have a
`vps` label equal to its `nodeSelector.vps`. To enable APM on a node, add it to both lists.


Coding containers and init containers also include
`senaev-com.llmWorkspace.containerAccess` inside their securityContext:
`allowPrivilegeEscalation: false` and `capabilities.drop: ["ALL"]`.
Preserve proxy-specific non-root and read-only settings. New coding containers
must include this helper; container settings cannot be inherited at pod level.
Dropping capabilities can break package scripts that change ownership or switch
users, tracing and privileged operations; validate required workflows.
