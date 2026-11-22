## 2026-11-22 10:00 UTC — Implemented, pull request opened

All three edges are implemented in one branch. Shape, in short:
- `registerMtlsCallerAllowlist` moved to `senaev-utils/src/utils/mtls` (it logs with `request.log` now);
  `createMtlsFastifyServer` got an optional `bodyLimit`.
- code-tools: `registerCodeToolsRoutes` (routes), `registerProtectedCodeToolsRoutes` (allowlist + routes, mTLS
  8443), `createHealthServer` (plain 8081, only `/health`), `runCodeToolsServer`. The bearer token, `env.ts` and
  `vitest.setup.ts` are gone; tests use `createTestCodeToolsServer` (plain instance, `inject`).
- media-server-helper: `registerTorrentFileRoutes` (allowlist + route), mTLS on 8443, no plain port, NetworkPolicy
  from cluster-helper, no `request.body` in the log.
- cluster-helper: `createCodeToolsApi(client)`, the torrent outbox takes a client, `createServiceClient(origin)` in
  `run.ts` makes one client for each callee from the shared watcher; `createMtlsServer` with
  `registerSendTelegramMessageRoute` (shared with the internal server) and `ALLOWED_CALLERS = [vpn-subscription]`.
- vpn-subscription: `createClusterHelperTelegram`, its own watcher and client; the ExternalName Service is deleted.
- Helm: new Certificates, mounts at `/etc/mtls`, `CODE_TOOLS_URL`, `MEDIA_SERVER_HELPER_URL`, `CLUSTER_HELPER_URL`,
  NetworkPolicy rules; `codeTools.secrets` removed from values and schema; the Vault key is no longer read.
- The loggers of code-tools and media-server-helper are typed as `FastifyBaseLogger`, as in obsidian-sync, so that
  a plain `Pick<FastifyInstance, ...>` accepts the instance.

`npm run simple-checks` passes (250 test files, 2071 tests). Not yet verified on the cluster.

## 2026-11-22 01:20 UTC — Plan final: no open questions

The user agreed to delete the ExternalName Service `cluster-helper` in the `vpn` namespace together with the
switch of vpn-subscription to the real name over mTLS. The plan in the README has no open questions now.

## 2026-11-22 01:10 UTC — Answers to the open questions

- code-tools: a second Fastify instance on a plain port that serves only `/health` (like obsidian-sync), and the
  mTLS port for everything else.
- media-server-helper: close plain port 3000, serve only mTLS on 8443.
- nextjs-app → obsidian-sync is left for a later change, because its client is in another repo. The pull request
  covers three edges, not four, and plain 8080 keeps `?note=`, `?file=` and `/metrics`.
- The key of the code-tools server stays readable by its own shell tools: accepted.
- `media-server-helper` stops logging the whole request body on an invalid request, in this pull request.
- Open: the ExternalName Service `cluster-helper` in the `vpn` namespace. The user asked what it is; the README
  now explains it and still proposes to delete it.

## 2026-11-22 01:00 UTC — Project started: scope and delivery decided

The user asked for mTLS between all self-written Node.js containers of this repo. An inventory of all
service-to-service calls (read-only, from the code and the Helm templates) found four Node-to-Node edges
left besides the finished cluster-helper → obsidian-sync: cluster-helper → code-tools (bearer token),
cluster-helper → media-server-helper (no authentication), vpn-subscription → cluster-helper (NetworkPolicy
only) and nextjs-app → obsidian-sync (other repo). Callers that cannot present our certificate (n8n,
Alertmanager, qbittorrent's `curl`, the kubelet probes, vmagent, Traefik) stay on plain HTTP.

The user chose all four edges and one pull request for everything. The README has the plan and the open
questions (code-tools probe, media-server-helper port, the cross-repo rollout of nextjs-app, the
ExternalName Service, the key in the code-tools container, a body logged by media-server-helper).
