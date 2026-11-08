- [ ] Restore working VPN access through the firstvds entry point from the affected Russian ISPs.

## Stage

Preparing the namespace migration for review; VPN repair remains open.

## Current work

Move existing Xray servers and subscription/web interface into release/namespace `vpn`,
using the same Vault store. Preserve protocol/configuration and website fallbacks.
See [migration runbook](NAMESPACE-MIGRATION.md) for staged cutover and rollback.

## Next steps

Review and stage migration before merging. Verify deployment and public paths, then
design the debugging environment separately. No live migration has been performed.
The existing firstvds subscription UUID mismatch remains for the repair investigation.
