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
