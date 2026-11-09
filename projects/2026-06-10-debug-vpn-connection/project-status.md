- [ ] Restore reliable VPN access from the affected Russian ISPs.

## Current stage

PR #147 is deployed in combined run42626865899 (main271f5de). Hetzner XHTTP source
control passed; home XHTTP still stalls. PR #149 prepares the next Chrome/native
TLS comparison and short request jitter; this comparison is not deployed.

## Deployed configuration

VPN services are isolated in namespace vpn. FirstVDS is entry-only; Hetzner and
senaev-media remain exits. Controlled matrix profiles1/4 run on senaev-media;
profiles3/5 are intentionally scaled to zero. Hetzner has a separate low-volume
public-endpoint control. No host routing/firewall/Tailscale changes are involved.

Current experiment uses pinned Xray26.9.30, verified TLS, explicit loopback SOCKS,
bounded requests and expected-exit validation. Existing jitter: condition/client
pauses60–90s, rounds300–360s, routine light30–45s and heavy300–360s.

## Evidence

Direct/TCP controls pass small requests. FirstVDS→Hetzner transfers pass; direct
Hetzner entry stalls on larger responses. These do not establish DPI or MTU failure.
Home fresh/reused XHTTP comparisons failed in both request orders: fresh completes
destination TLS but receives no HTTP response; reused times out during setup.

First Hetzner source pair: direct HTTP200/214 bytes/282ms at13:45:25 UTC;
fresh XHTTP HTTP200/214 bytes/930ms with validated exit at13:46:35. Home initial
XHTTP still failed at13:47:28: TLS750ms, request93 bytes, HTTP0, headers/body0,
total8011ms. Home direct/TCP traces passed in499/704ms.

At deployment verification all intended workloads were available, three probe
targets scraped and new pods at zero restarts. Initial/latest website smoke checks
passed; one intermediate senaev.ru SSL timeout cleared on immediate rerun.
[Captured evidence](sources/2026-11-09-hetzner-source-control.txt) and
[worklog](project-worklog.md) retain the detailed history.

## Next iteration — PR #149

Compare fresh Chrome/native TLS over HTTP/2 from both sources, alternating order.
Same endpoint, credentials, verification and request limits. Add2–7s jitter before
direct/TCP diagnostic traces and between prechecks/downloads; retain longer jitter.
Native TLS does not disable certificate checks. Home diagnostic response cap stays
16KiB/failed matrix; Hetzner becomes12KiB/cycle. Existing Grafana panels cover both.

Source/path dependence outranks universal endpoint failure, but self-connect, DNS,
latency, time and node-policy effects remain confounders. No native-TLS live result
exists yet. Review CI before merge, then check rollout/smoke/metrics and several
alternating rounds. Keep production subscriptions and host networking unchanged.
