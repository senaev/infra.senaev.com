# AGENTS.md

This file provides guidance to any AI coding agent working with this repository.

## What this repo is

Personal infrastructure for `infra.senaev.com` — a distributed K3s cluster across multiple VPS providers, managed via Terraform, Helm, and shell scripts. Includes custom microservices and media server automation.

## Task flow

Create a task file only when the user explicitly asks for one, not automatically for
each request or command. Store it in [`tasks/`](tasks/) as
`YYYY-MM-DD-HH-mm-<short-slug>.md`, using the UTC creation date and time.
Keep existing filenames unchanged. Follow [`tasks/AGENTS.md`](tasks/AGENTS.md)
to maintain the task's working log.

## Sensitive nodes: `proxmox` and `senaev-media`

`proxmox` (bare metal) and `senaev-media` (VM 100 on it) are at home, behind the home
router. There is no remote console and no other way in: they are reachable only over the
tailnet (and senaev-media also from proxmox over the home LAN). **If we lose network access
to them, we cannot recover them remotely, and the result is an unacceptable loss.**

Be extremely careful with these nodes and their networks:

- Treat any change that can affect their connectivity as high risk: `tailscaled` (restart,
  upgrade, flags, `/etc/default/tailscaled`), firewall, routes, sysctl, network interfaces,
  `k3s-agent` network flags, and anything that touches `tailscale0`.
- Never change both home nodes at the same time. Change one, then confirm that it is
  reachable (`tailscale status` shows `direct`, SSH works) before the next one.
- Never restart `tailscaled` on hetzner (the SSH jump host) while a home node is not
  fully connected: after a restart, peers need the new disco key from the Tailscale
  coordination server, and the home ISP connection to it is unreliable. This caused a
  10-minute outage of senaev-media on 2026-10-05 — see
  [`tasks/2026-10-04-k3s-dual-stack-ipv6.md`](tasks/2026-10-04-k3s-dual-stack-ipv6.md).
- Prefer a change that fails safe: verify the result, keep the old state restorable, and
  give the user a rollback command before running anything risky.
- Ask the user before any such change, even when the rest of the task is already approved.

## Key conventions

- Full VPN services architecture in [`AGENTS.VPN.md`](AGENTS.VPN.md), human documentation is [`XRAY_VPN.md`](XRAY_VPN.md)
- Worker nodes connect via Tailscale; Tailscale hostnames used throughout (not public IPs)
- The cluster is dual-stack (IPv4 primary, IPv6 secondary). k3s takes node IPs from `tailscale0` (`--flannel-iface`), so no node IP is hard-coded. Pod/Service CIDRs live in `provisioning/common/.env` and are fixed at cluster creation — changing them needs a full rebuild. See [`tasks/2026-10-04-k3s-dual-stack-ipv6.md`](tasks/2026-10-04-k3s-dual-stack-ipv6.md)
- All alerting and operational notifications go to Telegram

## Service Deployment

Each namespace is a Helm chart under `provisioning/helm/<chart>/`. All charts share `provisioning/helm/common-values.yaml` merged at deploy time alongside the chart's own `values.yaml`.

CI deploys via `.github/workflows/update-helm-charts.yml` on push to `main`. One job first rsyncs the whole `provisioning/` folder to the server (with `--delete`, so the server copy mirrors the repo, `common-values.yaml` included). Then it runs a matrix over all charts; each job skips if its chart directory didn't change, otherwise SSHes in to run `upgrade-namespace.sh <chart> <namespace>` and sends a Telegram notification. A change to `common-values.yaml` alone deploys no chart. Runs do not overlap, so an older sync cannot overwrite a newer one.

### Smoke test after a deploy

These public URLs go through cluster-helper or nextjs-app to obsidian-sync, so they show
that the whole path works. Open each one and check the result:

| URL | Path | Expected result |
|---|---|---|
| https://s.senaev.com/1bxsl9 | short link: cluster-helper → obsidian-sync | redirect to https://senaev.com/cv/5min |
| https://static.senaev.com/datadog-dc-by-org-id.html | static file: cluster-helper → obsidian-sync | the HTML page |
| https://senaev.com/notes/my_blog_post_senaev_speaks_12 | public note: nextjs-app → obsidian-sync | the rendered note |

For the ChatGPT MCP connector, ask ChatGPT to read a note, search the vault and add a diary
record, then check the `🤖 ChatGPT MCP message` logs of cluster-helper.

For the Grafana MCP connector, ask ChatGPT to list the Grafana dashboards and to query `up`
for the last hour, then check the `📈 Grafana MCP message` logs of cluster-helper.

## MCP endpoints

cluster-helper serves two OAuth-protected MCP endpoints on `mcp.senaev.com`, with one
authorization server on `auth.senaev.com` (`cluster-helper/src/oauth/`):

| Path | Server |
|---|---|
| `/chat-gpt` | cluster-helper itself: the obsidian-* and code-* tools |
| `/grafana` | proxied to `mcp-grafana` (`provisioning/helm/senaev-com/templates/mcp-grafana.yaml`) |

Each endpoint is its own OAuth resource (RFC 8707): the token `aud` is the resource that the
client asked for, and a token for one endpoint is rejected by the other. ChatGPT needs one
connector for each endpoint.

`mcp-grafana` has Editor rights in Grafana. Its init container logs in with the Grafana admin
and creates the `mcp-grafana` service account and a new token on every pod start, so there is
no manual step on a new cluster. Only cluster-helper can reach it: a NetworkPolicy, and the
Vault key `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_MCP_GRAFANA`. See
[`tasks/2026-10-18-15-00-grafana-mcp-for-chatgpt.md`](tasks/2026-10-18-15-00-grafana-mcp-for-chatgpt.md).

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
npm test                # vitest, one project per package
npm run check:python    # syntax of every *.py file (ast.parse, writes no __pycache__)
npm run check:shell     # syntax of every *.sh file (sh -n for #!/bin/sh scripts, else bash -n)
npm run check:helm      # helm lint of every chart, with common-values.yaml + its values.yaml
```

The three `check:*` scripts are in `scripts/check-syntax.sh`. They find files with `git ls-files`,
so a new file is checked without a config change, also before it is first committed. They need
`python3`, `bash` and `helm` on the `PATH`; the GitHub `ubuntu-latest` runner has all three.

`simple-checks` runs the other scripts with `concurrently`, so it takes about as long as the
slowest one instead of their sum. Output is streamed live behind a coloured `[lint]`,
`[typecheck]`, `[test]` or `[check:*]` prefix, and a timings table is printed at the end. Every
check runs to completion even when another fails, so one push reports every problem at once;
the exit code is non-zero if any of them failed.

Because there is no workspace hoisting, typed linting, `tsc` and the tests each need the
package's own `node_modules`. A fresh clone therefore needs `npm ci` at the root **and** in
every package. `npm run ci:all` (`scripts/ci-all.sh`) does both, for every folder with a
committed `package-lock.json`; `.github/workflows/check.yml` runs it too.

Config lives at the root: `eslint.config.mjs` (React rules scoped to senaev-utils),
`tsconfig.base.json` and `vitest.config.mts`.

Every package extends `tsconfig.base.json`, so the library is held to the same strictness as
the services — including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
senaev-utils overrides only `module`, `moduleResolution`, `esModuleInterop` and `lib`,
because browser bundlers compile it too.

`.github/workflows/check.yml` is called by every service build workflow via `needs: check`,
so nothing is deployed before lint, typecheck, tests and syntax checks pass. It also runs on
its own when the shared config, a `*.py` or `*.sh` file, or a Helm chart changes, because
these belong to no package and would otherwise reach `main` unchecked.

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

It is **also published to npm**, because `supabase-list-notes` lives in a separate repo and pins an exact published version. `.github/workflows/publish-senaev-utils.yml` lints, tests and typechecks it, then publishes `1.0.0-ci.<run_id>.<attempt>` under the `ci` dist-tag on every push to `main` that touches `senaev-utils/**`. That external consumer is why publishing stays on npm, and why the package must keep `@types/node` in `dependencies` and must not raise `engines.node` past `>=18`.

Because the services link the library rather than install it, **Docker builds use the repository root as their build context** — each service's workflow passes `context: .` with `dockerfile: ./<service>/Dockerfile`, and the Dockerfile copies both `senaev-utils/` and the service directory. The root `.dockerignore` keeps that context small; services must not carry their own. Every service build workflow also triggers on `senaev-utils/**`, so a change to the library rebuilds all consumer images.

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
`ghcr.io/senaev/opencode-serve:code-tools`), Deployment and Service
(`provisioning/helm/senaev-com/templates/code-tools.yaml`). OpenCode and its Telegram
bot stay in the `opencode-telegram` Deployment. Both pods mount the existing
`opencode-telegram-git` PVC at `/projects/git`; required pod affinity puts Code Tools
on OpenCode's node. Both use one replica and `Recreate`; a Code Tools update still
has a short outage and loses in-memory operation IDs.

The shared working trees have no cross-process locking: coordinate edits between
OpenCode and Code Tools. Do not enable overlapping Code Tools replicas without
addressing operation routing and filesystem coordination.

Code Tools builds independently via `.github/workflows/build-code-tools.yml`.
Service releases publish their image and restart an existing Deployment. PR image
checks do neither. The Helm workflow checks the repository and waits for readiness;
it does not build images or restart services outside the chart changes.
Code Tools explicitly uses `imagePullPolicy: Always` for its mutable `code-tools` tag.
