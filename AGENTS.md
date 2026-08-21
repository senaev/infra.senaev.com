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

## Shared Toolchain

The root `package.json` is not a workspace root. It is a private manifest that owns the
shared toolchain — eslint, vitest, typescript, `@types/node`, lefthook — while every package
keeps its own dependencies and its own lockfile. Packages are still built and deployed one
by one, and Docker build contexts stay per-package.

Run all three checks from the repository root; the packages have no check scripts of their own:

```
npm run lint        # eslint, one root eslint.config.mjs for all packages
npm run typecheck   # tsc --noEmit per package, in sequence
npm test            # vitest, one project per package
```

Because there is no workspace hoisting, typed linting, `tsc` and the tests each need the
package's own `node_modules`. A fresh clone therefore needs `npm ci` at the root **and** in
every package — this is what `.github/workflows/check.yml` does.

Config lives at the root: `eslint.config.mjs` (React rules scoped to senaev-utils),
`tsconfig.base.json` and `vitest.config.ts`.

Every package extends `tsconfig.base.json`, so the library is held to the same strictness as
the services — including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
senaev-utils overrides only `module`, `moduleResolution`, `esModuleInterop` and `lib`,
because browser bundlers compile it too.

`.github/workflows/check.yml` is called by every service build workflow via `needs: check`,
so nothing is deployed before lint, typecheck and tests pass. It also runs on its own when
the shared config changes, which belongs to no package and would otherwise reach `main`
unchecked.

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

The five services in this repo consume it **by path**: `"senaev-utils": "file:../senaev-utils"`, which npm links as a symlink into `node_modules`. A change to `senaev-utils/` is therefore picked up immediately, with no version bump and no publish step in between.

It is **also published to npm**, because `supabase-list-notes` lives in a separate repo and pins an exact published version. `.github/workflows/publish-senaev-utils.yml` lints, tests and typechecks it, then publishes `1.0.0-ci.<run_id>.<attempt>` under the `ci` dist-tag on every push to `main` that touches `senaev-utils/**`. That external consumer is why publishing stays on npm, and why the package must keep `@types/node` in `dependencies` and must not raise `engines.node` past `>=18`.

Because the services link the library rather than install it, **Docker builds use the repository root as their build context** — each service's workflow passes `context: .` with `dockerfile: ./<service>/Dockerfile`, and the Dockerfile copies both `senaev-utils/` and the service directory. The root `.dockerignore` keeps that context small; services must not carry their own. Every service build workflow also triggers on `senaev-utils/**`, so a change to the library rebuilds all five images.

Publishing uses npm **trusted publishing** (OIDC, no token). The trusted publisher on npmjs.com is bound to both the repository and the workflow filename, so renaming either breaks publishing until it is updated.

## Secrets Management

Secrets are managed using HashiCorp Vault and the External Secrets Operator.

1.  **Vault:** Secrets are stored in Vault under the `senaev-com-kv` path.
2.  **External Secrets Operator:** The External Secrets Operator is configured to read secrets from Vault and create corresponding Kubernetes secrets.
3.  **Kubernetes Secrets:** The applications running in the cluster can then mount these Kubernetes secrets as environment variables or files.

## Supabase Integration

Supabase is used as a managed Postgres backend.

Credentials (`SUPABASE_PROJECT_URL`, `SUPABASE_PUBLISHABLE_KEY`) are stored in Vault and injected as env vars via the `senaev-com-kv-secrets` Kubernetes secret.

