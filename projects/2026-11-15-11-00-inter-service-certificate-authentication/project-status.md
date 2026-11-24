- [x] Replace the shared token between cluster-helper and obsidian-sync with internal mTLS (cert-manager, private CA, caller allowlist).

## Stage

Deployed and verified in production on 2026-11-22. Follow-ups are open.

## Completed

- [PR #203](https://github.com/senaev/infra.senaev.com/pull/203) merged; the Deploy run passed in all jobs, `pki` and `senaev-com` included.
- `cluster-helper-tls` and `obsidian-sync-tls` are `READY=True`; no pod uses the old Secret name.
- obsidian-sync serves the protected API on 8443 with mTLS and only the published-file and `/metrics` routes on 8080; the bearer token is removed from the code, the charts and the Secret wiring.
- `npm run test:smoke` passes (short link and static files go through the mTLS client); a vault read through the Obsidian MCP connector works; Datadog logs show both mTLS listeners and no errors.

## Follow-up (nonblocking)

- Delete the Vault property `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN`.
- Check with `kubectl auth can-i` that no application or LLM workspace ServiceAccount can read the leaf Secrets or create Certificates; the first leaf renewal (about 4 days after the issue) and `internal-ca` in `pki` are not yet observed.
- Add cert-manager alerts; move nextjs-app and vmagent to mTLS and close port 8080 (this also ends the `/metrics` path-label exposure); before the first route on cluster-helper's 8443, add the allowed-callers check, the caller certificate and a NetworkPolicy rule. Details are in the README.
