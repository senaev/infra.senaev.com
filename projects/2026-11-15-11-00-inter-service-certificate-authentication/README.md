# 2026-11-15 — Inter-service certificate authentication

Replace shared-token authentication between cluster-helper and the Obsidian vault service with reusable internal mTLS authentication.

## Goal

Internal HTTPS with mutual certificate verification: each side verifies the intended
service identity, and the receiving service explicitly authorizes the caller.
The first migration is cluster-helper → obsidian-sync (the vault container/API).
Build a reusable foundation for other services, including
[approved node commands](../2026-11-15-10-44-approved-node-commands/README.md).

## Context

- Current callers: [obsidianSyncApi.ts](../../cluster-helper/src/obsidianSyncApi.ts).
- Current internal token: `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN`
  in [env.ts](../../cluster-helper/src/env.ts).
- Current service wiring: [cluster-helper Helm template](../../provisioning/helm/senaev-com/templates/cluster-helper.yaml)
  and [obsidian-sync template](../../provisioning/helm/senaev-com/templates/obsidian-sync.yaml).
- Decision: manage the dedicated private CA inside Kubernetes, not Vault PKI.
  Use cert-manager for the planned issuance and renewal integration.
- Decision: enforce mTLS at application level in both Node.js services. Reuse
  established Node.js TLS/HTTPS APIs and compatible existing HTTP-client packages.
  Put common certificate loading/reload, secure client/server configuration and
  identity-verification utilities in senaev-utils; keep caller permissions explicit
  in each service. Select exact adapters after inspecting current client/server stacks.
  Do not implement custom cryptography or introduce a service mesh for this project.
- Do not reuse the Kubernetes control-plane CA. Applications receive only their own
  private keys and the required public trust bundle; no CA signing key.
- Keep NetworkPolicy as an additional layer. A trusted certificate alone does not
  authorize every service to call every endpoint.
- First release migrates this connection only. Inventory other obsidian-sync callers,
  public proxy paths and callbacks before cutover; preserve their intended behavior
  without leaving a bypass to protected vault operations.

## Plan

1. Resolve the design decisions below and inventory all affected request paths.
2. Implement private issuance, restricted certificate requests and per-service
   identities. Prevent workloads from requesting another service's identity or
   mounting its private key; isolate credentials from LLM workspaces.
3. Automate issuance, renewal and private-key rotation, Kubernetes Secret delivery,
   and application reload so renewed credentials are used without manual copying.
4. Mount the CA certificate from the leaf Secrets. A lost or
   compromised CA is replaced by a new CA and a redeploy. No trust-manager, CA backup or
   trust-overlap rotation in the first implementation.
5. Integrate reusable HTTPS/mTLS client/server support and explicit caller authorization.
   Authenticate cluster-helper to obsidian-sync and verify obsidian-sync on the client.
6. Cut over in one PR and remove legacy token acceptance and obsolete secret wiring.
   There is no fallback to plaintext or token authentication. A bad deploy is fixed
   with a git revert.
7. Add operational runbooks and end-to-end tests before marking the foundation reusable.
   Monitoring and alerts are a follow-up (see Result).

## Technical vision and readiness

See the [technical plan](2026-11-15-11-44-technical-plan.md) for inspected traffic,
CA/identity architecture, shared Node.js integration, renewal and staged delivery.
The main architecture decisions suffice to prepare implementation. Proposed defaults:
7-day leaves renewed 3 days before expiry, exact service identities, explicit
caller authorization and fail-closed mTLS after migration.

Next.js public-file traffic and vmagent metrics currently share port 8080. Keep them
on a public-only HTTP listener while the protected vault API moves to mTLS on 8443.
Protected routes must never remain reachable through that public HTTP listener.
This migration does not claim to encrypt all internal cluster traffic.

Before production activation verify live certificate/RBAC prerequisites. CA recreation
after a disaster is accepted instead of a CA backup. Exact versions/adapters are
implementation work.

## Verification

- Existing vault read/search and authorized writes work end-to-end through cluster-helper.
- Missing, expired, untrusted or wrong-service certificates fail; another valid service
  certificate cannot impersonate cluster-helper. Client rejects the wrong server identity.
- Certificate renewal and key rotation are consumed by running services. Existing valid
  credentials work until expiry.
- Workloads cannot obtain another service's identity or read its private keys through
  the intended deployment/issuance permissions.
- Legacy bearer token and plaintext access cannot bypass the migrated protected API.
- Other legitimate vault clients, public proxy paths and callbacks retain intended behavior.
- CA recreation after a lost or compromised CA is exercised and documented.

## Result

Implemented in PR #203 (the plan and the code), merged and deployed on 2026-11-22. Verified live:
both Certificates `cluster-helper-tls` and `obsidian-sync-tls` are ready, the smoke test passes, a
vault read through the Obsidian MCP connector works, and the logs of both services show the mTLS
listeners and no errors. Not verified live: the RBAC checks (`kubectl auth can-i`), renewal of a leaf
(the first one is due about 4 days after the issue), and `internal-ca` in the `pki` namespace.

- `provisioning/helm/pki/cert-manager` (cert-manager v1.21.3, on hetzner) and
  `provisioning/helm/pki/issuers` (the CA and the `internal-ca` ClusterIssuer).
- `provisioning/helm/senaev-com/templates/internal-mtls.yaml`: the two leaf Certificates
  (7 days, renewed 3 days before the end). Mounts, ports 8443/8080 and NetworkPolicies are in
  the `obsidian-sync.yaml` and `cluster-helper.yaml` templates.
- `senaev-utils/src/utils/mtls`: loading and polling of the certificate files, server options
  and caller check, and the client that talks to one origin (undici 6, because the library
  keeps `engines.node >=18`).
- obsidian-sync: two Fastify instances (`registerVaultRoutes.ts`), mTLS on 8443 and public HTTP
  on 8080. cluster-helper: `run.ts` creates the client (`createMtlsClient`), and
  `obsidianSyncApi.ts` holds the calls. The token and its secret wiring are removed;
  the Vault property `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN` is unused and can be deleted.

Activation gates, checked after the deploy: the leaf Secrets are ready
(`kubectl -n senaev-com get certificate`: done, both `READY=True`), both services start and load
their certificate (done, logs), `npm run test:smoke` (done), and a vault read in the Obsidian MCP
connector (done). Still open: no application or LLM workspace ServiceAccount can read the leaf
Secrets or create Certificates and CertificateRequests
(`kubectl auth can-i ... --as=system:serviceaccount:<namespace>:<name>`).

📌 Delete the Vault property `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN` (path
`senaev-com-kv`). The deploy is verified, and nothing reads it any more.

✅ Alerts on the cert-manager metrics (Certificate not ready, leaf expires in less than
2 days, no metrics) and a scrape of cert-manager are added in the second project's pull request.
They are not yet seen firing on the live cluster.

📌 Move nextjs-app (published notes and files) and vmagent (`/metrics`) to mTLS as well: give
them certificates from the same CA, check them on obsidian-sync, and close the plain HTTP port
8080. The final state is that all traffic to obsidian-sync is under mTLS. Not in this PR: it
needs changes in the Next.js app and in the vmagent scrape configuration. It also ends the
exposure of `/metrics` to nextjs-app: until then, nextjs-app can read the `path` label of
`obsidian_vault_largest_file_bytes` (a vault file name), as it could before this PR.

📌 cluster-helper has an mTLS listener on 8443 with no routes and no NetworkPolicy rule. Before the
first route: add the check of the allowed callers (like `registerMtlsCallerAllowlist` of
obsidian-sync, probably moved to senaev-utils), the certificate of the caller, and the
NetworkPolicy rule.

### Replace the CA key (lost or compromised key only)

The CA certificate renews by itself and keeps its key, so a normal renewal needs no step.

1. Delete the Secret `internal-ca` in the `pki` namespace. cert-manager issues a new CA key.
2. Delete the Secrets `obsidian-sync-tls` and `cluster-helper-tls` in `senaev-com`.
   cert-manager issues new leaves from the new CA.
3. Restart `obsidian-sync` and `cluster-helper`. The vault tools are down for a short time.

A leaf whose key is compromised: delete only its Secret. The old certificate stays valid
until its end (7 days at most).
