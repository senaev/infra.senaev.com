# AGENTS.md

This file provides guidance to any AI coding agent working with this repository.

## What this repo is

Personal infrastructure for `infra.senaev.com` — a distributed K3s cluster across multiple VPS providers, managed via Terraform, Helm, and shell scripts. Includes custom microservices and media server automation.

## Project flow

Create a project only when the user explicitly asks for one, not automatically for
each request or command. Store it in [`projects/`](projects/) as a folder
`YYYY-MM-DD-HH-mm-<short-slug>/`, using the UTC creation date and time.
Keep existing folders unchanged. Follow [`projects/AGENTS.md`](projects/AGENTS.md)
for the folder layout, the main document, the status and the worklog.

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

## SDLC

### Environment Setup

The main checkout of this repository (`/code/projects/<repo>`) stays on `main`, and several agents
use it at the same time. Never change anything in it: no edits, commits, branch switches or
stashes. Use it only to pull `main` and to add or remove worktrees.

Before any change to the code of the repository, in this order:

1. Pull the latest `main` in the main checkout: `git pull --ff-only origin main`.
2. Create a separate worktree for the task from that `main`:
   `git worktree add -b <branch> /code/worktrees/<repo>/<branch> main`.
3. Make all the changes, run the checks and commit in that worktree only.

Do every task in its own worktree, even a small one. Remove the worktree when its pull request is
merged or closed.

### Implementation (Coding)

When the code is ready and local checks passed, open the pull request and send its link to the user
in the chat. Then, without waiting for an answer, run the Code Review Loop, in a background sub-agent
if you can. When it is finished, tell the user to review the pull request; merging is their decision.

### Code Review

#### Code Review Rules

If you are an agent that does code review of a pull request (for example Codex on `@codex review`),
read [`CODE_REVIEW.md`](CODE_REVIEW.md) and apply every rule in it. Any other agent: do not read
that file.

#### Codex code review

When you open a pull request, and when the user asks for a Codex review, comment `@codex review`.

#### Code Review Loop

**Code Review Loop** is the cycle: request a code review, wait for the result, read and analyze the
feedback, make the changes, and request a code review again. Repeat it until there are no more
reasonable comments, or until the review agents run out of quota or do not respond within 10 minutes.

Reply to every review comment, whether you accept it or reject it. For an accepted comment, say
what you changed. For a rejected one, say why.

### Merging

Never merge a pull request without the user's approval of that exact pull request.

Before merging, read all pull request comments and handle any open ones.

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
  A test can set another cap with `bitrateMbps` (1–1000); FirstVDS ↔ Hetzner use 100.
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

## Internal mTLS between the Node.js services

The calls between our Node.js services use a client certificate, not a token:

| Caller → callee | Port | Allowed caller (`callers.ts`) |
|---|---|---|
| cluster-helper → obsidian-sync (everything that reads or edits the vault) | 8443 | `obsidian-sync/src/server/callers.ts` |
| cluster-helper → code-tools (`senaev-code-tools`, the tool routes) | 8443 | `code-tools/src/server/callers.ts` |
| cluster-helper → media-server-helper (`POST /torrent-files`) | 8443 | `media-server-helper/src/callers.ts` |
| vpn-subscription → cluster-helper (`POST /telegram/send-message`) | 8443 | `cluster-helper/src/callers.ts` |
| cluster-helper → node-shell (`PUT`/`GET /executions/:id`, root commands on the nodes) | 8443 | `node-shell/src/callers.ts` |

cert-manager (`provisioning/helm/pki/cert-manager`) and a private CA (`provisioning/helm/pki/issuers`,
ClusterIssuer `internal-ca`, key only in the `pki` namespace) issue 7-day leaves: `cluster-helper-tls`
(both usages), `obsidian-sync-tls`, `media-server-helper-tls`, `node-shell-tls` (`templates/internal-mtls.yaml`),
`<workspace>-code-tools-tls` (`llm-workspace/_code-tools.tpl`) and `vpn-subscription-tls` (client only,
in the `vpn` release, because a Secret is namespaced). Their common settings are in
`global.internalMtlsCertificate` in `provisioning/helm/global-values.yaml`. The identity is a DNS SAN
`<service>.<namespace>.svc.cluster.local`: a callee knows its callers by that name, and a client
connects to a URL whose host is the callee's name. The URLs are constants in
`cluster-helper/src/mtlsServiceUrls.ts` and `vpn-subscription/src/clusterHelperTelegramApi.ts`.
Every service mounts its Secret as a directory at `/etc/mtls` (never subPath or env),
polls the files and reloads without a restart
(`senaev-utils/src/utils/mtls`). They fail closed: no fallback to HTTP or a token. cluster-helper has
one `createMtlsClient` for each callee (a client sends its certificate to one origin only), all fed
by one `watchTlsCredentials`.

A service with a protected API has a Fastify instance of its own for it: `createMtlsFastifyServer`
(senaev-utils) installs `registerMtlsAuthentication`, which rejects an invalid certificate (401), and the
service adds `registerMtlsCallerAllowlist` (senaev-utils) with its `ALLOWED_CALLERS`, which allows only
those services on every route of that instance (403). The list is for the whole instance, not for a
route. Add new routes only to the function that registers the protected routes of that service
(`registerProtectedVaultRoutes`, `registerProtectedCodeToolsRoutes`, `registerTorrentFileRoutes`,
`registerExecutionRoutes` of node-shell, `createMtlsServer` of cluster-helper), and add a
NetworkPolicy rule for the port. The kubelet cannot present a certificate, so obsidian-sync (8080)
and code-tools (8081, only `/health`) also have a plain HTTP instance for what the kubelet or vmagent
needs; media-server-helper and node-shell have no plain port and no probe.
The shell tools of code-tools run in its container, so they can read the server's private key (accepted).
Three alerts watch the leaves (group `internal-certificates` in `senaev-com/templates/alerts.yaml`):
`certificate-not-ready` (15 min), `certificate-expires-soon` (less than 2 days left; a leaf renews at 3 days)
and `certificate-metrics-unavailable`. They read the cert-manager metrics, which the `cert-manager`
`VMServiceScrape` in the `vm-stack` chart scrapes from the `pki` namespace.
The `pki` namespace must sort before `senaev-com` (the CI deploys namespaces in sorted order). To replace
the CA, see
[`projects/2026-11-15-11-00-inter-service-certificate-authentication`](projects/2026-11-15-11-00-inter-service-certificate-authentication/README.md).
The second project, [`projects/2026-11-22-01-00-mtls-between-node-services`](projects/2026-11-22-01-00-mtls-between-node-services/README.md),
added the other three edges. Calls from n8n, Alertmanager, qbittorrent, vmagent, Traefik and the kubelet cannot
present a certificate and stay plain HTTP (cluster-helper `:80`, obsidian-sync `:8080`).

## Node shell

`node-shell` (`node-shell/`, template `senaev-com/templates/node-shell.yaml`) runs commands as root on
the cluster hosts, for the Telegram-approved node commands of
[`projects/2026-11-15-10-44-approved-node-commands`](projects/2026-11-15-10-44-approved-node-commands/README.md).
It is the most privileged workload: one pod on hetzner, `privileged` with `hostPID`, that enters the
host with `nsenter --target 1 --all`. A command for hetzner runs there; a command for another host goes
through `ssh` from hetzner with the SSH key of its root, which every host accepts (`nodeShell.sshDestinations`
lists them; an unlisted host is refused). On the target, each command runs in a transient systemd unit
`node-shell-<executionId>` with `RuntimeMaxSec`, which kills everything it started at the timeout.
The unit's description is `node-shell <executionId>`, never the command, so the command stays out of the
host journal; each `$` of the command is passed to systemd as `$$`, so `/bin/sh` gets it unchanged.

- No `hostNetwork`: the API is mTLS on 8443, only for cluster-helper (NetworkPolicy and `callers.ts`). The
  pod network has no egress at all; ssh uses the host's network.
- It does not ask for approval: cluster-helper must ask the user before `PUT /executions/:id`
  (`{ host, command, timeoutSeconds ≤ 3600 }`), which answers 202 at once. `GET /executions/:id` gives
  the status (`running`, `completed`, `failed`, `interrupted`), the exit code and up to 1 MiB of each
  output stream. Exit code 255 can also be ssh's own error (for example, an unreachable host).
- An execution ID runs at most once. Its record is a file in `<clusterRootPath>/volumes/node-shell`,
  created before the command starts and kept 24 hours; a repeated `PUT` returns it, the same ID with
  another request is 409. After a restart, a record still `running` becomes `interrupted`, never retried.
- At most 4 commands at once (429). The logs have the execution ID, host, status and exit code, never the
  command or its output.
- Not done yet: the Telegram approval and the `submit`/`status` API in cluster-helper, and the workspace skill.

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

Config lives at the root: `eslint.config.mjs` (React rules scoped to nextjs-app and senaev-utils),
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

## Shared Package: senaev-utils

`senaev-utils/` holds the shared TypeScript library, moved here from its own repo with its full history. It ships raw source (`files: ["src"]`, no build step), so consumers import the TypeScript directly.

The services in this repo consume it **by path**: `"senaev-utils": "file:../senaev-utils"`, which npm links as a symlink into `node_modules`. A change to `senaev-utils/` is therefore picked up immediately, with no version bump and no publish step in between.

It is **also published to npm**, because `supabase-list-notes` lives in a separate repo and pins an exact published version. `.github/workflows/publish-senaev-utils.yml` lints, tests and typechecks it, then publishes `1.0.0-ci.<run_id>.<attempt>` under the `ci` dist-tag on every push to `main` that touches `senaev-utils/**`. That external consumer is why publishing stays on npm, and why the package must keep `@types/node` in `dependencies` and must not raise `engines.node` past `>=18`. For the same reason the mTLS client uses undici 6.x (`undici` 7 needs Node 20.18).

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
workspace's `/code` folder, `<clusterRootPath>/volumes/<name>-code` on the node (a `hostPath`, not a PVC). OMP keeps its state (`/root/.omp`) in
`<clusterRootPath>/volumes/<name>-omp-web-state`. The workspace `vps` node selector puts them on one node. Code Tools and OpenCode use one replica
and `Recreate`; a Code Tools update still has a short outage and loses in-memory operation IDs.
cluster-helper is its only caller, over mTLS on 8443 (see Internal mTLS); the kubelet probes `/health` on
the plain port 8081.

The code tools take absolute paths and work in any folder. The repository layout under
`/code` (`projects/<repo>` and `worktrees/<repo>/<branch>`) is described only in the
workspace instructions, `/AGENTS.md`. The `/code` folder is a `hostPath`, so it has no size limit:
worktrees with their own `node_modules` use the node's root disk. LLM workspaces have no container resource limits; scheduler memory
requests remain. To preserve node-local data when moving nodes, copy the folders (`/k3s-cluster/volumes/<name>-*`) to the new node;
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
all its rendered resources; the node folders under `volumes/` survive. Both current workspaces
are enabled.

LLM workspace values live in `llmWorkspaces`, and the templates in
`provisioning/helm/senaev-com/templates/llm-workspace/`. The entry name prefixes all
resource names. Each workspace has its own code folder (`volumes/<name>-code`, a `hostPath`) and instructions ConfigMap (`<name>-instructions`, from `instructionsPath`), and enables any of
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
| `senaev` | senaev-madrid | OpenCode, OMP (`omp.senaev.com`), Code Tools, Claude Code, Codex | traefik-hetzner |
| `galkin` | senaev-madrid | OMP only (`omp.galkin.senaev.com`) | traefik-hetzner (DNS points to hetzner) |

No workspace has a `/projects` volume; the code is in `/code`. No workspace uses PVCs.

Do not rename the `senaev` entry: that moves its host folders, and cluster-helper calls
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
  `claudeCode.telegram.user` (`TG_SENAEV_USER_ID`; the chat id is the user id). The commands
  are `/claude_auth`, `/claude_mcp`, `/codex_auth` and `/codex_pair` (renamed from `/auth` and `/mcp` on
  2026-11-20; the old names are ignored). `/claude_auth` first reads `claude auth status`: when
  Claude Code is logged in, it answers `✅ Claude Code is logged in.` with the expiry date and two
  buttons, `🔑 Renew login` (callback data `claude:login`: a new login while the old one still
  works) and `🚪 Log out` (`claude:logout`: runs `claude auth logout`, checks the status, rewrites
  the message; Remote Control and the prompt API then wait for the next login, and the bot sends no
  logged-out notice for it). When Claude Code is logged out, or the status cannot be read, it
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
  sessions is `claudeCode.model`; the phone can change it with `/model`. Sessions auto-compact at
  `claudeCode.autoCompactPercent` of the context window: `start.sh` puts it as
  `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` in the `env` of the settings that Remote Control passes to
  every session.
- MCP servers: `claudeCode.mcp` of the workspace, a `url` for each server (now Datadog,
  Grafana, Obsidian and Telegram). The template passes them as `WORKSPACE_MCP_SERVERS`, and `start.sh`
  writes them as `mcpServers` in `~/.claude.json` (user scope) on each start, replacing that list:
  a server added by hand is removed. Every server uses OAuth. The CLI login
  (`claude mcp login --no-browser <name>`) redirects to `http://localhost:<port>/callback`, and
  Claude Code has no setting for another redirect URI, so there is no public callback. In
  Telegram, `/claude_mcp` posts a message at once and turns it into the panel: a title and one button for
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
  port 8080, and nothing else reaches the pod. The n8n `job-search-round` workflow uses it Monday
  to Friday at 04:00 UTC: the prompt tells Claude to follow the note `LLM Job Search Playbook` of the
  Obsidian vault. Then n8n makes one request, `POST http://cluster-helper/job-search/round-report`
  with `{ date, time, text }` (the start time in UTC, also given in the prompt, and the answer).
  cluster-helper (`registerJobSearchRoundReportRoute.ts`) does both deliveries at once, neither
  waiting for the other: it posts the answer to the Job Search Framework chat (Telegram Rich
  Markdown), with the Obsidian `[[links]]` turned into highlights, and adds the same text, links
  unchanged, to the note `LLM Recommendations Log` through obsidian-sync, right under the `---`
  line that ends the note's header, as `## [[date]] HH:MM UTC`. It answers 200 when both
  succeed, 502 with a message naming the target that failed; the other one is still delivered.
  n8n does not retry, because a retry would post the message twice, and sends errors to the
  cluster chat. The log write alone is safe to repeat: a write that finds the heading adds nothing.
- The Claude Code version is pinned in `claude-code/Dockerfile`. Raise it in a pull request.
- The readiness probe checks only the prompt API, which starts before the login check, so a deploy does not wait for the login.

See [`projects/2026-11-15-18-42-claude-code-remote-control`](projects/2026-11-15-18-42-claude-code-remote-control/README.md).

## Codex

The `codex` component (`templates/llm-workspace/_codex.tpl`, image `codex/`) keeps a Codex CLI
with the ChatGPT login of the user on the shared `/code` volume. It has no Ingress and no Service,
and the NetworkPolicy has no ingress. Enabled only in `senaev`.

- Remote control (`codex.remoteControl: true`) runs in the Codex app-server daemon, not in the
  foreground: `codex remote-control pair` talks only to the daemon, through its control socket
  `CODEX_HOME/app-server-control/app-server-control.sock`. That path is only a symlink to the real
  socket `/tmp/codex-daemon-0/<sha256 of the path>` (`bind_private_daemon_socket`), so
  `/tmp/codex-daemon-0` is a host folder, `<clusterRootPath>/volumes/codex-daemon-socket`, mounted
  in the codex container and in the `telegram-login` container. The daemon and the client accept it
  only when it belongs to their user (root in both) with mode 0700: `start.sh` runs `chmod 700`,
  because Kubernetes creates the host folder 0755. After the login, `start.sh` writes
  `app-server-daemon/settings.json` (remote control on, no automatic updates), deletes the daemon
  package copy and its pid and log files (only then does the daemon copy the pinned CLI of the image
  again; `prepare_install.rs`), and checks every 60 seconds with `codex app-server daemon version`,
  starting it again with `codex remote-control start` when it is gone. The daemon retries a failed
  connection by itself, so the container does not restart for it. SIGTERM runs
  `codex remote-control stop`. The daemon log `app-server-daemon/daemon.stderr.log` is copied to
  the container output. The connection is outbound only
  (`wss://chatgpt.com/backend-api/wham/remote/control/server`); the device name is the hostname
  `senaev-codex`. The image has `procps`: the daemon checks its process with `ps`. With
  `codex.remoteControl: false` the container only keeps the login.
- Pairing: the ChatGPT app (Codex → Connect computer → Start pairing → Pair manually) takes an
  8-character code. `/codex_pair` in the bot runs `codex remote-control pair --json` against the
  daemon socket (in the login folder that the helper mounts), and sends `manualPairingCode` with its
  expiry (`expiresAt`, Unix seconds). When there is no code, it sends the error with its causes,
  and the last `error=` of `failed to connect to app-server remote control websocket` from the
  daemon log, unless a later line says `connected to app-server remote control websocket`. On
  2026-11-20 the enrollment of the server answered `HTTP 403 ... {"detail":"Multi-factor
  authentication required"}` until the user turned on MFA; the next retry of the daemon enrolled
  the server and connected, with the same login (no new login needed).
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
  update check, `/code` trusted, `model_auto_compact_token_limit` from `codex.autoCompactTokenLimit`:
  a token count, not a percent, so it changes with the model), replacing changes made by hand, and links `/AGENTS.md` as
  `~/.codex/AGENTS.md`: Codex does not read the `AGENTS.md` of a parent folder outside a repository.
  The remote control module is logged at info (`RUST_LOG`).
- MCP servers: none in `config.toml`. With the ChatGPT login, Codex gets the apps (connectors) of
  the ChatGPT account through OpenAI's host-owned `codex_apps` server: Obsidian, Code Tools and
  Grafana on senaev.com, Datadog EU, Gmail. Their calls reach cluster-helper as ChatGPT calls. To
  give Codex another server, add it as a connector in ChatGPT.
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
