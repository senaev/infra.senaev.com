## 2026-11-16 UTC — Simplify the first implementation

Review of PR #203 found that cluster-helper and obsidian-sync run on the same node
(hetzner), so this migration fixes little security risk alone: it is a pilot of the
foundation for the node executor. User chose a small first implementation. Removed
trust-manager, revoked-leaf list, approver policy, CA backup, trust-overlap CA rotation,
dual mode and rollback procedures (a bad deploy is a git revert; a lost CA is replaced by a
new CA and a redeploy). Delivery is now two PRs: foundation, then transport and cutover.
Identity uses DNS SAN with `X509Certificate.checkHost()` instead of URI SAN. Listener split
is two Fastify instances. Reload uses `setSecureContext()` and a new Undici `Agent`.
Leaf lifetime: user chose days over hours, so 7 days with renewBefore 3 days (a failed
renewal leaves days to react, not hours).
User kept mTLS over projected ServiceAccount tokens, because it wants channel encryption;
SA tokens may be added on top later. Expired-material behavior: services never request
certificates, cert-manager renews, services pick up the files by polling.

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
