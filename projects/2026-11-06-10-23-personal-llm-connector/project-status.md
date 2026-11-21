- [ ] Serve in-cluster models through one OpenAI-compatible API and publish them in its model list.

## Stage

Paused with the API implemented. [PR #125](https://github.com/senaev/infra.senaev.com/pull/125/changes)
merged the `/llm` endpoint. [PR #192](https://github.com/senaev/infra.senaev.com/pull/192/changes)
disabled the home model server, leaving the model registry empty under the deployed settings.

## Completed alongside the model API

The user reports that Code Tools MCP, Claude Code, Codex and cluster OAuth are connected.
The repository records these integrations. The `/llm` model API uses a separate bearer key.

## Remaining

- Enable and register an in-cluster model. Verify authenticated `GET /llm/models` and
  `POST /llm/chat/completions`, then verify the intended clients. The original plan named
  OpenCode and n8n.
- The Alisa webhook migration was verified separately. Retiring
  `webhook-endpoint.senaev.com` from ingress and DNS remains hostname cleanup.
