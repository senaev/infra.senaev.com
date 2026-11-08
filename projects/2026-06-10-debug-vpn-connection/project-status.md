- [ ] Restore working VPN access through the firstvds entry point from the affected Russian ISPs.

## Stage

Repeatable diagnostics prepared for review; broader VPN repair remains open.

## Done

- VPN services migrated into release/namespace `vpn` (PR #132).
- ESO namespace/CRD retention fixed (PR #133).
- Direct-exit subscription UUID seed corrected (PR #134), deployed successfully;
  user confirmed the refreshed Happ profile works on their current connection.

## Current work

Six isolated VPN probe clients on `senaev-media`, using the existing subscription
profiles. Small checks approximately every 30s; exit validation and a 64 KiB transfer
approximately every 300s. Structured logs, direct controls, bounded resources, no host
network changes. See [probe documentation](../../vpn-probe/README.md).

## Next steps

Review/merge the probe PR, verify both intervals from the Russian home ISP and run
on-demand fresh-client/invalid-credential checks. Record the baseline before designing
restricted debugging-branch deployments. No probe workloads have been deployed yet.
