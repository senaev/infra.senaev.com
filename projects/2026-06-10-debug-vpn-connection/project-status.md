- [ ] Restore reliable VPN access from the affected Russian ISPs.

## Stage

Extended probes deployed (PR #138); controlled recovery experiment prepared. Repair remains open.

## Verified baseline

All six probes are scraped on senaev-media. Deployment run 42531233399 succeeded.
At 2026-11-08 23:08 UTC, the current pods recorded:

| Profile | 64 KiB successes / attempts | Other observations |
|---|---|---|
| 0 — firstvds → freedom | 4/5 | Occasional connection timeout |
| 1 — firstvds → hetzner | 5/5 | HTTPS and exit validation pass |
| 2 — hetzner → firstvds | 0/4 | HTTPS mostly passes; exit validation 4/4 |
| 3 — hetzner → senaev-media | 0/4 | HTTPS mostly passes; exit validation 4/4 |
| 4 — hetzner → freedom | 0/4 | HTTPS mostly passes; exit validation 4/4 |
| 5 — hetzner IPv6 → freedom | 0/4 | HTTPS and VPN exit checks fail |

All direct HTTPS and direct exit controls pass. Profiles 2–4 return HTTP 200 but
receive only a small partial payload before the eight-second limit. Profile 1
finishes 65536 bytes in about 2.9 seconds. These observations implicate the direct
home-to-Hetzner entry path, but do not establish DPI, MTU, or a server bug.

## Latest verification

PR #138 deployment run 42537716826 succeeded. All six probes ran on senaev-media
with zero restarts; metrics and new dashboard panels were verified. Direct bulk
controls pass, profiles 0–1 pass both budgets, and profiles 2–4 fail both.
The 30-second attempts failed at the three-second connection limit, not after
thirty seconds of transfer. Both independent IPv6 controls returned errno 101
(network unreachable). Existing VPN deployments and website smoke checks remain healthy.

## Next steps

Review and deploy the [controlled recovery experiment](RECOVERY-EXPERIMENT.md).
It temporarily pauses all checker profiles except 1 and 4, replaces their routine
checks with an isolated trigger/recovery sequence, and restores the routine suite
when recoveryExperiment is set to false. Not deployed yet.
