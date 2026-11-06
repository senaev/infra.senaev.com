# Worklog

## 2026-11-06 14:15 UTC — Host rename deployed (PR #123)

Deploy run `42221871800` succeeded. `https://api.senaev.com` has a valid certificate and
answers; `webhook-endpoint.senaev.com` still answers too. cluster-helper logs:

```
2026-11-06T13:02:48Z	✅ Webhook set	cluster-helper
2026-11-06T13:02:48Z	✅ Cluster helper is ready	cluster-helper
```

The Telegram webhook is registered on the new host. Smoke tests pass. Not checked yet: a
real Telegram message, and Alisa after its skill URL is changed in Yandex Dialogs.

## 2026-11-06 13:40 UTC — Host rename first, path `/llm`

The user confirmed `api.senaev.com`, added its DNS record, and decided to rename the host
before the LLM endpoint, in a separate branch and PR (not in tricky-dad PR #122). The
values key is `apiDomain`, the env var `API_DOMAIN`. The LLM prefix is `/llm`.

```
$ dig +short api.senaev.com
77.42.120.71
```

The same IP as `webhook-endpoint.senaev.com` and `mcp.senaev.com`: the hetzner ingress.

## 2026-11-06 12:00 UTC — Design decisions, round 2

The user decided: prefix `/llm-endpoint` (no `-v1`); only models that run in the cluster,
no OpenRouter in the connector; one model for now, `home/qwen3-4b`; no size or time
limits for now. The public host stays the cluster-helper host, but
`webhook-endpoint.senaev.com` gets a new name, because it serves more than webhooks
(proposed `api.senaev.com`, not confirmed yet).

## 2026-11-06 — Design written

The user decided: reuse cluster-helper (no LiteLLM, no new service), use the prefix
`/llm-endpoint-v1` instead of `/v1` with the same path inside and outside the cluster, and
one API key for all clients for now. Clients: OpenCode, n8n, cluster services. Models
must appear automatically in `GET /models`; OpenCode discovery is not required.

## 2026-11-06 10:23 UTC — Project created

Created at the user's request as a follow-up of the llm-server project. Only the idea is
written down.
