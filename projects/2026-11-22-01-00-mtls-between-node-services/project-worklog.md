## 2026-11-22 16:10 UTC — Certificate alerts added

The user asked to add the cert-manager alerts to the docs pull request (#275). Added: a `VMServiceScrape`
`cert-manager` in `telemetry/vm-stack/templates/scrape.yaml` (namespace `pki`, port `http-metrics`, label
selector of the controller Service; `honorLabels: true` so the `namespace` label stays the namespace of the
Certificate; it lives in vm-stack because the CRDs come from the telemetry release, which deploys after
`pki`), and the group `internal-certificates` in `senaev-com/templates/alerts.yaml`: `certificate-not-ready`
(`certmanager_certificate_ready_status{condition="True"} == 0` for 15 min), `certificate-expires-soon`
(`expiration_timestamp - time() < 2 days`; a leaf renews at 3 days left) and `certificate-metrics-unavailable`
(`absent(...)` for 15 min). `npm run check:helm` passes and the templates render; the rules are not run
against real data before the deploy (no `promtool` here). To check after the deploy: the target is up and
the metrics have six series.

## 2026-11-22 15:41 UTC — Merged, deployed and verified

Pull request #272 was merged; its own Deploy run failed in the image builds because #267 was merged right
after it (the build step refuses a commit that is no longer the head of `main`). The run of #267 built all six
images and deployed every release, so the change went out with it. Checked after the deploy:
- Datadog logs: all services listen on the new ports; no real errors or warnings (only `npm notice`,
  `exiting on signal 15` of the old pods and an ssh identity line, all on stderr).
- Datadog metrics: zero container restarts; every deployment at full availability (a short dip for the
  `Recreate` of code-tools).
- `npm run test:smoke` passes.
- `kubectl get certificate -A` (run by the user):

```
NAMESPACE    NAME                      READY   SECRET                    AGE
pki          internal-ca               True    internal-ca               15h
senaev-com   cluster-helper-tls        True    cluster-helper-tls        15h
senaev-com   media-server-helper-tls   True    media-server-helper-tls   29m
senaev-com   obsidian-sync-tls         True    obsidian-sync-tls         15h
senaev-com   senaev-code-tools-tls     True    senaev-code-tools-tls     29m
vpn          vpn-subscription-tls      True    vpn-subscription-tls      24m
```

All six are ready. The user then tested each edge by hand: a vpn-subscription Telegram message, a code tool
call from ChatGPT and a torrent file delivered to senaev-media all work, and deleted the two Vault
properties of the removed tokens. The project is done; the cert-manager alerts are a later follow-up.

## 2026-11-22 14:30 UTC — Review fixes before the merge

A review of the pull request (six reviewers) found one defect: code-tools lost its 4 MiB body limit. Fixed with
`createCodeToolsMtlsServer` (limit 4 MiB, a test with a 2 MiB body), the stale `EXPOSE 8080` of the code-tools
image was corrected, and the three tests of a caller without a certificate were rewritten to use a client that
trusts the test CA (`fetchWithoutClientCertificate`), so they really test the client certificate. The user
chose to skip two non-blocking points: the deploy-order windows (a few minutes of failed calls, they heal) and
the open `chatId` of the Telegram route (not new; now limited to vpn-subscription).

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
