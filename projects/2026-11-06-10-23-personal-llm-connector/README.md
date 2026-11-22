# 2026-11-06 — Personal LLM connector

- [x] ~~Provide one OpenAI-compatible API and model list for models running in the cluster. **Canceled on 2026-11-21.**~~

## Verification

- After rollout, `GET https://api.senaev.com/llm/models` returns the public catch-all
  response, HTTP 401 with the body `Unauthorized`. Posting an empty JSON object to
  `https://api.senaev.com/llm/chat/completions` returns HTTP 404.
- The deployed cluster-helper NetworkPolicy allows n8n to use the internal port 80
  and restricts port 3000 to Traefik. The n8n job search workflow uses port 80.

## Result

Canceled on 2026-11-21. The owner concluded that the available hardware could not support
the intended model-serving setup. [PR #125](https://github.com/senaev/infra.senaev.com/pull/125/changes)
introduced the `/llm` API. [PR #192](https://github.com/senaev/infra.senaev.com/pull/192/changes)
disabled the home model server, leaving the API without a model backend.

The cleanup removes the model-list and chat-completion routes, model registry, streaming
proxy, API-key wiring, and direct n8n access to the cluster-helper public port. The implementation
and earlier decisions are recorded in the [worklog](project-worklog.md).

The owner also completed Code Tools MCP setup, Claude Code and Codex connections, and
cluster OAuth. See the [Code Tools MCP split](https://github.com/senaev/infra.senaev.com/pull/216/changes),
[OAuth server](../../cluster-helper/src/oauth/authorizationServer.ts),
[Claude Code project](../2026-11-15-18-42-claude-code-remote-control/README.md), and
[Codex project](../2026-11-19-21-17-codex-remote-control/README.md).
