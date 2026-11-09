> Deployed in PR #139. The [size/destination matrix](TRANSFER-MATRIX.md) is the proposed next step and replaces this mode. The current toggle is controlledExperiment; the recoveryExperiment name below is historical.

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

Deploy through the normal CI workflow: it rebuilds and publishes the modified
vpn-probe image before applying charts and refreshing workloads. A chart-only
deployment against the previous image would pause four profiles but leave the
remaining clients running the old routine checks; do not deploy only the chart.

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
   Shutdown interrupts waits and prevents new requests. The Xray child is checked
during idle/post-download waits (at most one second apart) and before/after requests.
If it exits, a recovery_client_alive failure logs cycle_invalid=true with the cycle
ID, and the checker exits so Kubernetes restarts it. Discard that cycle's earlier
phase samples; they are not evidence of network-induced recovery. Idle client exits
are logged without a cycle ID. Graceful continuous shutdown returns exit code zero;
an interrupted one-shot run remains unsuccessful.

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
