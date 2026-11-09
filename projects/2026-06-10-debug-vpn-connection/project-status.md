- [ ] Restore reliable VPN access from the affected Russian ISPs.

## Stage

Recovery experiment deployed (PR #139); size/destination matrix prepared. Repair remains open.

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

## Recovery cycle result

Deployment run 42581455020 succeeded. Only profiles 1 and 4 run, with zero restarts.
Profile 1 transferred all 64 KiB; profile 4 stalled at 5518 bytes. Both profiles'
small VPN, direct and ordinary-HTTPS checks passed at 5/30/60 seconds after download.
This cycle found no disruption lasting at least five seconds after the download;
shorter and per-connection effects remain possible. Website smoke checks pass.

## Next steps

Review/deploy the [size and destination matrix](TRANSFER-MATRIX.md): compare
4/16/64 KiB direct and VPN downloads from Cloudflare and HTTPBingo on profiles 1/4.
It replaces the recovery sequence and preserves quiet intervals and client guards.
Set controlledExperiment=false to restore five remaining routine checker profiles.
Not deployed yet.


## FirstVDS direct-exit removal

Prepared a separate PR removing the FirstVDS → freedom subscription and seed-4
server client/routing rule. Stable probeIndex values preserve checker IDs 1–5,
including active experiment profiles 1 and 4. The unused exit mapping is removed,
which will restart the checker pods on deployment. Collect the current matrix first.
FirstVDS remains the entry for profile 1 and the exit for profile 2; removing this
direct-entry/direct-exit route does not conceal the FirstVDS address generally.
Pending review and deployment; existing cached seed-4 links stop working only after
the Xray configuration is reloaded.
