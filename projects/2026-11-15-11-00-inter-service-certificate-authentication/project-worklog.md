## 2026-11-22 00:43 UTC — Deployed and verified

PR #203 was squash-merged as `790ce455` and the Deploy run (`44967022067`) succeeded in all jobs,
`pki` and `senaev-com` included. `npm run test:smoke` passed 5 of 5; it covers the short link
(`s.senaev.com`) and `static.senaev.com`, which both go through the cluster-helper mTLS client to
obsidian-sync, and a nextjs-app page on plain HTTP 8080. Datadog logs show `✅ mTLS server listening`
in cluster-helper, `✅ Vault servers listening` on 8443 and 8080 in obsidian-sync, incoming requests
on the new pod, and no error or warning lines apart from `npm notice` output. The user then ran:

```
kubectl -n senaev-com get certificate
NAME                 READY   SECRET               AGE
cluster-helper-tls   True    cluster-helper-tls   7m6s
obsidian-sync-tls    True    obsidian-sync-tls    7m6s

kubectl -n senaev-com get pods -o yaml | grep -c cluster-helper-client-tls
0
```

Both leaves are ready and no pod mounts the old Secret name. The user also read a note through the
Obsidian MCP connector in ChatGPT: it works. `kubectl -n senaev-com delete secret
cluster-helper-client-tls` answered `NotFound`: the Certificate was renamed before its first deploy, so
that Secret never existed, and the follow-up to delete it is dropped. Open: delete the Vault property
`INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN`, the RBAC check with `kubectl auth can-i`, the first
leaf renewal, and the other 📌 follow-ups of the README.

## 2026-11-22 UTC — Merged `main` into the branch

`main` had moved on (the PR conflicted in five files), and the old `cluster-helper/src/index.ts`
that it changed no longer exists here, so its changes were applied by hand to the new files:
the alerting heartbeat monitor (created in `run.ts`, `recordHeartbeat` on the internal server,
`start()` before the listeners, `stop()` subscribed before the servers so that it closes after
them), the `/job-search/recommendations` route of the internal server (now through
`obsidianSyncApi.addJobSearchRecommendations`), the three MCP servers (obsidian, code, telegram)
and the removal of the password login in `createPublicServer.ts`. On the obsidian-sync side,
`registerJobSearchRoutes` takes a plain Fastify instance and is registered among the protected
routes (mTLS, caller allowlist). The new `claude-code` package needs its own `npm ci` (`ci:all`).
Checked: lint, typecheck, `check:helm` and all 2070 tests pass. Not run in a cluster.

## 2026-11-22 UTC — Fixes from the robot review of the PR

Done: the three servers of cluster-helper close with `Promise.allSettled` and throw an `AggregateError`
afterwards, so the client closes only after every server finished and the controller still reports the
failure and exits with 1. `scanVaultInventory` lost `includeFiles`, the `files` field and `largestFiles`
(a running maximum with a path tie-break replaces the top-10 list). Tests added or fixed: wildcard SAN
and CN-only certificates are denied; the redirect test now redirects to a server that would accept the
certificate and counts its requests; the real `registerMtlsAuthentication` hook is tested for the
caller and for an expired certificate (fake `Date`); the allowed-caller route test pins the status
that each route answers; `run.test.ts` checks that the webhook secret of the public server and of
`setWebhook` is the same, and a failing server close; the shutdown tests wait on the `exit` call, not on
`vi.waitFor`.

Not done, on purpose: dropping the `path` label of `obsidian_vault_largest_file_bytes`. `/metrics` was
already on port 8080 and reachable by nextjs-app before this PR, an attacker needs an SSRF in
nextjs-app, and the label gives only a file name, which the 4.5 MB early warning needs. If it must
close, give `/metrics` its own port that only vmagent can reach (a follow-up, not a fix here).
Also not done: tests for the routes moved into `createPublicServer` and `createInternalServer` (they
had none in `index.ts` either), and the other low-value test gaps.

## 2026-11-22 UTC — `createShutdownController(process, reportError)` owns the closers

`senaev-utils/src/utils/process/createShutdownController.ts` listens once for SIGTERM and SIGINT and
returns `subscribeShutdown(close)`. The controller keeps the closers, runs them on the first signal in
the reverse order of the subscription (awaited, one after another), reports a failing closer with
`reportError`, keeps going, and calls `process.exit(0)` (or 1 after a failure). A second signal finds no
listener and ends the process at once. `run()` of cluster-helper therefore has no `try`/`finally` and no
closers array: each part subscribes right after it is created (the certificate watcher, the client,
the three servers, the torrent outbox), and the "shutting down, not ready" step is subscribed last so it
runs first. `run()` returns when the service is up (the listeners keep the process alive); a failed start
is thrown, and `index.ts` exits with 1 without closing the parts that already exist, as before the
refactor. This replaces the `waitForShutdown` function below; the earlier records are history.

## 2026-11-22 UTC — cluster-helper has no module state: `run()` owns the lifecycle

`index.ts` only calls `run()` (`run.ts`). `run()` calls `createShutdownController(process)`
(senaev-utils, `utils/process`), which subscribes once to SIGTERM and SIGINT (a second signal ends the
process at once) and returns `waitForShutdown`, a function that gives the same promise to every caller.
`run()` creates the parts in order and registers a closer for each. The promise only ends the wait: the parts are closed in the
reverse order, one after another, in `finally` (servers, then the obsidian-sync client, then the
certificate watcher). The order matters because a request in progress may still use the client; a
listener in every part would close them all at the same moment, and `run()` could not know when the
closing ends. Only a part that must stop on its own gets `waitForShutdown`: the torrent outbox loop
(`startTorrentOutboxProcessor(waitForShutdown)`, which keeps a local `AbortController` only to end its
sleep between two passes). One subscription per part instead of the closers array was dropped for the
same reason. The outbox now stops on the signal only, not when the start fails (the process exits then).
The routes moved into `createInternalServer` and `createPublicServer`, which take their dependencies
(`obsidianSyncApi`, the bot user, the webhook secret) as arguments. `run.test.ts` checks the close
order, the outbox signal and the cleanup after a failed start. The local `let obsidianSyncApi` of
`index.ts` is gone with the module.

## 2026-11-22 UTC — The obsidian-sync API is an argument, not module state

`cluster-helper/src/obsidianSyncClient.ts` is gone. `obsidianSyncApi.ts` exports
`createObsidianSyncApi(client)`, which returns the bound functions (`fetchObsidianSync`,
`callVaultTool`, `getMilestones`, `getShortLink`, `createShortLink`, `addObsidianTasks`,
`readVaultResource`). `main()` in `index.ts` creates the client with `createMtlsClient`, builds the
API and closes the client on shutdown. cluster-helper is CommonJS (no top-level `await`) and the
credentials exist only after `await watchTlsCredentials`, so `index.ts` keeps a local, not
exported `let obsidianSyncApi`, which `main()` sets before any server listens. Modules receive the
API as an argument, typed as `Pick<ObsidianSyncApi, …>` of what they call:
`processTelegramWebhookData`, `processOwnerDirectMessage`, `processTrickyDadChatMessage`,
`handleAlisaRequest`, `runTrickyDadCommand` (the action `run` context has `obsidianSyncApi`),
`sendDailyOverview` and `proxyPublicStaticFile`. Tests pass a plain object with `vi.fn()`, and
three `vi.mock('../obsidianSyncApi')` calls are gone.

## 2026-11-22 UTC — One shared watcher of the certificate files

`watchTlsCredentials({ logger })` returns `{ credentials: Signal<TlsCredentials>, stop }` and logs
each renewal and each unusable snapshot itself (`onChange` and `onError` are gone). The process
creates one watcher and gives its signal to every user: `createMtlsFastifyServer({ Fastify, logger,
credentials })` (now synchronous) calls `setSecureContext` on each renewal, and `createMtlsClient({
origin, credentials })` makes a new agent on each renewal; `close()` of each unsubscribes it. The
owner stops the watcher (`runVaultServer` in obsidian-sync, `shutdown` in cluster-helper). So
cluster-helper polls the files once, for the obsidian-sync client and for its mTLS server.
`MtlsClient.updateCredentials` is removed. Tests pass a `Signal` with test credentials, so the
obsidian-sync and cluster-helper tests no longer mock `readTlsFiles`.

## 2026-11-22 UTC — An empty mTLS listener in cluster-helper

cluster-helper starts `createMtlsFastifyServer` on 8443: certificate check (CA and expiry) and no
routes. It prepares the next step, when a service calls cluster-helper over mTLS. The `internalServer`
on port 80 cannot move to mTLS: its callers (Alertmanager, n8n, qBittorrent, kubelet) have no
certificate. The certificate is now `cluster-helper-tls` with `client auth` and `server auth` (one
certificate for both roles in `/etc/mtls`), the port is on the Deployment and the Service, and the
NetworkPolicy has no rule for it, so nothing can reach it. There is no allowed-callers check yet:
add one with the first route.

## 2026-11-21 UTC — `registerMtlsAuthorization` is now `registerMtlsCallerAllowlist`

The new name says that the hook is a list of allowed callers (403 for any other service), like
`ALLOWED_CALLERS`. The files moved with it. Older records below use the old name.

## 2026-11-21 UTC — No `createVaultServer` and no `createFastifyServer`

`createVaultServer` was only `Fastify({ loggerInstance })`. A shared `createFastifyServer` with an
optional `https` needed two overloads (the return type differs for HTTPS) to save one line, so it
was tried and removed. `runVaultServer` and the tests call `Fastify({ loggerInstance: logger as
FastifyBaseLogger })` directly. `createMtlsFastifyServer` calls `Fastify({ loggerInstance, https })`
itself.

The casts are gone too: `obsidian-sync/src/logger.ts` exports `logger` typed as `FastifyBaseLogger`
(with pino's own type the logger type of the instance changes, and the plain `FastifyInstance` no
longer matches; the comment is there). `runToolCall` in senaev-utils now takes
`Pick<Logger, 'info' | 'error'>` instead of the whole pino `Logger`, so it accepts that logger.

## 2026-11-21 UTC — `createMtlsFastifyServer` runs the credentials watcher

`createMtlsFastifyServer({ Fastify, logger })` is now async and returns the Fastify instance. It
calls `watchTlsCredentials` itself: renewed files go to `setSecureContext`, the two log lines moved
into it, and an `onClose` hook stops the polling, so `server.close()` is the only cleanup.
`runVaultServer` lost its reload-target workaround. The obsidian-sync integration tests mock
`readTlsFiles` instead of passing credentials.

## 2026-11-21 UTC — The 401 and 403 answers say why

The caller of the protected API is one of our own services (it passed the TLS handshake), so a
reason is safe and saves a look in the server logs. `registerMtlsAuthentication` answers 401 with the
reason of `authenticateMtlsCaller` (for example `The client certificate is expired`), and
`registerMtlsAuthorization` answers 403 with `This service is not allowed to call this API`. The
`code` values are unchanged. The 401 without a caller in `registerMtlsAuthorization` stays generic:
it is a server bug, not a client problem. The answer never holds the caller name or the allowed list.

## 2026-11-21 UTC — `FastifyRequestWithMtls` replaces the Fastify module augmentation

The `declare module 'fastify'` block for `mtlsCaller` is removed, because it changed the type of
every Fastify request in every package that imports senaev-utils. `registerMtlsAuthentication`
exports `FastifyRequestWithMtls` (`FastifyRequest & { mtlsCaller?: MtlsCaller }`), and the code
casts to it where it sets or reads the caller (the authentication hook and
`registerMtlsAuthorization`). `decorateRequest('mtlsCaller', undefined)` stays for the request shape.

## 2026-11-21 UTC — The mTLS Fastify factory moved to senaev-utils

`createProtectedVaultServer` is now `createMtlsFastifyServer(credentials, logger)` in
`senaev-utils/src/utils/mtls/`, with `registerMtlsAuthentication` (its hook logs with
`request.log`, so it needs no service logger). The unit test of the hook moved with it.
obsidian-sync keeps `registerMtlsAuthorization`, `ALLOWED_CALLERS` and the routes.
The caller passes `Fastify` (`createMtlsFastifyServer({ Fastify, credentials, logger })`), so the
library imports only Fastify types. `fastify` stays a dev dependency and an optional peer of
senaev-utils: a peer cannot give a runtime import to a symlinked library (Node resolves it from
`/app/senaev-utils`, not from the service), and a production dependency would add a second copy
of Fastify to every image and to `supabase-list-notes`. `bodyLimit` is no longer set: the
Fastify default is 1 MiB, the same as the old value.

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
`/metrics` again. (The `includeFiles` option of `scanVaultInventory`, which only this route used,
was removed later: see the record about the robot review.)

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
