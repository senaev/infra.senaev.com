# 2026-11-22 — mTLS between the Node.js services

Every call between the self-written Node.js containers of this repo is mutual TLS with a certificate from the private CA, and the shared tokens between them are gone.

## Goal

The first project ([inter-service certificate authentication](../2026-11-15-11-00-inter-service-certificate-authentication/README.md))
did cluster-helper → obsidian-sync. Do the same for the other edges between our Node.js containers:
the callee knows its callers by the DNS name in their certificate, the caller checks the name of the
callee, and nothing falls back to plain HTTP or to a token.

## Context

Foundation already in the repo: `senaev-utils/src/utils/mtls` (`watchTlsCredentials`,
`createMtlsFastifyServer`, `createMtlsClient` for one origin, `registerMtlsAuthentication`),
`cluster-helper/src/run.ts` (one shared watcher, `createShutdownController`),
`registerMtlsCallerAllowlist` (now only in obsidian-sync), leaf Certificates in
`provisioning/helm/senaev-com/templates/internal-mtls.yaml`, and the CA `internal-ca` in the `pki` namespace.

Edges in scope (from the inventory of 2026-11-22):

| Edge | Today | Where |
|---|---|---|
| cluster-helper → code-tools, `:8080` | Bearer token `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS`; `/health` skips the token for the kubelet | client `cluster-helper/src/chatGptMcp/callToolServer.ts`, `codeToolsApi.ts`; server `code-tools/src/server/createCodeToolsServer.ts`; Service and NetworkPolicy in `llm-workspace/_code-tools.tpl`. code-tools runs on senaev-madrid |
| cluster-helper → media-server-helper, `:3000` `POST /torrent-files` | None: no token, no NetworkPolicy, no probes | client `cluster-helper/src/torrentOutbox.ts:89`; server `media-server-helper/src/torrentFileReceiver.ts`. It runs on **senaev-media** (home node) |
| vpn-subscription → cluster-helper, `:80` `POST /telegram/send-message` | None; NetworkPolicy only; reached through the ExternalName Service `cluster-helper` in the `vpn` namespace | client `vpn-subscription/src/index.ts:234`; cluster-helper's 8443 listener has no routes yet |

Out of scope: callers that cannot present our certificate and stay on plain HTTP — n8n, Alertmanager,
qbittorrent's `curl` and the kubelet probes on cluster-helper `:80`; vmagent scrapes (`/metrics` of
obsidian-sync stays on 8080); Traefik (it ends TLS with Let's Encrypt); Python services; third-party
containers. Also out of scope, for a later change: nextjs-app → obsidian-sync on `:8080` (`?note=`,
`?file=`, no authentication today). Its client is in another repo (senaev.com, image
`ghcr.io/senaev/senaev.com`, `NOTES_REMOTE_URL` in `nextjs-app.yaml:33`), so one pull request here cannot
change both sides.

## Plan

One pull request for the three edges (decided by the user). Order inside it:

1. **senaev-utils.** Move `registerMtlsCallerAllowlist` from obsidian-sync to `utils/mtls`; each service
   keeps its own `callers.ts`. cluster-helper creates one `createMtlsClient` for each callee from the
   one shared watcher.
2. **Certificates** (7 days, renewed 3 days before the end, the same settings as now):
   `media-server-helper-tls` in `internal-mtls.yaml`, `<workspace>-code-tools-tls` in
   `llm-workspace/_code-tools.tpl` (its name follows the workspace, so it is `senaev-code-tools-tls`;
   server certificates), and `vpn-subscription-tls` in the `vpn` release (client; a Secret is
   namespaced). Names are `<service>.<namespace>.svc.cluster.local`; the code-tools name is the name
   of its Service, `senaev-code-tools.senaev-com.svc.cluster.local`.
3. **code-tools.** mTLS server for all tool routes; remove the bearer token (Vault property, env
   in cluster-helper and code-tools, `external-secret.yaml`). Allowed caller: cluster-helper. The kubelet
   cannot present a certificate, so a second Fastify instance on a plain port serves only `/health` (the
   same pattern as obsidian-sync), and the probe moves to that port.
4. **media-server-helper.** mTLS server for `/torrent-files` on 8443; plain port 3000 is closed (one caller,
   no probes); allowed caller: cluster-helper; add an ingress NetworkPolicy. The outbox of cluster-helper
   keeps the files while the service restarts. The log of an invalid request no longer holds the whole
   body (`AGENTS.md` forbids it), only the body type.
5. **vpn-subscription → cluster-helper.** First route on cluster-helper's 8443: `POST /telegram/send-message`
   (the same handler as on port 80, shared function), behind the caller allowlist (only
   `vpn-subscription.vpn.svc.cluster.local`) and a NetworkPolicy rule for port 8443. vpn-subscription
   dials `cluster-helper.senaev-com.svc.cluster.local:8443` directly. The ExternalName Service `cluster-helper`
   in the `vpn` namespace (`provisioning/helm/vpn/templates/cluster-helper.yaml`, a DNS alias to the real
   name that only vpn-subscription used) is deleted, because the host in the URL must match the DNS name
   in the certificate.
6. **Tests, docs, cleanup.** Tests for each new client and server; update `AGENTS.md` (the internal mTLS
   section, the tokens), the README of this project and the worklog; delete the code-tools token in Vault.

## Verification

- Each edge works end-to-end: a code tool call from ChatGPT, a torrent file delivered to senaev-media, a
  vpn-subscription Telegram message.
- A request without a certificate, with a certificate of another CA, or from another service of the same CA
  fails on every new mTLS port (tests, and one live check with `curl` from a pod).
- No token or plain port is left for these edges: the Vault property for code-tools is deleted, and
  `grep` finds no use of it.
- `kubectl get certificate -A` shows every new Certificate ready; `npm run test:smoke` passes; no errors in
  Datadog logs after the deploy.

## Result

Code and chart are done and checked (`npm run simple-checks`, `helm template`); the pull request is open
and waits for the user's approval to merge. Ports: code-tools tool routes on 8443 and `/health` on plain
8081 (the Service has only 8443); media-server-helper on 8443 only; cluster-helper `:8443` has
`POST /telegram/send-message`, open in the NetworkPolicy only to vpn-subscription. cluster-helper
`:80` lost the vpn-subscription rule. Vault: the property
`INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS` is no longer read; delete it after the deploy is
verified (the user does this). Open: the verification above on the live cluster.

## Risks

- senaev-media (media-server-helper) and senaev-madrid (code-tools) are sensitive nodes. This change touches
  no network setting on them, only the pods. A pod that waits for a missing Secret does not affect the node.
- The tools of code-tools give a shell in its container, so the shell can read the mounted private key of
  the code-tools server (before, it could read the token in the environment). Accepted: the client
  certificate of cluster-helper is not in that container.
- One PR and one deploy: if a service does not start, `git revert` returns the old tokens and ports. The
  tokens must stay in Vault until the deploy is verified.
