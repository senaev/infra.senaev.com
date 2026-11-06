- [ ] One personal LLM connector; a new model appears in the API automatically

Stage: step 1 of 2, rename `webhook-endpoint.senaev.com` to `api.senaev.com` (own PR).

Decided: runs in cluster-helper; prefix `/llm` on `https://api.senaev.com` and
`http://cluster-helper:3000`; one API key for all clients; only in-cluster models
(`home/qwen3-4b`), no OpenRouter; no size or time limits; no LiteLLM. Clients: OpenCode,
n8n, cluster services.

Done: DNS record for `api.senaev.com`.

Next: merge the rename PR, check Telegram and Alisa, change the Alisa skill URL, then
build the `/llm` endpoint.
