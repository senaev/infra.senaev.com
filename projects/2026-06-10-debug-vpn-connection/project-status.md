- [ ] Restore reliable VPN access from the affected Russian ISPs.

## Current stage

PR #149 deployed successfully at fd84179 in run42642463181. First Chrome/native
TLS pair is complete: both work from Hetzner, both stall from home after TLS.
Added jitter is visible in logs. PR #150 prepares native HTTP/2 versus HTTP/1.1.
Repair remains open; the new HTTP-version comparison is not deployed.

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

## Latest TLS-client comparison

Fresh Chrome/native TLS use HTTP/2 from both sources, alternating order. Endpoint,
credentials, certificate verification and request limits remain fixed. Short2–7s
jitter now precedes direct/TCP diagnostic traces and precheck/download gaps.
Existing60–90s/300–360s jitter remains. Native TLS does not disable certificate checks.

First round (Chrome first):
- Hetzner Chrome: HTTP200,216 bytes,1027ms; native: HTTP200,216 bytes,714ms.
- Home Chrome: HTTP0,headers/body0,8011ms after TLS701ms.
- Home native: HTTP0,headers/body0,8015ms after TLS852ms.
- Home direct/TCP controls passed in506/758ms, with logged jitter3.469/2.778s.

All intended workloads available, three targets scraped, new pods at zero restarts,
all five website smoke checks passed, no client startup/exit failures found.
[Raw first-round evidence](sources/2026-11-09-tls-comparison.txt).

## Next investigation — PR #150 prepared

Replace the completed Chrome/native diagnostic pair with fresh native-TLS clients
over HTTP/2 and HTTP/1.1 on home and Hetzner, alternating order. Only ALPN differs;
endpoint, TLS implementation, certificate verification, packet-up, budgets, rate,
size, jitter and original candidate acceptance stay fixed. Existing native H2
metric remains; H1 has a separate fixed check in existing panels20/21. Traffic
volume and number of temporary processes do not increase.

Local pinned-binary integration validates both versions, expected exit, rejection
of untrusted certificates and process cleanup. No live H1 result exists yet.
Observe reversed-order rounds after deployment; a version-dependent result still
does not establish DPI, MTU or a proxy bug. No production subscription, server,
network policy, secret or host networking change. Keep Hetzner as a positive control.
