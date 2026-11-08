- [ ] Restore working VPN access through the firstvds entry point from the affected Russian ISPs.

## Stage

Namespace migration done; VPN repair remains open.

## Done

- Xray servers and `vpn-subscription` run in release/namespace `vpn` (PR #132), with the
  same Vault store. Verified by the user: VPN from Happ, subscription, MCP connectors.
- ESO fixed: one release in `vault`, CRDs kept on uninstall (PR #133).

## Next steps

Review and deploy the firstvds direct-exit subscription fix (UUID seed `6` → `4`),
then refresh the subscription in Happ and test that profile. The fix is prepared in a PR;
it has not been deployed. Then design the debugging environment for the remaining repair.
