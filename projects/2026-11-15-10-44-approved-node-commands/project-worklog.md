## 2026-11-15 11:09 UTC — Confirm execution scope and lifecycle

User chose root execution, all Kubernetes nodes without exceptions, a maximum
10-minute approval TTL using the existing request expiry, and immediate failure
for offline nodes. Existing cluster logs supply history; no extra history archive.
Keep only operational state needed for approvals, result delivery and preventing
duplicate execution across restarts. Approval expiry and execution timeout remain
separate. Removed superseded open design choices from the main document.

## 2026-11-15 11:00 UTC — Link certificate foundation and open decisions

Separate certificate project now owns the reusable mTLS lifecycle, with the first
migration from cluster-helper to obsidian-sync. Node execution will reuse it.
Recorded remaining user-facing choices about host privilege, node scope, approval
lifetime/offline behavior and audit retention, with recommendations kept unapproved.

## 2026-11-15 10:44 UTC — Record command approval design

User chose a lightweight executor per node with Telegram approval in cluster-helper:
one request, one command, one result. Script inspection and interactive sessions are
outside scope. Explicitly decided to keep host networking disabled.

Added context, actionDescription and expectedOutcome to the request requirements.
Context is one short sentence with a maximum of 128 characters as tool-description
and skill guidance only, without runtime enforcement. The other explanations are concise.
Certificate lifecycle is still a proposal requiring a concrete implementation decision.
