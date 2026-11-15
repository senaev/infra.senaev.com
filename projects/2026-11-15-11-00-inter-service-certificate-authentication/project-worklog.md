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
