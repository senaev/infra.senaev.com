- [ ] Restore reliable VPN access from the affected Russian ISPs.

## Stage

XHTTP/TLS comparison deployed (PR #144); focused response diagnostics prepared. Repair remains open.

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

## Matrix result and current work

PR #141 deployed successfully in run 42584028890. First full matrix:
profile 4 passes 4 KiB but fails 16/64 KiB against both Cloudflare and HTTPBingo;
profile 1 and every direct control pass. This points toward size/path dependence,
without proving DPI, MTU or a transport defect.

PR #142 deployed in run 42585994166: FirstVDS → freedom removed, FirstVDS config
reload confirmed and all five website smoke checks pass. Stable checker IDs retained.

User now wants FirstVDS removed as an exit entirely, while keeping Hetzner and
senaev-media exits. Deployed changes remove profile 2 and FirstVDS's internal SOCKS
exit listener, freedom outbound and references from other nodes. FirstVDS remains
the entry for profile 1. Checker IDs 1/3/4/5 stay stable; active experiment remains 1/4.

Deployed bounded jitter: matrix pauses 60–90s / 300–360s; routine light checks
30–45s, routine heavy checks 300–360s, routine startup 0–20s. Existing request time,
size and rate limits are unchanged. No fail-closed policy or Happ auth change is
included pending the user's understanding/decision. XHTTP is the next separate
transport comparison; current pinned TCP/Reality profile remains unchanged.

## Next step

PR #143 deployed in run 42588940242. All VPN pods were available with zero restarts,
all three config reloads were observed, and all five website smoke checks passed.

PR #144 deployed in run 42610055670. The backend and both probes are healthy with
zero restarts, and all five website smoke checks pass. Candidate startup succeeded.
Its first exit check reached the backend and completed destination TLS at 2875ms,
but returned curl 28 / HTTP 0 / zero body bytes at 8013ms. Candidate payloads were
correctly skipped while baseline 4 KiB checks passed. No cause established yet.

Prepare the [focused response diagnostics](XHTTP-RESPONSE-DIAGNOSTICS.md):
experimental-only Info logs, numeric request/response timing, direct/baseline trace
controls and three bounded candidate requests after failed exit validation.
The original failure remains a failure even if a diagnostic succeeds.
Pending review/deployment. Toggle diagnostics=false to restore prior behavior;
vpnXhttpExperiment.enabled=false still removes the entire candidate.
