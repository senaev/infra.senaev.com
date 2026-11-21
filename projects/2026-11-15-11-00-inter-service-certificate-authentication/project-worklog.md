## 2026-11-21 UTC — The factory installs the authentication hook

`createProtectedVaultServer` calls `registerMtlsAuthentication` itself, so a protected server cannot
exist without it and the hook always runs before the authorization hook. `registerMtlsAuthentication`
is generic over the raw server (`<RawServer extends RawServerBase>`) because the factory holds the
HTTPS instance. The factory has an explicit return type
(`{ server: FastifyInstance<HttpsServer>; updateCredentials }`). `registerProtectedVaultRoutes` only
registers the authorization hook and the routes.

## 2026-11-21 UTC — No shared server types in obsidian-sync

`VaultServer` and `VaultRouter` are removed from `createVaultServer.ts`. Each route registrar types
only what it calls, with `Pick<FastifyInstance, …>` (`registerTaskRoutes` takes `'post'`,
`registerPublicStaticRoutes` takes `'register'`, and so on); tests use `FastifyInstance`.
`createProtectedVaultServer(credentials, logger)` takes the logger and returns the real HTTPS
instance. The one cast from it to `FastifyInstance` is in `runVaultServer.ts` (and in two tests),
because the HTTPS raw server type is not assignable to the plain one. A generic over the raw server
was tried and dropped: `reply.raw` in `registerVaultToolRoutes` cannot be narrowed that way.

## 2026-11-21 UTC — "Caller" replaces "peer" in the names of the mTLS caller

The verified client is a caller in the product code and in the utils: `request.mtlsCaller`,
`MtlsCaller`, `MtlsCallerAuthentication` (`{ ok: true; caller }`) and `authenticateMtlsCaller`. Node's
own `getPeerX509Certificate()` and the plan's text about TLS in general keep "peer".

## 2026-11-21 UTC — One list of allowed callers for the whole protected instance

The per-route `callers` (an `onRoute` hook that wrote the list into the route `config`, and
`registerRoutesForCallers`) is removed. `registerMtlsAuthorization(server, allowedCallers)` takes
one list for the whole instance; `ALLOWED_CALLERS` is in `callers.ts`. Default deny stays and is
simpler: any service that is not on the list is refused on every path, the 404 handler included, and
an empty list refuses all. The cost is that all protected routes have the same allowed callers;
when a second service needs only some routes, add the per-route rule again.

## 2026-11-21 UTC — Authentication and authorization are separate hooks

`registerMtlsAuthentication` (401) checks the certificate with `authenticateMtlsCaller` and keeps
the caller on the request (`request.mtlsCaller`). `registerMtlsAuthorization` (403) checks the caller
against the allowed callers, and answers 401 when there is no caller, so it fails closed if
the authentication hook is missing. Both are `onRequest` hooks, registered in this order in
`registerProtectedVaultRoutes`. Both take only Fastify types (`Pick<FastifyInstance, …>`), after
the pino logger was typed as `FastifyBaseLogger` in the server factories.

## 2026-11-21 UTC — Remove the unused `/vault/file-stats` route

Nothing in the repo called it, and it was the only reason to split `registerVaultMetricsRoutes`
in two (it returns file names, so it could not share the public HTTP instance with `/metrics`).
The route, its tests and its README text are removed, and `registerVaultMetricsRoutes` has only
`/metrics` again. `scanVaultInventory(root, includeFiles)` still has the `includeFiles` option that
only this route used.

## 2026-11-21 UTC — Authorization per route in obsidian-sync, not in the utils

`checkMtlsPeer` is now `authenticateMtlsCaller` in senaev-utils: it checks the verified connection
and the expiry, and returns a caller with `hasDnsName(name)`. obsidian-sync decides who may do what:
`registerMtlsAuthorization` answers 401 without a valid certificate and 403 when the route does
not name the caller; a route that names no caller is denied (default deny, also the 404
handler). A route group is declared with `registerRoutesForCallers(server, [CLUSTER_HELPER], ...)`;
the service names are in `callers.ts`. Also removed the image-import `RUN` checks that I had added
to the cluster-helper and obsidian-sync Dockerfiles: they still named the renamed file
`watchTlsMaterial.ts`, so the image build would have failed. The older oauth check stays.

## 2026-11-21 UTC — The allowed client name moves from Helm into the code

obsidian-sync decides which service may call it, so the name is now the constant
`ALLOWED_CLIENT_NAME` (`cluster-helper.senaev-com.svc.cluster.local`) in `runVaultServer.ts`. The
env variable `MTLS_ALLOWED_CLIENT_NAME` is removed from `env.ts`, the Helm template and the test
setup. The namespace is now written in two places, the code and `internal-mtls.yaml`
(`.Release.Namespace`); a mismatch fails closed with 401.

## 2026-11-21 UTC — Rename TlsMaterial to TlsCredentials

"Material" is not a standard TLS term (only "keying material" is, in cryptography). The bundle
of key, certificate, CA certificate and validity dates is now `TlsCredentials`: files
`tlsCredentials.ts` and `watchTlsCredentials.ts`, functions `parseTlsCredentials`,
`watchTlsCredentials`, `isTlsCredentialsValidAt`, and the client and server method
`updateCredentials`. `createMtlsClient` also takes a plain origin now, with no normalization.

## 2026-11-21 UTC — Triage of the CodeRabbit review

Fixed: `stop()` of the certificate watcher now stops a poll that is already running; the
watcher reports once when the credentials in use expire (no renewal may arrive to change the
files, and there are no alerts); `validFrom` is checked together with `validTo`
(`notAfter` is renamed to `validTo`). Added the permission check to the activation gates in the
README. Decided not to change: the mixed-version window of the rolling update (no dual mode;
a bad deploy means `git revert`); `AbortSignal.any` on Node 18 (the services run Node 24, and the
only Node 18 consumer does not use it); the test of `createAbortSignalWithTimeout` keeps its stub of
`AbortSignal.timeout`. Already done before the review: exact `checkHost` options, the expiry
check of the peer on every request.

## 2026-11-16 UTC — Renew the CA automatically with the same key

User did not want a manual CA replacement or a risk of downtime. The CA Certificate now uses
`rotationPolicy: Never` and the default `renewBefore`: cert-manager renews it by itself and
keeps the key, so every leaf of the old certificate is valid for the renewed one. A real TLS
test (`keeps trusting leaves across a CA renewal that keeps the CA key`) checks both
directions. Leaves take the new `ca.crt` when they renew, every 4 days. Only a lost or
compromised CA key needs the manual replacement. Added a 📌 to move nextjs-app and vmagent
to mTLS and close port 8080.

## 2026-11-16 UTC — Remove alerts from the first implementation

User chose to drop the alerts and the cert-manager scrape for now: they were untested. Removed
`monitoring.yaml` from the issuers chart and the alert text from the plan and README. Added two
📌 follow-ups to the README: delete the unused Vault property, and add the alerts later.

## 2026-11-16 UTC — Implement the plan in PR #203

User asked to implement the feature in the same branch. Added the pki charts, the leaf
Certificates, the mTLS helpers in senaev-utils (with real TLS integration tests), two Fastify
instances in obsidian-sync and the mTLS client in cluster-helper. Removed the token check and
its secret wiring. `npm run simple-checks`: lint, typecheck, 1836 tests and helm lint pass.
Decisions made while coding: TLS 1.3 only with no session tickets (replaces the planned maximum
connection age); the CA Certificate renews 1 hour before its end so cert-manager does not rotate
the CA unnoticed; trust comes from `ca.crt` of each leaf Secret; monitoring uses cert-manager
metrics (three alerts) and the services log reload failures. Not tested here: cert-manager and
the Helm releases on the real cluster (no cluster access from this machine).

## 2026-11-16 UTC — Simplify the first implementation

Review of PR #203 found that cluster-helper and obsidian-sync run on the same node
(hetzner), so this migration fixes little security risk alone: it is a pilot of the
foundation for the node executor. User chose a small first implementation. Removed
trust-manager, revoked-leaf list, approver policy, CA backup, trust-overlap CA rotation,
dual mode and rollback procedures (a bad deploy is a git revert; a lost CA is replaced by a
new CA and a redeploy). Delivery is now two PRs: foundation, then transport and cutover.
Identity uses DNS SAN with `X509Certificate.checkHost()` instead of URI SAN. Listener split
is two Fastify instances. Reload uses `setSecureContext()` and a new Undici `Agent`.
Leaf lifetime: user chose days over hours, so 7 days with renewBefore 3 days (a failed
renewal leaves days to react, not hours).
User kept mTLS over projected ServiceAccount tokens, because it wants channel encryption;
SA tokens may be added on top later. Expired-material behavior: services never request
certificates, cert-manager renews, services pick up the files by polling.

## 2026-11-15 11:44 UTC — Merge design and prepare technical plan

PR #201 merged as 75b664ec13b415196a746fd7f0900d88d32e8753 after successful PR
checks. Inspected Fastify servers, fetch/tool clients, Helm and deploy ordering.
Found Next.js public routes and vmagent metrics sharing the token API listener;
planned separate protected mTLS and public-only HTTP listeners. Documented identity,
renewal/reload, trust rotation, compromise/recovery and staged implementation PRs.
This PR changes documentation only. Live prerequisites remain unverified.

## 2026-11-15 11:06 UTC — Choose Kubernetes CA and application-level mTLS

User chose a private CA managed inside Kubernetes and application-level mTLS.
Both services use Node.js: reuse established TLS/HTTPS mechanisms and compatible
packages through shared senaev-utils integration rather than custom cryptography.
Exact HTTP adapters and reload mechanics remain implementation work. Host-command
permissions, node coverage and approval retention are separate project decisions.

## 2026-11-15 11:00 UTC — Record shared certificate authentication project

User requested a separate project in PR #201 to establish internal certificate
identity and HTTPS/mTLS, starting by replacing cluster-helper → obsidian-sync shared
token authentication. Recorded issuance, renewal, key rotation, trust distribution,
CA replacement, authorization, monitoring, recovery and migration verification.
The node-executor project will reuse this foundation. Architecture and issuer
ownership remain proposals; this commit changes documentation only.
