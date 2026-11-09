# Size and destination comparison

The first deployed recovery cycle (PR #139) showed profile 4 downloading only
5518 bytes before its eight-second limit, while small VPN checks at 5/30/60 seconds
all passed. Profile 1 completed 65536 bytes. Ordinary HTTPS/direct controls passed.
That weakens a disruption lasting at least five seconds after a transfer; it does
not exclude a shorter or per-connection failure.

## Next experiment

Only profiles 1 (FirstVDS → Hetzner reference) and 4 (direct Hetzner entry) run.
Each complete matrix covers 4, 16 and 64 KiB against two fixed HTTPS endpoints:

- Cloudflare: `https://speed.cloudflare.com/__down?bytes={size}`
- HTTPBingo: `https://httpbingo.org/bytes/{size}`

Each condition issues a direct download, a small VPN HTTPS 204 precheck, then the
same download via VPN. A failed precheck logs a skipped VPN transfer. Failed direct
downloads do not stop the remaining comparisons, but the paired VPN result is
explicitly marked comparison_inconclusive in logs. Successful transfers require
HTTP 200 and exactly the requested byte count.

There are five quiet minutes at startup and between complete matrices, and one
quiet minute between the six conditions. Conditions rotate by one position each
round to expose order effects. Requests stay serial, with three-second connect and
eight-second total limits, no retry/redirect, 32 KiB/s limit, and a hard per-response
payload cap equal to requested size. Existing client-exit and shutdown guards apply.
No routine or old recovery sequence runs concurrently.

The bulk upper bound is approximately 95 MiB/day across two profiles: 672 KiB per
complete matrix, at most 144 matrices/day given mandatory quiet intervals.
Small prechecks and protocol overhead are additional. Each condition repeats roughly
every 10–13 minutes; this is deliberately slower than the light routine suite.

Metrics use six fixed size/destination check names plus the existing route label.
No URLs, cycle IDs or arbitrary size labels are exported. Logs include cycle ID,
condition index, target name, requested bytes, and direct-control validity.
Grafana compares condition success, duration and received bytes. Samples older than
15 minutes are hidden; skipped conditions have no fabricated download sample.
Check logs for skipped cycles or client-exit invalidation before interpreting charts.

## Interpretation and limits

Failure on both destinations at larger sizes suggests size/path dependence.
Failure on only one destination suggests a target/path-specific effect. Profile 1
versus 4 helps distinguish the public entry route. These comparisons do not prove
DPI or MTU problems: targets differ in network/TLS/server behavior, profiles have
different ingress, pairs are not simultaneous, and other clients may interfere.
Successful transfer means exact size/status, not verified payload contents.

HTTPBingo's three payload sizes were checked from Code Tools (all HTTP 200 and exact
sizes), not from the Russian home source. In-cluster direct controls must validate
its reachability after deployment.

## Deployment and rollback

`vpnProbe.controlledExperiment: true` enables this matrix and keeps only profiles
1 and 4. It replaces the previous recoveryExperiment flag and mode; false restores
all five remaining routine checkers. No server, host-network, secret or permission changes.

Use normal CI: build/publish the changed checker image, apply charts, refresh
workloads. A chart-only rollout with an older image cannot execute this experiment.
Pending merge/deployment.
