- [ ] Restore reliable VPN access from the affected Russian ISPs.

## Stage

Repeatable probes deployed (PRs #135, #137); baseline collected. Repair remains open.

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

## Next steps

Review and deploy the [automated baseline experiment](BASELINE-EXPERIMENT.md):
direct versus proxied download, eight versus thirty seconds, and IPv6 TCP reachability.
The checker extension and dashboard are prepared in PR #138; not deployed yet.
After merge, collect several heavy rounds before tuning server or host networking.
