# Controlled post-download recovery experiment

Hypothesis: a VPN-shaped transfer on direct home-to-Hetzner entry triggers a
temporary loss of subsequent connectivity. The observed partial download followed
by a connection timeout is suggestive, not proof of filtering.

## Scope and rollback

The temporary `vpnProbe.recoveryExperiment: true` setting keeps only checker
profiles 1 (FirstVDS → Hetzner control) and 4 (direct Hetzner entry) at one replica.
Other checker profiles (0, 2, 3, 5) have zero replicas, including the IPv6 profile
whose source lacks public IPv6 reachability. VPN servers and subscriptions are unchanged.
Set the flag to false and deploy to restore all six routine checker profiles.

No host route/firewall changes, server tuning, new image, service, permissions or secrets.
Both clients keep the existing loopback-only SOCKS setup.

## Sequence

Each pod waits five quiet minutes at startup and after completing each cycle.
No routine light/heavy checks run in this mode.

1. Direct gstatic HTTPS 204, ordinary HTTPS to Hetzner's `/robots.txt` (200,
   currently 84 bytes), then VPN gstatic HTTPS 204. All must succeed before a trigger.
   Failure is logged as an inconclusive skipped experiment, without a download.
2. One 64 KiB download over VPN, with the existing eight-second limit.
3. At absolute offsets 5, 30 and 60 seconds after that download finishes:
   VPN gstatic first, ordinary HTTPS to Hetzner second, direct gstatic third.
   Failed download or observations do not stop the remaining observations.
   Shutdown interrupts waits and prevents new requests.

Offsets refer to request start, not completion. Logs record requested and actual
offsets for each request; slow earlier controls can delay a later target time.
The same random experiment ID correlates each cycle in logs, never in metric labels.
Each HTTP request keeps three-second connect/eight-second total limits, no redirect,
no retry and 32 KiB/s rate limit. Bulk payload is at most 36 MiB/day for two
profiles, plus small controls and protocol overhead. Cycles run serially.

## Interpretation

- Working precheck, failed download/immediate postcheck, recovered later postcheck,
  stable ordinary HTTPS/direct controls: evidence consistent with a temporary
  VPN-specific disruption.
- Ordinary HTTPS also fails: consider public entry reachability, rather than assuming
  protocol-specific filtering.
- Both profiles or direct controls fail: the signal is broader than direct Hetzner
  VPN entry.
- Failed prechecks do not establish that this cycle's download caused a failure.

Profile 1 uses a different entry path and is a reference, not a synchronized
randomized control. Separate pods are not clock-coordinated. Pausing checker profiles
removes their interference but cannot exclude Happ clients, other users, background
traffic, destination differences or retained state from earlier connections.
The precheck can itself affect connection state, and the first postcheck is at 5s,
so shorter disruptions may go unobserved. No result alone proves DPI.

The existing Grafana dashboard adds phase status, duration and byte panels.
Routine panels have no fresh observations during this temporary mode.
Merge/deployment and several new cycles are required before conclusions.
