# Internal mTLS — technical vision and implementation plan

## Scope and readiness

Decided: Kubernetes-managed private CA, application-level mTLS, shared Node.js
integration in senaev-utils. First migration: cluster-helper → obsidian-sync.
Host commands remain a separate project. These decisions suffice to prepare code.
Defaults below are engineering proposals for review in implementation PRs.

Purpose: cluster-helper and obsidian-sync both run on hetzner, so this migration fixes
little security risk by itself. It is a low-risk pilot of the certificate foundation for the
[node executor](../2026-11-15-10-44-approved-node-commands/README.md). A failure here
costs the vault tools, not the recovery path.

Keep the first implementation small. Out of scope: trust-manager, revoked-certificate list,
certificate-request approver policy, CA backup, CA replacement with trust overlap, runtime
fallback and rollback procedures. A bad deploy is fixed with a git revert. A lost or
compromised CA is fixed with a new CA and a redeploy of both services.

No cert-manager installation was found in repository provisioning. Live installation
is unverified: inventory it read-only before deploying controllers, following cluster
access rules. Do not use local kubectl against the unrelated work-cluster context.

## Inspected traffic and target architecture

| Caller | Current behavior | Target |
|---|---|---|
| cluster-helper tools/resources/tasks/milestones/short links | HTTP :8080 with token | Mandatory mTLS on HTTPS :8443 |
| helper static.senaev.com proxy | Uses fetchObsidianSync | Same mTLS transport, preserve streaming and proxy restrictions |
| nextjs-app | Public note/file query routes without token | Public-only HTTP :8080 during this migration |
| vmagent | Unauthenticated HTTP /metrics | Preserve restricted metrics access |

Sources: [server](../../obsidian-sync/src/server/runVaultServer.ts),
[auth exemptions](../../obsidian-sync/src/server/registerInternalTokenCheck.ts),
[helper client](../../cluster-helper/src/obsidianSyncApi.ts),
[tool transport](../../cluster-helper/src/chatGptMcp/callToolServer.ts),
[Helm](../../provisioning/helm/senaev-com/templates/obsidian-sync.yaml).

Run two Fastify instances, created by two `createVaultServer()` calls. One instance has
one listener, and its HTTPS options are set when it is created, so one instance cannot
serve both ports.

| Instance | Port | Routes |
|---|---|---|
| Protected | HTTPS mTLS 8443 | vault tools, tasks, short links, milestones, static routes |
| Public | HTTP 8080 | only `registerPublicFileRoutes` and `registerVaultMetricsRoutes` |

Each instance has its own 404 handler and catch-all GET. The public instance never
registers a protected route, so no path reaches the protected API over HTTP. The protected
instance checks the client certificate identity in an `onRequest` hook. The token check and
the `isPublicWithoutInternalToken` flag are removed. Preserve published-directory/query
restrictions. NetworkPolicy limits ports and sources, not URL paths: the separate instances
prevent the API bypass.
This migration does not encrypt all internal traffic; Next.js/telemetry TLS is later scope.

## Certificate infrastructure

- Pin a compatible cert-manager release in a dedicated PKI namespace, scheduled on
  hetzner; wait for CRDs/webhook. Bootstrap via SelfSigned issuer, CA Certificate and CA
  issuer. Never reuse control-plane or public Ingress CAs. Proposed root lifetime: 5 years.
  cert-manager renews the CA certificate by itself, a third of the lifetime before its end,
  and `rotationPolicy: Never` keeps the CA key. A leaf of the old certificate is then valid for
  the renewed one, so the renewal needs no overlap procedure and causes no downtime (a real TLS
  test checks it). Leaves get the new `ca.crt` when they renew, every 4 days. Only a lost or
  compromised key needs a replacement by hand, see the project README.
- Keep the signing key only in the PKI namespace. Issue separate cluster-helper clientAuth
  and obsidian-sync serverAuth certificates.
  Proposed leaves: 7 days, renewBefore 3 days, rotationPolicy Always; TLS 1.3 only.
  A failed renewal then leaves days to react.
- Identity is a DNS SAN (a name listed in the certificate). It is only a label and does
  not need to exist in DNS:
  - cluster-helper: `cluster-helper.senaev-com.svc.cluster.local`
  - obsidian-sync: `obsidian-sync.senaev-com.svc.cluster.local`, also the host in requests.
  Node checks it with `X509Certificate.checkHost()`: no URI parsing, no `spiffe://` names.
  Issuance is bound to reviewed manifests.
- Separate read-only per-service Secret mounts, no broad shared secret, env vars or
  subPath for rotating PEMs. Each service receives its own key, its own certificate and the
  public CA certificate (`ca.crt` of its leaf Secret). No trust-manager.
- Access: only the CI deploy and cluster administrators create Certificates and Issuers.
  Application and LLM workspace ServiceAccounts get no RBAC for Secrets or Certificates.
  Node administrators can read credentials used on their nodes.

## Shared Node.js transport

Both services already use Fastify 5. Reuse Fastify HTTPS with Node https/tls:
requestCert:true and rejectUnauthorized:true on the protected listener. Add a compatible
explicit Undici dependency in senaev-utils for an origin-scoped pool/fetch adapter;
built-in fetch has no portable https.Agent option. Verify native Response/Request
compatibility, streaming types and production dependency resolution.

Shared helpers validate PEM/key pairing, configure TLS, match identities with Node
`X509Certificate.checkHost()` and handle reload. Keep caller permissions in each service.
Require a valid certificate chain AND an authorized DNS SAN identity before request bodies.
Check peer expiry on every request. The client keeps standard hostname and chain checks
against the obsidian-sync name. No custom crypto, CN matching, SAN string parsing, identity
headers, global dispatcher mutation or disabled TLS verification.

Inject transport/auth into callToolServer: code-tools keeps its token; all vault tools,
resources and helper proxy paths use the scoped mTLS client. Reject off-origin URLs
and redirects to avoid forwarding client credentials to arbitrary servers. Preserve
aborts, body timeouts and streaming. Do not automatically retry mutations.

## Renewal and recovery

cert-manager renews leaves/keys into Secrets; kubelet updates the mounted files after a
delay. Each service polls the files, validates the complete credentials (PEM, key pair,
chain) and applies it without a restart:

- Server: `server.setSecureContext()` on the HTTPS server.
- Client: create a new Undici `Agent`, then close the old one when its requests end.

A malformed snapshot is ignored: keep the last valid credentials and log an error. At expiry,
fail closed, with no fallback to HTTP or token. A service never requests certificates: only
cert-manager does. A service that starts, or wakes up, with expired files stays up, logs an
error and uses the renewed files on the next poll.

The protected listener accepts TLS 1.3 only, without session tickets, so every connection
does a full handshake and an old credential cannot live on in a resumed session. The client
closes idle connections within seconds, and the server checks the expiry of the peer
certificate on every request. Obsidian's independent sync process must survive PKI outages.

Recovery: after a lost or compromised CA, delete the Secret `internal-ca` in the pki
namespace and the two leaf Secrets in senaev-com; cert-manager issues a new CA and new
leaves. Then restart both services. Short downtime is accepted. No CA backup. After a
compromised leaf, delete its Secret: a new key is issued, and the old leaf stays valid for at
most its 7-day lifetime.

Never put keys in Git/logs. There are no alerts in the first implementation: a renewal
failure shows only in `kubectl get certificate` and in the service logs. Alerts on the
cert-manager metrics are a follow-up, see the README.

## Delivery and deployment gates

1. Foundation PR: cert-manager, CA and the two leaf Certificates. Existing token traffic
   unchanged.
2. Transport and cutover PR: shared helpers and real TLS integration tests, the two
   Fastify instances, mounts and port-specific NetworkPolicies. Switch every helper vault
   path to HTTPS and remove the token check and INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN
   wiring. Preserve OBSIDIAN_AUTH_TOKEN: it authenticates Obsidian Sync, not this API.

There is no dual mode, no runtime fallback and no rollback procedure. If the cutover
breaks, revert the PR; the vault tools stay unavailable until the pipeline finishes.

Both stages are implemented in one PR, in this order. CI deploys the namespaces one at a time
in sorted order, each release with `--wait`: `pki/cert-manager` (CRDs and webhook), then
`pki/issuers` (the CA), both before `senaev-com` (the leaves and the mounts). The ordering
depends on the namespace name `pki` sorting before `senaev-com`. A pod that mounts a leaf
Secret waits in ContainerCreating until cert-manager has issued it. Keep image and
mount/config versions compatible with workflow refresh ordering. Single-replica
obsidian-sync uses Recreate: rollouts can briefly interrupt requests, renewal must not.

## Verification and activation readiness

- Unit tests: identity matching, destination scoping, reload decisions/failures.
- Real TLS tests: correct peer succeeds; missing/expired/wrong CA, caller identity or
  server hostname fails. Unrelated trusted service is denied.
- Renewal changes keys without restart; malformed snapshots retain valid credentials;
  expired credentials also fail on reused connections.
- Protected operations cannot use HTTP. Public notes/files, metrics, vault read/search/
  write, static proxy streaming and code-tools token transport retain intended behavior.
- Helm lint/render, key isolation, deploy ordering, production imports and required
  repository checks pass.
- After deploy, inspect scoped Grafana/Datadog signals, perform vault read/search and
  an explicitly requested reversible write, website smoke tests and authorized live
  allowed/blocked connectivity tests.

No further high-level architecture choice blocks preparing the foundation PR. Actual
cluster prerequisites and RBAC are activation gates.
Exact compatible package/chart versions are implementation choices to verify.

## Primary references

- https://cert-manager.io/docs/configuration/ca/
- https://cert-manager.io/docs/usage/certificate/
- https://nodejs.org/api/tls.html
- https://github.com/nodejs/undici/blob/main/docs/docs/best-practices/client-certificate.md
- https://fastify.dev/docs/latest/Reference/Server/
