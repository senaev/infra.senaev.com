# 2026-11-22 — mTLS for nextjs-app and vmagent, and the plain port of obsidian-sync closed

All traffic to obsidian-sync is mutual TLS, so plain HTTP `:8080` of obsidian-sync can be closed, and no pod can read published notes or the vault metrics without a certificate of the private CA.

## Goal

The two earlier projects moved every edge between our Node.js services to mTLS
([inter-service certificate authentication](../2026-11-15-11-00-inter-service-certificate-authentication/README.md),
[mTLS between the Node.js services](../2026-11-22-01-00-mtls-between-node-services/README.md)).
Two callers of obsidian-sync are still on plain HTTP `:8080`, the last open edge:

- **nextjs-app** (`senaev.com`, published notes and files): `GET /?note=<name>` and `GET /?file=<name.ext>`, no authentication.
- **vmagent** (`/metrics`): the labels of `obsidian_vault_largest_file_bytes` hold a vault file path. Today nextjs-app can read them too.

The result: plain `:8080` of obsidian-sync is gone. Each of the two callers gets a certificate from `internal-ca`, and each can reach only its own routes.

## Context

- obsidian-sync runs two Fastify instances (`obsidian-sync/src/server/runVaultServer.ts`): mTLS `:8443` with the protected routes (allowed caller: cluster-helper only) and plain `:8080` with `registerPublicVaultRoutes` (the published-file routes and `/metrics`). The `TODO` there points at this project.
- `registerMtlsCallerAllowlist` allows a list of callers for **a whole instance**, not for a route. That is why the two callers cannot just be added to `ALLOWED_CALLERS`: nextjs-app is the public-facing app, and it would get every vault route.
- nextjs-app: Deployment in `senaev-com/templates/nextjs-app.yaml`, `NOTES_REMOTE_URL=http://obsidian-sync:8080`, node `hetzner`. The code is in another repo, [senaev/senaev.com](https://github.com/senaev/senaev.com): `const/NOTES_REMOTE_URL.ts`, `utils/Notes/getNoteFromRemote.ts`, `utils/Notes/checkNoteExistsOnRemote.ts` and `app/(pages)/notes_file/[id]/route.ts` all use the global `fetch`. Image `ghcr.io/senaev/senaev.com:latest`, Node 24, Next.js 16.
- vmagent: the operator runs it on **senaev-madrid** (`telemetry/vm-stack/values.yaml`, `vmagent.spec`). The scrape is `VMServiceScrape obsidian-sync` (`senaev-com/templates/obsidian-sync.yaml`, port `http`, `/metrics`). The targets are pod IPs, so the TLS server name must be set by hand. vmagent is `v1.136.0`; before v1.136.1 it did not use a rotated client certificate on a kept-alive connection ([VictoriaMetrics#10393](https://github.com/VictoriaMetrics/VictoriaMetrics/issues/10393)). Our leaves last 7 days and rotate at day 4.
- obsidian-sync has no kubelet probe, so nothing else needs the plain port. Nothing else in the repo calls `obsidian-sync:8080` (`grep`: only `nextjs-app.yaml`). cluster-helper reaches the vault on `:8443`.
- Certificates: `global.internalMtlsCertificate` in `provisioning/helm/global-values.yaml` (168 h, renew 72 h). cert-manager alerts exist now (`certificate-not-ready`, `certificate-expires-soon`), so a failed renewal of the new leaves is visible.
- The nodes: obsidian-sync, nextjs-app and cluster-helper are on hetzner; vmagent is on senaev-madrid (a sensitive node). This change touches pods only, no network setting.

## Plan

1. **obsidian-sync, two mTLS instances instead of the plain one.** Same pattern as the protected API (`createMtlsFastifyServer` + `registerMtlsCallerAllowlist`):
   - `:8444` published files (`registerPublicFileRoutes`), allowed caller `nextjs-app.senaev-com.svc.cluster.local`;
   - `:8445` metrics (`registerVaultMetricsRoutes`), allowed caller `vmagent.telemetry.svc.cluster.local`;
   - each list in its own `callers.ts` constant, one instance per list, so neither caller reaches the other's route (this also ends the exposure of the `path` label to nextjs-app);
   - delete the plain instance and `PUBLIC_PORT`, the `http` port of the Deployment and the Service, and the `TODO`.
2. **NetworkPolicy of obsidian-sync.** `8443` cluster-helper (as now), `8444` nextjs-app, `8445` vmagent (namespace `telemetry`). No plain port rule is left.
3. **Certificates** (client only, the same settings): `nextjs-app-tls` in `senaev-com` (`internal-mtls.yaml`) and `vmagent-tls` in `telemetry` (the vm-stack chart, because a Secret is namespaced and vmagent mounts it from its own namespace).
4. **vmagent.** Mount the Secret through `vmagent.spec.secrets` (appears at `/etc/vm/secrets/vmagent-tls/`). The scrape becomes `scheme: https`, port `metrics-https`, `tlsConfig` with `caFile`, `certFile`, `keyFile` and `serverName: obsidian-sync.senaev-com.svc.cluster.local`. Set `vm_scrape_params.disable_keep_alive: true` on this endpoint, so every scrape (30 s) is a new handshake with the current certificate: it works around #10393 on `v1.136.0` without a version bump, and costs one handshake per 30 s.
5. **nextjs-app.** The way is open question 2 below. In both ways `NOTES_REMOTE_URL` ends up pointing at the mTLS port, and the plain `http://obsidian-sync:8080` is gone from the chart.
6. **Tests.** For each new instance (integration, as in `registerProtectedVaultRoutes`): the allowed caller reads its route; another service with a valid certificate gets 403, also on an unknown path; a caller without a certificate fails at the handshake (`fetchWithoutClientCertificate`); the other instance's route does not exist on this port.
7. **Docs and cleanup.** Update `AGENTS.md` (the mTLS table and the plain-port sentence), the comment in `obsidian-sync.yaml`, and the phase 1 follow-up in `projects/2026-11-15-11-00-inter-service-certificate-authentication/README.md` (📌 to ✅). Delete nothing in Vault: there is no token.

## Open questions

❓ **1. Two ports (`8444`, `8445`) or one port with a per-route allowlist?** Recommended: two ports. It follows the rule in `AGENTS.md` ("the list is for the whole instance, not for a route"), it is easy to test, and one more port costs one more line in the Service and the NetworkPolicy. The alternative is one instance with two Fastify scopes, each with its own `registerMtlsCallerAllowlist`; it needs per-route authorization, which we kept out until now, and unknown paths would not be covered by an allowlist.

❓ **2. How does nextjs-app get its certificate?**
- **A. A sidecar in the nextjs-app pod (recommended).** A small proxy of our own (a new top-level service in this repo, built by the same CI, using `createMtlsClient` and `watchTlsCredentials` from senaev-utils) listens on `127.0.0.1:8080` and forwards `GET` to `https://obsidian-sync.senaev-com.svc.cluster.local:8444` with the client certificate. nextjs-app then uses `NOTES_REMOTE_URL=http://127.0.0.1:8080` and the senaev.com repo does not change. The key is only in the sidecar, not in the public-facing container. One pull request here, one deploy. Cost: a new image to keep (about 60 lines plus tests) and a small extra memory request.
- **B. Change the app.** The senaev.com repo uses the published `senaev-utils` (pinned) `createMtlsClient` for the three fetches, with its own certificate watcher and the Secret mounted into the app container. No sidecar, but a second pull request in another repo, a Next.js bundling check of `undici` and `pino`, and an order across two repos: first an infra change that keeps `:8080` while the new app image rolls out, then a second infra change that closes it.

❓ **3. Name of the sidecar service and its image** (only for option A). For example `obsidian-published-proxy` (what it forwards) or a generic `mtls-forward-proxy`. Recommended: the first, because it forwards one fixed origin and refuses any other method and path shape.

## Verification

- A published note and a published file are served by the site (`https://senaev.com/notes/<name>`, a `notes_file` image), and `npm run test:smoke` passes.
- `up{job="obsidian-sync"}` is `1` in Grafana and `obsidian_vault_largest_file_bytes` still has series after the deploy.
- A request without a certificate, or from another service of the CA, fails on `:8444` and `:8445` (tests, and one live check from a pod); nextjs-app cannot read `/metrics`.
- `grep` finds no use of `obsidian-sync:8080`; the Service has no `http` port; `kubectl get certificate -A` lists `nextjs-app-tls` and `vmagent-tls` as ready.
- **Rotation:** force one renewal of `vmagent-tls` (the user runs `cmctl renew vmagent-tls -n telemetry`, or deletes its Secret) and check that `up{job="obsidian-sync"}` stays `1` and no `certificate-not-ready` alert fires. Do the same for `nextjs-app-tls`: the notes keep loading.
- No errors in Datadog logs of obsidian-sync, nextjs-app and the sidecar after the deploy.

## Risks

- vmagent restarts when the new Secret is mounted (the operator rolls it): a few minutes without scraping on senaev-madrid. No node network setting changes.
- A merge deploys obsidian-sync, nextjs-app and vmagent together: for a short time notes and metrics can fail. They heal. Keep the plain-port removal in the same pull request, so there is no state with two ways in.
- Rotation of `vmagent-tls` on `v1.136.0` without keep-alive is untested: the rotation check above is the proof. If vmagent does not pick up the new certificate, bump vmagent to `v1.137.0` or later (`vmagent.spec.image.tag`).
- Rollback is `git revert`: the old chart and the plain port come back together. Nothing is deleted in Vault, so nothing needs restoring.
