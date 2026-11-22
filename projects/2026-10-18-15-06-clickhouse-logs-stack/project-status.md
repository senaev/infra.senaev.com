- [ ] Verify a fresh log from `proxmox` when a workload emits one.
- [ ] Run the controlled ClickHouse outage check.

## Stage

The cluster-wide DaemonSet is deployed with seven ready agents. Datadog samples from
Hetzner, `senaev-madrid`, and `senaev-media` matched ClickHouse after recovery.
The [project result](README.md#result) records the earlier media-node gap.

## Next steps

Use the [verification queries](README.md#verification) to confirm a new `proxmox` log
and verify queue recovery during a controlled ClickHouse outage.
