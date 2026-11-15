## 2026-11-15 11:00 UTC — Record shared certificate authentication project

User requested a separate project in PR #201 to establish internal certificate
identity and HTTPS/mTLS, starting by replacing cluster-helper → obsidian-sync shared
token authentication. Recorded issuance, renewal, key rotation, trust distribution,
CA replacement, authorization, monitoring, recovery and migration verification.
The node-executor project will reuse this foundation. Architecture and issuer
ownership remain proposals; this commit changes documentation only.
