# 2026-10-18 — Grafana MCP for ChatGPT behind the existing OAuth

- [ ] ChatGPT reads and writes Grafana (metrics, dashboards, alerts) through `https://mcp.senaev.com/grafana`

## Goal

Give ChatGPT access to Grafana and the metrics in VictoriaMetrics, with write access
(dashboards, alerts, annotations). Use the official
[`mcp-grafana`](https://github.com/grafana/mcp-grafana) server, and protect it with the
OAuth mechanism that already protects `https://mcp.senaev.com/chat-gpt`.

## Context

- cluster-helper is the OAuth authorization server (`auth.senaev.com`) and the protected
  resource (`mcp.senaev.com/chat-gpt`): [`cluster-helper/src/index.ts`](../cluster-helper/src/index.ts),
  [`cluster-helper/src/oauth/`](../cluster-helper/src/oauth/).
- The authorization server accepted only one resource (RFC 8707) and put it into the token `aud`.
- Grafana is in the `vm-stack` chart, namespace `telemetry`, Service
  `vm-stack-grafana:80`: [`provisioning/helm/vm-stack/values.yaml`](../provisioning/helm/vm-stack/values.yaml).
- `mcp-grafana` 2.0.2 (`grafana/mcp-grafana:2.0.2`) has no OAuth. It has
  `-t streamable-http`, `--server-auth-token` (env `MCP_GRAFANA_SERVER_TOKEN`), `--allowed-hosts`,
  `--healthz-address`. It removes the validated `Authorization` header before it calls Grafana.

## Plan

1. Authorization server: accept a list of resources. The token `aud` is the requested
   resource; a refresh keeps it; each endpoint accepts only tokens for its own resource.
2. Protected-resource metadata for each MCP path (`/.well-known/oauth-protected-resource/grafana`).
3. cluster-helper route `/grafana` on `mcp.senaev.com` (POST, GET, DELETE): check the OAuth
   token, replace it with an internal token, stream the request to `mcp-grafana`.
4. `mcp-grafana` Deployment + ClusterIP Service + NetworkPolicy (only cluster-helper can
   connect) in the `senaev-com` chart. No ingress.
5. Manual steps (user):
   - Grafana → Administration → Service accounts → new account `mcp-grafana`, role **Editor**,
     add a token. Put it into Vault `senaev-com-kv` as `GRAFANA_MCP_SERVICE_ACCOUNT_TOKEN`.
   - Put a random value into Vault `senaev-com-kv` as
     `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_MCP_GRAFANA` (`openssl rand -hex 32`).
   - Do both **before** the merge: cluster-helper and mcp-grafana need the keys to start.
6. ChatGPT: add a connector with the URL `https://mcp.senaev.com/grafana` and sign in.

## Verification

- `curl -i -X POST https://mcp.senaev.com/grafana` → `401` with
  `WWW-Authenticate: Bearer resource_metadata="https://mcp.senaev.com/.well-known/oauth-protected-resource/grafana"`.
- `curl https://mcp.senaev.com/.well-known/oauth-protected-resource/grafana` → `resource` is
  `https://mcp.senaev.com/grafana`.
- The existing ChatGPT connector (`/chat-gpt`) still works without a new sign-in.
- In ChatGPT, with the new connector: "list my Grafana dashboards", "query
  `up` in the last hour", "add an annotation now with the text test".
- A token from the `/chat-gpt` connector gets `401` on `/grafana`, and the reverse.

## Findings

### 2026-10-18 — Implementation

Code and chart changes are in the working tree (see `## Result` when done).
