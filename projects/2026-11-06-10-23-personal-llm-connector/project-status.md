- [ ] One personal LLM connector; a new model appears in the API automatically

Stage: step 2 of 2, the `/llm` endpoint: code written on branch `llm-endpoint`, PR not
opened yet.

Decided: runs in cluster-helper; prefix `/llm` on `https://api.senaev.com` and
`http://cluster-helper:3000`; one API key for all clients; only in-cluster models
(`home/qwen3-4b`), no OpenRouter; no timeout, 100 MB body limit; no LiteLLM. Clients:
OpenCode, n8n, cluster services.

Done: `api.senaev.com` rename (PR #123), OpenCode OAuth client for the MCP endpoints
(PR #124).

Open: Telegram and Alisa checks after the rename; the Alisa skill URL; then remove the old
host.

Next: the user adds `LLM_ENDPOINT_API_KEY` to Vault; open and merge the PR; test with
curl; add the OpenCode provider and an n8n credential.
