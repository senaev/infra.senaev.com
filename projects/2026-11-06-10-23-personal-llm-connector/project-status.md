- [ ] One personal LLM connector; a new model appears in the API automatically

Stage: step 1 of 2, rename `webhook-endpoint.senaev.com` to `api.senaev.com`: deployed.

Decided: runs in cluster-helper; prefix `/llm` on `https://api.senaev.com` and
`http://cluster-helper:3000`; one API key for all clients; only in-cluster models
(`home/qwen3-4b`), no OpenRouter; no size or time limits; no LiteLLM. Clients: OpenCode,
n8n, cluster services.

Done: DNS record, PR #123 deployed, Telegram webhook on the new host.

Next: the user checks Telegram, changes the Alisa skill URL and checks Alisa; then remove
the old host, and build the `/llm` endpoint.
