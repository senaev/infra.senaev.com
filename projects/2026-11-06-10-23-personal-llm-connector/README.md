# 2026-11-06 — Personal LLM connector

One connector of my own, through which I request any LLM, including the home `llm-server`.

## Goal

A single endpoint and a single list of models. When I add a new LLM to it, the model
appears automatically in the API (`GET /models`), and so in every client that reads that
list. Whether OpenCode reads the list by itself is not known yet.

## Context

- Home model: `llm-server` (llama.cpp, OpenAI-compatible API). See
  [`2026-10-18-16-05-home-development-llm-server`](../2026-10-18-16-05-home-development-llm-server/README.md).
- The home server was disabled in [PR #192](https://github.com/senaev/infra.senaev.com/pull/192/changes).
  Helm omits `LLM_SERVER_URL` while it is disabled.

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

- [PR #123](https://github.com/senaev/infra.senaev.com/pull/123/changes) made `api.senaev.com`
  the primary API hostname. Cluster-helper registers the Telegram webhook on that hostname.
  A live Alisa command was verified on the
  [new webhook](../2026-11-13-13-16-remove-secrets-from-paths/project-worklog.md).
  The old hostname still serves traffic through the ingress and remains a cleanup item.
- Internal clients need a rule in the cluster-helper NetworkPolicy. n8n has one already.
- `llm-server` stays private. Only cluster-helper and n8n can reach it.

### Model registry

- The connector lists in-cluster models. Tricky Dad uses OpenRouter through its own provider.
- One list in the code, `cluster-helper/src/llm/llmEndpointModels.ts`. Each entry has a
  public model id and the in-cluster upstream URL. The first and only entry:
  `home/qwen3-4b` → `llm-server`. The list is empty when `llmServer.enabled` is false.
- `GET /models` is made from this list. To add a model, add one entry and push; the
  deploy makes it visible in the API.

### Requests

- The request body goes to the upstream unchanged (llama-server ignores `model`), so
  tools, `response_format` and other OpenAI fields work.
- `stream: true` is proxied as Server-Sent Events. OpenCode needs it.
- No timeout: the upstream call uses `node:http`, because `fetch` stops waiting for the
  response headers after 5 minutes, and llm-server sends them only after the whole answer
  when the client does not stream. The body limit is 100 MB, which is no limit for an
  8k-token model; the API key is checked before the body is read.
- An unknown model gives `404`; an upstream error is passed to the client as it is.
- Each request is logged with the model, the duration and the status; no prompt text in
  the logs.

### Authentication

- One API key for all clients: `Authorization: Bearer <key>`, as every OpenAI-compatible
  client expects.
- The key is a new Vault entry, `LLM_ENDPOINT_API_KEY` in `senaev-com-kv`, and goes to
  cluster-helper through External Secrets as an environment variable.
- cluster-helper compares the key in constant time and returns `401` without it, also
  for internal requests: the same port is public. `GET /models` needs the key too.
- To change the key: put a new value in Vault, then update every client.

### Clients

- **OpenCode**: a custom provider with `@ai-sdk/openai-compatible`, the public base URL
  and the key. If OpenCode does not read `/models`, the models are listed in
  `opencode.json` by hand or by a script.
- **n8n**: an OpenAI credential with the internal base URL and the key. Its direct access
  to llm-server stays too.
- **cluster-helper** calls providers in-process. Tricky Dad uses OpenRouter.

## Result

[PR #125](https://github.com/senaev/infra.senaev.com/pull/125/changes) merged the
OpenAI-compatible route and model registry. On 2026-11-21 an unauthenticated request to
`GET /llm/models` returned the expected `401 invalid_api_key`. The deployed Helm settings
leave the registry empty while the home server is off.

The user confirmed setting up and connecting Code Tools MCP, connecting Claude Code and
Codex, and setting up the cluster OAuth server. The repository records the
[Code Tools MCP split](https://github.com/senaev/infra.senaev.com/pull/216/changes), the
[OAuth server](../../cluster-helper/src/oauth/authorizationServer.ts), and the
[Claude Code](../2026-11-15-18-42-claude-code-remote-control/README.md) and
[Codex](../2026-11-19-21-17-codex-remote-control/README.md) integrations. These provide
agent and tool access. The model API uses its own bearer key.

The original model-serving goal is paused. To finish it, enable and register an in-cluster
model, verify authenticated model listing and a completion, then confirm that the intended
clients can use it. The original client plan named OpenCode and n8n.
