## 2026-11-15 11:44 UTC — Merge design and prepare technical plan

PR #201 merged as 75b664ec13b415196a746fd7f0900d88d32e8753 after successful PR
checks. Inspected Fastify servers, fetch/tool clients, Helm and deploy ordering.
Found Next.js public routes and vmagent metrics sharing the token API listener;
planned separate protected mTLS and public-only HTTP listeners. Documented identity,
renewal/reload, trust rotation, compromise/recovery and staged implementation PRs.
This PR changes documentation only. Live prerequisites remain unverified.

## 2026-11-15 11:06 UTC — Choose Kubernetes CA and application-level mTLS

User chose a private CA managed inside Kubernetes and application-level mTLS.
Both services use Node.js: reuse established TLS/HTTPS mechanisms and compatible
packages through shared senaev-utils integration rather than custom cryptography.
Exact HTTP adapters and reload mechanics remain implementation work. Host-command
permissions, node coverage and approval retention are separate project decisions.

## 2026-11-15 11:00 UTC — Record shared certificate authentication project

User requested a separate project in PR #201 to establish internal certificate
identity and HTTPS/mTLS, starting by replacing cluster-helper → obsidian-sync shared
token authentication. Recorded issuance, renewal, key rotation, trust distribution,
CA replacement, authorization, monitoring, recovery and migration verification.
The node-executor project will reuse this foundation. Architecture and issuer
ownership remain proposals; this commit changes documentation only.
