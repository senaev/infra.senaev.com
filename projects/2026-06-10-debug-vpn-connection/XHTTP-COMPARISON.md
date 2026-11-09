# XHTTP/TLS candidate versus TCP/Reality baseline

The size matrix found profile 4 passes 4 KiB but stalls on 16/64 KiB against two
targets; profile 1 and all direct controls pass. Compare an alternate complete setup
without changing production subscriptions or existing Xray server configurations.

## Candidate path

The same senaev.com address, port 443, Chrome fingerprint and Hetzner exit are used:

Client XHTTP/TLS → existing Traefik TCP passthrough → existing Reality unauthenticated
website fallback → Traefik websecure-xray TLS termination → dedicated HTTP path →
h2c XHTTP backend → public HTTPS destination.

The path /_vpn-xhttp-test/ is routing, not authentication. VLESS uses a dedicated UUID
derived from the existing Vault base with seed xhttp-probe, never published in the
subscription. TLS verification stays enabled, ALPN is h2, XHTTP mode is packet-up,
and Vision flow is omitted on this candidate.

This changes transport, TLS termination, multiplexing and backend path together.
Success supports trying the complete setup; it does not prove transport alone is
responsible or that DPI caused the baseline failure. The unsuccessful June XHTTP
attempt on FirstVDS involved different conditions.

## Isolation

Separate non-root backend on Hetzner, using the existing pinned checker image.
NetworkPolicy allows inbound 8081 only from Hetzner Traefik pods, and outbound DNS
and public TCP 443. The policy explicitly excludes RFC1918, tailnet, loopback, IPv4 link-local,
IPv6 ULA/link-local and unspecified ranges. It does not enumerate every special-use
range (for example, 198.18.0.0/15). Pinned Xray's default private-target blocking is
an additional restriction; this is not a guarantee that every non-public address
is excluded by NetworkPolicy. Only checker
profile 4 gets an extra loopback client on 1082. Profile 1 stays the working reference.
No new public port, DNS record, production profile, host-network setting, secret
store or privilege. Disabled ingress/routine mode omit the candidate.

## Measurement

Each size/destination condition has a direct control and serial TCP/Reality and
XHTTP/TLS transfers. Variant order alternates; condition order rotates. Quiet
intervals remain 60–90s between variants/conditions and 300–360s between rounds.
Both started client processes are monitored; a later exit invalidates the cycle.
If candidate startup itself fails, a failed candidate_startup metric/log is emitted
and baseline-only measurements continue. Candidate startup is retried only when the
checker restarts; inspect this failure before interpreting an absent xhttp series.

XHTTP must first validate its public exit against senaev.com. Failure skips candidate
transfers while baseline checks continue. Each variant also needs a small HTTPS
positive control. Failed direct controls make comparisons inconclusive.
No client has a direct fallback.

The matrix retains 4/16/64 KiB, Cloudflare/HTTPBingo, three-second connect/eight-second
total limits, hard payload caps and 32 KiB/s. XHTTP caps outer connections at one and
disables idle keepalives. Conservative bulk upper bound is below 120 MiB/day across
two profiles, plus small controls and protocol/header overhead.

Profile 4's full round can take roughly 17–28 minutes including quiet time. Direct
controls precede the pair, not both variants simultaneously. Other clients, target
behavior, CPU, reuse and unsynchronized profiles remain confounders.
Logs correlate cycle/condition/route; fixed route xhttp is exported to Grafana.
Matrix/candidate-exit freshness is thirty minutes. Rotating a condition from first
to last can produce normal gaps exceeding this window; missing data alone is not
proof of a skipped or invalid cycle. Inspect logs, sample timestamps and client state.

## Verification and rollback

Use normal CI to build/publish the changed checker image before chart deployment.
A chart-only rollout against an old image cannot execute the experiment.

Manual local integration, using official binaries, fake credentials/certificates and
loopback-only listeners:
XRAY_BINARY=/path/to/xray TRAEFIK_BINARY=/path/to/traefik python3 vpn-probe/xhttp.integration.py
It trusts its temporary certificate with verification enabled. The test's private
origin allowance never appears in deployed configuration.

After deployment: run scripts/smoke-test-websites.sh, verify client/backend health,
candidate exit and the first complete paired matrix.
Set vpnXhttpExperiment.enabled=false to remove backend/Service/Ingress/NetworkPolicy
and extra client, restoring the prior matrix exactly. controlledExperiment=false
restores routine four-profile checks and omits the backend.

Pending review/deployment. Russian-ISP reachability remains unverified.
