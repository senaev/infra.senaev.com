# Internal mTLS — technical vision and implementation plan

## Scope and readiness

Decided: Kubernetes-managed private CA, application-level mTLS, shared Node.js
integration in senaev-utils. First migration: cluster-helper → obsidian-sync.
Host commands remain a separate project. These decisions suffice to prepare code.
Defaults below are engineering proposals for review in implementation PRs.

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

Create two Fastify listeners: protected mTLS API on 8443 and narrowly registered
published-file/metrics routes on 8080. No protected routes on HTTP, including catch-all
behavior. Preserve published-directory/query restrictions. NetworkPolicy limits
ports and sources, not URL paths: listener route isolation prevents API bypass.
This migration does not encrypt all internal traffic; Next.js/telemetry TLS is later scope.

## Certificate infrastructure

- Pin compatible cert-manager and trust-manager releases in a dedicated PKI namespace;
  wait for CRDs/webhooks. Bootstrap via SelfSigned issuer, CA Certificate and CA issuer.
  Never reuse control-plane or public Ingress CAs. Proposed root lifetime: 5 years,
  with expiry alerts and explicit replacement well before expiry.
- Keep signing key only in PKI namespace, restricted to controllers/operators. Issue
  separate cluster-helper clientAuth and obsidian-sync serverAuth certificates.
  Proposed leaves: 24 hours, renewBefore 8 hours, rotationPolicy Always; TLS minimum 1.2.
- Use exact URI SAN identities, for example
  spiffe://senaev.com/ns/senaev-com/sa/cluster-helper and
  spiffe://senaev.com/ns/senaev-com/sa/obsidian-sync.
  This naming does not imply SPIRE or automatic workload attestation. Bind issuance
  to reviewed manifests and permissions. Include server DNS SAN
  obsidian-sync.senaev-com.svc.cluster.local and use it in requests.
- Separate read-only per-service Secret mounts, no broad shared secret, env vars or
  subPath for rotating PEMs. Applications receive own keys and public trust only.
- trust-manager distributes public CA bundle ConfigMaps to selected namespaces.
  Keep explicit old/new root sources; do not make leaf Secret ca.crt the sole trust source.
- Inventory RBAC: workloads cannot read other keys, deploy pods mounting them, create
  Certificates/Requests/Issuers, or approve signing. Default cert-manager approval is
  not identity authorization. If non-operators can request certificates, enforce exact
  issuer/SAN/usages through approver/admission policy and disable conflicting default
  approval. Arbitrary deploy privileges in the shared namespace defeat key isolation;
  node administrators can read credentials used on their nodes.

## Shared Node.js transport

Both services already use Fastify 5. Reuse Fastify HTTPS with Node https/tls:
requestCert:true and rejectUnauthorized:true on the protected listener. Add a compatible
explicit Undici dependency in senaev-utils for an origin-scoped pool/fetch adapter;
built-in fetch has no portable https.Agent option. Verify native Response/Request
compatibility, streaming types and production dependency resolution.

Shared helpers validate PEM/key pairing, configure TLS, extract SAN identities with
Node X509Certificate and handle reload. Keep caller permissions in each service.
Require valid certificate chain AND exact authorized URI identity before request bodies.
Check peer validity/policy per request. Client retains standard DNS/chain checks and
checks expected service URI. No custom crypto, CN substring matching, identity headers,
global dispatcher mutation or disabled TLS verification.

Inject transport/auth into callToolServer: code-tools keeps its token; all vault tools,
resources and helper proxy paths use the scoped mTLS client. Reject off-origin URLs
and redirects to avoid forwarding client credentials to arbitrary servers. Preserve
aborts, body timeouts and streaming. Do not automatically retry mutations.

## Renewal and trust lifecycle

cert-manager renews leaves/keys into Secrets; kubelet eventually updates mounted files.
Poll volume generation/content, validate complete material, atomically replace outbound
pool and server secure context. Avoid reliance on inode-specific watchers. Retain last
valid material on transient projection errors and alert; fail closed at expiry.

Drain old pools, bound connection lifetime, check peer expiry and authorization on
reused connections. Clear cached TLS sessions and rotate ticket keys on trust changes.
Test session resumption against expired/revoked credentials. Obsidian's independent
sync process must survive PKI outages; valid credentials work until expiry without fallback.

CA replacement: distribute old+new trust, wait for reload, issue new leaves, verify
migration, remove old trust, retire old signer. CA issuer alone does not orchestrate this.

Propose a reloadable revoked-leaf serial/fingerprint list checked per request: replace
compromised key, deny old leaf, close affected sessions and stop compromised workloads.
Short lifetime alone is not immediate revocation; no CRL/OCSP service is assumed.
CA compromise requires CA replacement and old-trust removal as an incident action.

Before activation, choose encrypted signing-key backup outside the cluster and test
restore, or explicitly accept new-CA/full-trust rollout after disaster. Never put keys
in Git/logs. Monitor Certificate readiness, loaded expiry and renewal/reload failures;
route alerts through existing monitoring to Telegram. Existing logs supply history.

## Delivery and deployment gates

1. Foundation PR: controllers, CA/leaves/trust declarations, issuance permissions,
   monitoring and rotation/recovery runbooks. Existing token traffic unchanged.
2. Transport PR: shared helpers and real TLS integration tests, separate listeners,
   mounts and port-specific NetworkPolicies. Temporary migration mode is explicit.
3. Cutover PR: switch every helper vault path to HTTPS; remove protected HTTP routes,
   old token acceptance and INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN wiring.
   Preserve OBSIDIAN_AUTH_TOKEN: it authenticates Obsidian Sync, not this API.
4. Remove temporary migration settings; final state has no automatic downgrade.

CI serializes releases only within a namespace and deploys namespaces in parallel.
CRDs/webhooks, issuer readiness, leaves and application mounts require separate stages
or explicit dependency gates; alphabetical release naming is insufficient. Keep image
and mount/config versions compatible with workflow refresh ordering. Single-replica
obsidian-sync uses Recreate: rollouts can briefly interrupt requests, renewal must not.
Rollback is an explicit compatible image/config deployment, not runtime fallback.

## Verification and activation readiness

- Unit tests: identity matching, destination scoping, reload decisions/failures.
- Real TLS tests: correct peer succeeds; missing/expired/wrong CA, caller identity,
  server hostname or service identity fails. Unrelated trusted service is denied.
- Renewal changes keys without restart; malformed snapshots retain valid material;
  expiry/revocation/replaced trust also fail on reused/resumed connections.
- Protected operations cannot use HTTP. Public notes/files, metrics, vault read/search/
  write, static proxy streaming and code-tools token transport retain intended behavior.
- Helm lint/render, key isolation, deploy ordering, production imports and required
  repository checks pass. Exercise CA overlap/removal and recovery procedures.
- After deploy, inspect scoped Grafana/Datadog signals, perform vault read/search and
  an explicitly requested reversible write, website smoke tests and authorized live
  allowed/blocked connectivity tests.

No further high-level architecture choice blocks preparing the foundation PR. Actual
cluster prerequisites, RBAC, CA recovery choice and rollout tests are activation gates.
Exact compatible package/chart versions are implementation choices to verify.

## Primary references

- https://cert-manager.io/docs/configuration/ca/
- https://cert-manager.io/docs/usage/certificate/
- https://cert-manager.io/docs/trust/trust-manager/
- https://cert-manager.io/docs/policy/approval/
- https://nodejs.org/api/tls.html
- https://github.com/nodejs/undici/blob/main/docs/docs/best-practices/client-certificate.md
- https://fastify.dev/docs/latest/Reference/Server/
