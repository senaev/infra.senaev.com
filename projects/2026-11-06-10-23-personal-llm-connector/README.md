# 2026-11-06 — Personal LLM connector

One connector of my own, through which I request any LLM, including the home `llm-server`.

## Goal

A single endpoint and a single list of models. When I add a new LLM to it, the model
appears automatically in the API (`GET /models`), and so in every client that reads that
list. Whether OpenCode reads the list by itself is not known yet.

## Context

- Home model: `llm-server` (llama.cpp, OpenAI-compatible API). See
  [`2026-10-18-16-05-home-development-llm-server`](../2026-10-18-16-05-home-development-llm-server/README.md).
- cluster-helper already has a provider chain (llm-server, then OpenRouter):
  `cluster-helper/src/llm/`.

## Design

```
 OpenCode (laptop) ── HTTPS ──▶ https://api.senaev.com/llm ─┐
                                (Traefik on hetzner)         │
 n8n, other cluster services ──▶ http://cluster-helper:3000/llm
                                                             │
                                                             ▼
                                           cluster-helper ──▶ llm-server (home, Qwen3)
```

### Where it runs

- In cluster-helper, as a new Fastify plugin under `cluster-helper/src/llm/`. There is no
  new service, no new image and no new Deployment.
- The API is OpenAI-compatible under the prefix `/llm` (instead of `/v1`):
  - `GET /llm/models`: the list of models;
  - `POST /llm/chat/completions`: a request to one model.
- The routes have no host constraint, so the internal and the public URL have the same
  path. Clients use the prefix as their `baseURL`.

### Endpoints

| From | Base URL |
| --- | --- |
| Outside the cluster (OpenCode on the laptop) | `https://api.senaev.com/llm` |
| Inside the cluster (n8n, other services) | `http://cluster-helper:3000/llm` |

- The public host `webhook-endpoint.senaev.com` is renamed to `api.senaev.com` before the
  LLM endpoint is built, because it now serves more than webhooks:
  - ✅ DNS: `api.senaev.com` A `77.42.120.71` (the user added it);
  - 📌 `clusterHelper.webhookDomain` → `apiDomain`, env `WEBHOOK_DOMAIN` → `API_DOMAIN`;
    cluster-helper registers the new Telegram webhook URL at startup by itself;
  - 📌 the ingress serves both hosts until every external caller has moved;
  - 📌 the user changes the Alisa skill URL in the Yandex Dialogs console by hand;
  - 📌 then remove `webhook-endpoint.senaev.com` from the ingress and DNS.
- Internal clients need a rule in the cluster-helper NetworkPolicy. n8n has one already.
- `llm-server` stays private. Only cluster-helper and n8n can reach it.

### Model registry

- Only models that run in the cluster. No OpenRouter models and no fallback chains in the
  connector; the OpenRouter fallback stays inside tricky-dad.
- One list in the code, for example `cluster-helper/src/llm/llmEndpointModels.ts`. Each
  entry has a public model id and the in-cluster upstream URL. The first and only entry:
  `home/qwen3-4b` → `llm-server`.
- `GET /models` is made from this list. To add a model, add one entry and push; the
  deploy makes it visible in the API.

### Requests

- The request body goes to the upstream as it is, with only `model` replaced, so tools,
  `response_format` and other OpenAI fields work.
- `stream: true` is proxied as Server-Sent Events. OpenCode needs it.
- No body size limit and no timeout for now. A long prompt to llm-server can take
  several minutes.
- An unknown model gives `404`; an upstream error is passed to the client as it is.
- Each request is logged with the model, the duration and the status; no prompt text in
  the logs.

### Authentication

- One API key for all clients: `Authorization: Bearer <key>`, as every OpenAI-compatible
  client expects.
- The key is a new Vault entry, `LLM_ENDPOINT_API_KEY` in `senaev-com-kv`, and goes to
  cluster-helper through External Secrets as an environment variable.
- cluster-helper compares the key in constant time and returns `401` without it, also
  for internal requests: the same port is public.
- To change the key: put a new value in Vault, then update every client.

### Clients

- **OpenCode**: a custom provider with `@ai-sdk/openai-compatible`, the public base URL
  and the key. If OpenCode does not read `/models`, the models are listed in
  `opencode.json` by hand or by a script.
- **n8n**: an OpenAI credential with the internal base URL and the key. Its direct access
  to llm-server stays too.
- **cluster-helper** (tricky-dad and others): keeps calling the providers in-process; it
  does not need to call itself over HTTP.
