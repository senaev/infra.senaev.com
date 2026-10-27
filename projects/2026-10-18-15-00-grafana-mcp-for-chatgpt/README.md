# 2026-10-18 — Grafana MCP for ChatGPT behind the existing OAuth

- [x] ChatGPT reads and writes Grafana (metrics, dashboards, alerts) through `https://mcp.senaev.com/grafana`

## Goal

Give ChatGPT access to Grafana and the metrics in VictoriaMetrics, with write access
(dashboards, alerts, annotations). Use the official
[`mcp-grafana`](https://github.com/grafana/mcp-grafana) server, and protect it with the
OAuth mechanism that already protects `https://mcp.senaev.com/chat-gpt`.

## Context

- cluster-helper is the OAuth authorization server (`auth.senaev.com`) and the protected
  resource (`mcp.senaev.com/chat-gpt`): [`cluster-helper/src/index.ts`](../../cluster-helper/src/index.ts),
  [`cluster-helper/src/oauth/`](../../cluster-helper/src/oauth/).
- The authorization server accepted only one resource (RFC 8707) and put it into the token `aud`.
- Grafana is in the `vm-stack` chart, namespace `telemetry`, Service
  `vm-stack-grafana:80`: [`provisioning/helm/vm-stack/values.yaml`](../../provisioning/helm/vm-stack/values.yaml).
- `mcp-grafana` 2.0.2 (`grafana/mcp-grafana:2.0.2`) has no OAuth. It has
  `-t streamable-http`, `--server-auth-token` (env `MCP_GRAFANA_SERVER_TOKEN`), `--allowed-hosts`,
  `--healthz-address`. It removes the validated `Authorization` header before it calls Grafana.
  `GRAFANA_SERVICE_ACCOUNT_TOKEN_FILE` is read again on every request.
  The image `ENTRYPOINT` starts the `sse` transport, so the Deployment must set `command`.
  `--allowed-hosts` defaults to loopback only. `/healthz` is served at the root, not under `/mcp`.
- Grafana cannot create service accounts from provisioning files. The admin login is in Vault
  `senaev-com-kv` (`GRAFANA_ADMIN_PASSWORD`; the user is `grafana_admin`, set in
  [`provisioning/helm/vm-stack/templates/external-secret.yaml`](../../provisioning/helm/vm-stack/templates/external-secret.yaml)).
  The `senaev-com` namespace does not have it yet: its
  [`external-secret.yaml`](../../provisioning/helm/senaev-com/templates/external-secret.yaml)
  lists each key one by one.
- `code-tools` is the pattern for an internal service that only cluster-helper may call
  (NetworkPolicy + internal token): [`provisioning/helm/senaev-com/templates/code-tools.yaml`](../../provisioning/helm/senaev-com/templates/code-tools.yaml).
  Its probes work with the NetworkPolicy in place, so node traffic is not blocked.
- [`cluster-helper/src/publicStaticProxy.ts`](../../cluster-helper/src/publicStaticProxy.ts) is the
  pattern for a streaming proxy (`fetch` + `Readable.from`).

## Plan

1. Authorization server: accept a list of resources. The token `aud` is the requested
   resource; a refresh keeps it; each endpoint accepts only tokens for its own resource.
   - Config `resource` → `resources` (first = `/chat-gpt`, the default when a client sends no
     `resource`, as now). `checkAccessToken(header, resource)` and
     `protectedResourceMetadata(resource)` take the resource.
   - Tokens that exist now have `aud` = `https://mcp.senaev.com/chat-gpt`, so they stay valid.
   - The `resource` parameter on refresh stays ignored, as now: the new tokens get the `aud`
     of the refresh token, so a refresh cannot switch resources.
2. Protected-resource metadata for each MCP path (`/.well-known/oauth-protected-resource/grafana`).
   `registerOAuthRoutes` gets a list of MCP paths; the root `/.well-known/oauth-protected-resource`
   keeps answering for `/chat-gpt`.
3. cluster-helper route `/grafana` on `mcp.senaev.com` (POST, GET, DELETE): check the OAuth
   token, replace it with an internal token, stream the request to `mcp-grafana`.
   - A Fastify plugin in `cluster-helper/src/grafanaMcp/`, so that its body parser applies only
     to this route: the body is read as a raw buffer and sent unchanged; `bodyLimit` 10 MiB
     (a dashboard JSON can be large).
   - The `401` + `WWW-Authenticate` challenge moves to a shared function for both MCP routes.
   - Request headers sent upstream: `content-type`, `accept`, `mcp-session-id`,
     `mcp-protocol-version`, `last-event-id`, and `authorization: Bearer <internal token>`.
     Not sent: the OAuth token, `origin`, `cookie`, `host`.
   - Response: status as is; headers `content-type`, `mcp-session-id`, `cache-control`; the body
     is streamed (`mcp-grafana` can answer with SSE). The upstream request is aborted when the
     client disconnects.
   - `mcp-grafana` unreachable → `502` with a JSON-RPC error.
   - Log each call like `🤖 ChatGPT MCP message`: HTTP method, JSON-RPC method, tool name,
     status. Not the arguments (dashboard JSON is large).
   - New env in cluster-helper: `MCP_GRAFANA_URL=http://mcp-grafana:8000/mcp`.
4. `mcp-grafana` Deployment + ClusterIP Service + NetworkPolicy (only cluster-helper can
   connect) in the `senaev-com` chart. No ingress.
   - New template `provisioning/helm/senaev-com/templates/mcp-grafana.yaml`, values block
     `mcpGrafana: { enabled, vps: hetzner, image: grafana/mcp-grafana:2.0.2 }`.
   - `command: ["/app/mcp-grafana", "-t", "streamable-http", "--address", "0.0.0.0:8000",
     "--allowed-hosts", "mcp-grafana:8000", "--healthz-address", ":8081", "--usage-stats", "disabled"]`.
   - Env: `GRAFANA_URL=http://vm-stack-grafana.telemetry.svc.cluster.local`,
     `GRAFANA_SERVICE_ACCOUNT_TOKEN_FILE`, `MCP_GRAFANA_SERVER_TOKEN`.
   - Probes on `:8081/healthz` (outside the Host check). One replica, `strategy: Recreate`
     (each start deletes the old tokens, see step 5). Memory request 64Mi, limit 256Mi.
   - NetworkPolicy: ingress only from `app: cluster-helper` on TCP 8000.
5. Grafana service account, with no manual step: an init container in the `mcp-grafana` pod
   logs in with the Grafana admin login and calls the Grafana API. It finds or creates the
   service account `mcp-grafana` with the **Editor** role, deletes the old tokens of that
   account, creates a new token and writes it to an `emptyDir` (`medium: Memory`).
   `mcp-grafana` reads it with `GRAFANA_SERVICE_ACCOUNT_TOKEN_FILE`. Only the init container
   gets the admin password. Each pod start makes a new token; one replica, so no conflict.
   - Image `node:24-alpine` (cluster-helper already uses it, so it is on the node; `fetch` and
     JSON need no extra packages). The script is a file in a ConfigMap, from
     `provisioning/helm/senaev-com/files/mcp-grafana/create-service-account-token.mjs`.
   - Wait for Grafana first: retry `GET /api/health` (every 5 s, up to 10 min). On a new
     cluster, `senaev-com` can start before `vm-stack`.
   - Grafana API, basic auth `grafana_admin` + `GRAFANA_ADMIN_PASSWORD`:
     `GET /api/serviceaccounts/search?query=mcp-grafana` → if absent,
     `POST /api/serviceaccounts {name, role: "Editor"}`; if the role differs,
     `PATCH /api/serviceaccounts/<id> {role: "Editor"}`;
     `GET /api/serviceaccounts/<id>/tokens` → `DELETE .../tokens/<tokenId>` for each;
     `POST /api/serviceaccounts/<id>/tokens {name: "mcp-grafana-<timestamp>"}` (names must be unique).
   - Any API error → exit non-zero, so the pod restarts and the error is in the init logs.
     Never log the token or the password.
   - Add `GRAFANA_ADMIN_PASSWORD` to the `senaev-com` ExternalSecret. Put the admin user name
     `grafana_admin` into `common-values.yaml`, and use it in both charts, so it is defined once.
   - Reloader annotation for `senaev-com-kv-secrets`: when the admin password changes, the pod
     restarts and makes a new token.
6. `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_MCP_GRAFANA` is in Vault `senaev-com-kv`
   (added by the user on 2026-10-18), like `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS`.
   Add it to the `senaev-com-kv-secrets` ExternalSecret. cluster-helper gets it as
   `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_MCP_GRAFANA`, and `mcp-grafana` as
   `MCP_GRAFANA_SERVER_TOKEN`.
   It is defence in depth on top of the NetworkPolicy: without it, a pod that gets past the
   policy (or a cluster where the policy is not enforced) has Editor rights in Grafana.
   - Generate a value (for a new Vault, or to rotate it): `openssl rand -hex 32`.
   - Both Deployments already have the reloader annotation for `senaev-com-kv-secrets`, so a
     new value in Vault restarts both pods.
   - _Changed 2026-10-18: first planned as a Helm-generated Secret (`lookup` + `randAlphaNum`);
     the user chose Vault instead._
7. Tests (vitest, next to the code):
   - `authorizationServer.test.ts`: a token for each resource; a missing `resource` gives the
     first one; an unknown resource is rejected; a refresh keeps `aud`; a token for one resource
     is `invalid` for the other; a token with the old single `aud` stays valid.
   - `registerOAuthRoutes.test.ts`: metadata at the root and at each MCP path.
   - Proxy plugin: with a fake upstream Fastify server — `401` without a token or with a
     `/chat-gpt` token; the upstream gets the internal token and not the OAuth token; the body
     is sent unchanged; `mcp-session-id` goes both ways; an SSE response is streamed; `502`
     when the upstream is down.
8. Docs: an "MCP endpoints" note in [`AGENTS.md`](../../AGENTS.md) (the two paths, the shared
   OAuth, how the Grafana token is made), and add `/grafana` to the smoke test there.
9. Rollout: one PR. `npm run simple-checks` must pass. On merge, the Helm job and the
   cluster-helper image build run at the same time. If the new image starts before the Helm job
   adds `MCP_GRAFANA_URL`, the new pod fails at startup; the old pod keeps serving (default
   `RollingUpdate` with one replica), and the Helm job then rolls out a working pod. So no
   outage, but a failed pod can show for a short time.
10. ChatGPT: add a connector with the URL `https://mcp.senaev.com/grafana` and sign in.

## Verification

- `curl -i -X POST https://mcp.senaev.com/grafana` → `401` with
  `WWW-Authenticate: Bearer resource_metadata="https://mcp.senaev.com/.well-known/oauth-protected-resource/grafana"`.
- `curl https://mcp.senaev.com/.well-known/oauth-protected-resource/grafana` → `resource` is
  `https://mcp.senaev.com/grafana`.
- The existing ChatGPT connector (`/chat-gpt`) still works without a new sign-in.
- In ChatGPT, with the new connector: "list my Grafana dashboards", "query
  `up` in the last hour", "add an annotation now with the text test".
- A token from the `/chat-gpt` connector gets `401` on `/grafana`, and the reverse.
- Grafana → Administration → Service accounts: one account `mcp-grafana`, role Editor, one
  token. After `kubectl -n senaev-com rollout restart deploy/mcp-grafana`: still one token, with a new name.
- `kubectl -n senaev-com logs deploy/mcp-grafana -c create-service-account-token` shows no
  token or password.
- From another pod (for example browserless), `curl http://mcp-grafana.senaev-com:8000/mcp`
  times out (NetworkPolicy).

## Findings

### 2026-10-18 — Decisions before implementation

- Write access is wanted: Editor role, no `--disable-write`.
- No manual Vault step for a new cluster: the service-account token comes from an init
  container (step 5), and the internal token from Helm (step 6). Rejected: the admin login in
  `mcp-grafana` itself (full server-admin rights for ChatGPT), and the Terraform Grafana
  provider (needs a separate run against a live Grafana).
- Plan checked against the code and charts; added the details for each step: the
  `mcp-grafana` command and flags, the Grafana API calls of the init container, the missing
  `GRAFANA_ADMIN_PASSWORD` in the `senaev-com` namespace, the proxy headers and body handling,
  tests, docs and the rollout order.
- The user added `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_MCP_GRAFANA` to Vault
  `senaev-com-kv`. Step 6 now reads it through the ExternalSecret; no Helm-generated Secret.

### 2026-10-18 — Implementation

Branch `grafana-mcp-for-chatgpt`, one commit per part: the OAuth server with several
resources, the `/grafana` proxy, the chart, the docs. Differences from the plan:

- The init script is in `provisioning/helm/senaev-com/config/mcp-grafana/` (the chart keeps its
  files in `config/`, not `files/`).
- The init script creates the new token **before** it deletes the old ones, so a failure in the
  middle leaves a working token. It was run against a fake Grafana API: it changed the role
  Viewer → Editor, ignored the account `mcp-grafana-other` (the search is a substring match),
  wrote the token file with mode `0600`, and logged no secret.
- The proxy answers `502`, not `401`, when `mcp-grafana` rejects the internal token: a `401`
  would tell ChatGPT that its own token is bad and start a new sign-in.
- Both containers run as UID 1000, the user of the `mcp-grafana` image, so it can read the token file.

### 2026-10-18 — CodeRabbit review of PR #93

One finding, valid: `cluster-helper/src/index.ts` did not register the `/grafana` proxy, nor add
it to the OAuth resources and metadata paths. When the commits were split, the backup copy of
`index.ts` was made after the `/grafana` parts were removed, so they were lost. No test covers
`index.ts`, so the checks passed. Fixed in the proxy commit.

### 2026-10-18 — Robot review of PR #93: two blocking findings

1. CI did not copy `provisioning/helm/common-values.yaml` to the server: each chart job sent only
   `provisioning/helm/<chart>/`, but `upgrade-namespace.sh` reads the server copy of
   `common-values.yaml`. So the new `grafanaAdminUser` would render empty in `vm-stack` and in
   the `mcp-grafana` init container. Fix: `update-helm-charts.yml` now has one
   `sync-provisioning` job that rsyncs the whole `provisioning/` folder (`--delete`, the same as
   `scripts/rsync-provisioning.sh`) before the chart matrix. A `concurrency` group stops an older
   run from overwriting a newer sync; a run in progress is not cancelled.
2. Grafana had no persistent storage (the subchart default is `persistence.enabled: false`). Each
   Grafana restart deleted the `mcp-grafana` service account and its token, and also the
   dashboards and alerts made in the UI. Fix: `vm-stack` Grafana has a 1Gi PVC (default storage
   class) and the `Recreate` strategy.

Effects of the persistent Grafana:

- The first deploy starts with an empty database, the same as each restart did before.
- Grafana uses `GRAFANA_ADMIN_PASSWORD` only when it creates the database. To change the password
  later, change it in Grafana too (`grafana cli admin reset-admin-password`), or the
  `mcp-grafana` init container cannot log in.
- On the merge, `vm-stack` and `senaev-com` deploy in parallel. If the `mcp-grafana` init
  container runs before the new Grafana pod, its service account is lost with the old pod. Then
  restart it once: `kubectl -n senaev-com rollout restart deploy/mcp-grafana`.

### 2026-10-18 — Deploy of PR #93 failed

Run `39164733201`: `sync-provisioning` passed, `update-charts (vm-stack)` failed, and
`update-charts (senaev-com)` was cancelled by the matrix `fail-fast`:

```
err: Error: UPGRADE FAILED: Deployment.apps "vm-stack-grafana" is invalid: spec.strategy.rollingUpdate: Forbidden: may not be specified when strategy `type` is 'Recreate'
...
update-charts (senaev-com)	Update chart	... out: 👉 [upgrade-namespace senaev-com senaev-com] Helm upgrade chart=[senaev-com] namespace=[senaev-com]
update-charts (senaev-com)	Update chart	... ##[error]The operation was canceled.
```

The live Grafana Deployment has the defaulted `rollingUpdate` field, which the three-way patch
keeps, and Kubernetes forbids it with `Recreate`. The `senaev-com` job was cancelled in the middle
of `helm upgrade --wait`, so that release can be left in `pending-upgrade`.

Fix (branch `fix-grafana-recreate-strategy`): `rollingUpdate: null` in the Grafana
`deploymentStrategy` (it renders literally, so the patch deletes the field), and `fail-fast: false`
in the chart matrix, so one failed chart never cancels another chart's Helm upgrade.

### 2026-10-18 — `rollingUpdate: null` did not help

Run `39165329920` (PR #94) failed on `vm-stack` with the same error. The server runs Helm 4
(`level=WARN msg=...` logs), which uses server-side apply, and server-side apply treats a `null`
as "not set", not as "delete". The `senaev-com` job only skipped its steps, because its chart did
not change.

Fix: keep `type: RollingUpdate` with `maxSurge: 0` and `maxUnavailable: 1`. With one replica,
the old pod stops before the new one starts, so no type change and no manual patch are needed.

### 2026-10-18 — `vm-stack` deployed

Run `39165840673` (PR #95) passed:

```
out: ✅ [upgrade-namespace vm-stack telemetry] Helm upgrade chart=[vm-stack] namespace=[telemetry]
```

Grafana now runs on the `vm-stack-grafana` PVC. `senaev-com` is still not deployed: the run of
PR #93 cancelled its upgrade, and later runs skipped it because the chart did not change. Its
release state (`pending-upgrade` or not) must be checked on the server before a manual deploy.

### 2026-10-18 — ChatGPT: "Authentication succeeded, action discovery failed"

The new cluster-helper is live: the unauthenticated request gets the right challenge.

```
$ curl -i -X POST https://mcp.senaev.com/grafana ...
HTTP/2 401
www-authenticate: Bearer resource_metadata="https://mcp.senaev.com/.well-known/oauth-protected-resource/grafana", scope="mcp"
```

Local test: `grafana/mcp-grafana:2.0.2` in Docker with the chart flags, behind the real
`grafanaMcpProxy`, with ChatGPT's request sequence:

```
initialize                 -> 200 application/json
notifications/initialized  -> 202
tools/list                 -> 200, 102617 bytes, 79 tools
GET (SSE stream)           -> 405
```

The proxy and `mcp-grafana` work together, and the tool list has valid names and object schemas
(no `$ref`). So the failure is probably in the cluster (for example `mcp-grafana` not ready,
and the proxy answers 502). The cluster-helper and `mcp-grafana` logs are needed.

### 2026-10-18 — Cause: `server/discover` gets 400 from mcp-grafana

Datadog logs of cluster-helper. Every ChatGPT attempt on `/grafana` stopped at its first request:

```
21:05:43 📈 Grafana MCP message  httpMethod=POST method=server/discover status=400
21:07:41 📈 Grafana MCP message  httpMethod=POST method=server/discover status=400
21:07:44 📈 Grafana MCP message  httpMethod=POST method=server/discover status=400
```

On `/chat-gpt`, the same first request gets a JSON-RPC "method not found", and ChatGPT falls back
to `initialize`:

```
20:55:24 🤖 ChatGPT MCP message | error.message: Method not found: server/discover
20:55:24 🤖 ChatGPT MCP message  method=initialize protocolVersion=2025-11-25
20:55:24 🤖 ChatGPT MCP message  method=notifications/initialized
20:55:24 🤖 ChatGPT MCP message  method=tools/call
```

Local test with `mcp-grafana:2.0.2`: without a newer `mcp-protocol-version` header it answers
`200 {"error":{"code":-32601,...}}`. With a newer one (`2026-07-28` in the test) it answers:

```
HTTP/1.1 400 Bad Request
{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"missing or invalid _meta field \"io.modelcontextprotocol/protocolVersion\""}}
```

The fallback path works with it: `initialize` with `2025-11-25`, then `tools/list` → 200, 79 tools.

Fix (pushed to `main`): the proxy answers `server/discover` itself with HTTP 200 and JSON-RPC
`-32601`, the same as `/chat-gpt`. The proxy log now also has the `mcp-protocol-version` header.

Second problem, from the Grafana logs: Grafana started on the new volume at 21:02
(`Created default admin user=grafana_admin`), after the `mcp-grafana` init container made its
token at 20:47 (`✅ Token created`). That token is gone, so `mcp-grafana` must restart once.

### 2026-10-18 — Works end to end

The user restarted `mcp-grafana`, then reconnected ChatGPT. Datadog logs:

```
21:17:15 ✅ Service account created
21:17:15 ✅ Token created
21:17:28 📈 Grafana MCP message  status=200   (server/discover, initialize, tools/list ...)
21:18:36 📈 Grafana MCP message  tool=search_dashboards / list_datasources
21:18:41 📈 Grafana MCP message  tool=query_prometheus  status=200
```

## Result

ChatGPT reads and writes Grafana through `https://mcp.senaev.com/grafana` (PRs #93, #94, #95 and
direct fixes on `main`):

- The cluster-helper OAuth server issues tokens per MCP resource; `/chat-gpt` tokens stayed valid.
- cluster-helper proxies `/grafana` to `mcp-grafana` (Editor) with an internal token; the
  init container creates the Grafana service account and token on each pod start.
- Grafana keeps its database on a 1Gi PVC (`RollingUpdate` with `maxSurge: 0`, not `Recreate`).
- CI rsyncs the whole `provisioning/` folder before the chart jobs, does not cancel other charts
  when one fails, and runs do not overlap.

Problems on the way: CI did not copy `common-values.yaml`; `Recreate` was rejected because Helm 4
server-side apply keeps the live `rollingUpdate` field; ChatGPT's `server/discover` probe got
`400` from `mcp-grafana` 2.0.2; the first token was lost when Grafana moved to the new volume.

Open points:

- If Grafana loses its database again, the `mcp-grafana` token stays dead until a manual
  restart: `/healthz` does not check Grafana. A liveness probe that checks the token would fix it.
- `cluster-helper/src/index.ts` has no test for the `/grafana` wiring.
- Grafana now reads `GRAFANA_ADMIN_PASSWORD` only when it creates its database. To change the
  password, also run `grafana cli admin reset-admin-password`.
- Remove the `server/discover` workaround when `mcp-grafana` handles the new protocol version.

### 2026-10-18 — Token watcher sidecar (after the Result; not committed yet)

For the first open point. A liveness probe cannot fix a dead token: a container restart does not
run the init container again. But `mcp-grafana` reads the token file on every call
(`mcpgrafana.go:82` in v2.0.2, "read fresh on every call so that rotated tokens ... are picked
up"), so a new token in the file is enough.

- `create-service-account-token.mjs` with `TOKEN_CHECK_INTERVAL_SECONDS` runs as the sidecar
  `watch-service-account-token`: every 60 s it calls `GET /api/org` with the token, and only on a
  `401` it makes a new token. It writes the file atomically (temporary file, then rename).
- The env of both token containers is in `_helpers.tpl` (`senaev-com.mcpGrafanaTokenEnv`).

Test against a fake Grafana API:

```
== 2. watch, valid token        -> no new token
== 3. Grafana lost its database
{"msg":"🔁 Grafana rejected the token, creating a new one"}
{"msg":"✅ Service account created","id":12,"role":"Editor"}
{"msg":"✅ Token created","id":13,...}
== 4. Grafana down (3 s)
{"msg":"⚠️ Token check failed","status":503}   (x3, no new token)
```

### 2026-10-18 — Token watcher works in the cluster

Pushed as `1ee4118` and deployed. The user deleted the `mcp-grafana` service account in the
Grafana UI. Datadog logs, Grafana and the `watch-service-account-token` container:

```
21:31:53 grafana  msg="Failed to authenticate request" client=auth.client.api-key error="invalid API key"
21:31:53 grafana  msg="Request Completed" method=GET path=/api/org status=401
21:31:54 [watch-service-account-token] 🔁 Grafana rejected the token, creating a new one
21:31:54 [watch-service-account-token] ✅ Service account created
21:31:54 [watch-service-account-token] ✅ Token created
```

The first open point of the Result is fixed.

### 2026-10-18 — Correction: the `server/discover` workaround waits for ChatGPT, not mcp-grafana

The proxy log now shows the header that ChatGPT sends:

```
server/discover  protocolVersion=2026-07-28  status=200   (answered by the proxy)
initialize       protocolVersion=-           status=200
tools/list       protocolVersion=2025-11-25  status=200
```

`mcp-grafana` 2.0.2 supports 2026-07-28, and rejects the probe because the body has no
`_meta["io.modelcontextprotocol/protocolVersion"]`, which that protocol version requires in every
request. The go-sdk maintainers confirmed this behaviour in
[modelcontextprotocol/go-sdk#1346](https://github.com/modelcontextprotocol/go-sdk/issues/1346)
(closed as not a bug: a header without `_meta` is a malformed request). No issue about this exists
for `mcp-grafana`, and OpenAI has no public tracker. So the last open point of the Result is
wrong: keep the workaround until ChatGPT sends a well-formed 2026-07-28 probe. Related, for
when it does: [grafana/mcp-grafana#1338](https://github.com/grafana/mcp-grafana/issues/1338)
(open, `tools/list` at 2026-07-28 misses fields).

### 2026-10-18 — Test for the MCP endpoint wiring

For the open point "`index.ts` has no test for the `/grafana` wiring". The wiring moved from
`index.ts` into the plugin `cluster-helper/src/mcpEndpoints.ts`: one `MCP_PATHS` list gives the
authorization server resources (`mcpResources()`), the metadata routes, the `/chat-gpt` routes
and the Grafana proxy. `index.ts` only registers it with its dependencies.

`mcpEndpoints.test.ts` uses a real authorization server and real tokens for each path: each path
answers 401 with its own metadata URL, serves its metadata, accepts its own token and rejects the
other one, and sends the request to the right server. Both earlier regressions make it fail:

```
grafanaMcpProxy not registered  -> Tests  3 failed | 7 passed (10)
/grafana removed from MCP_PATHS -> Tests  3 failed | 4 passed (7)
```
