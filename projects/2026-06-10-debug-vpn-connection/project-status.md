- [ ] Restore reliable VPN access from the affected Russian ISPs.

## Current stage

PR #150 deployed at 7a97606 in run42661613767. In the first version pair, native
HTTP/1.1 worked from home while HTTP/2 stalled. Both passed on Hetzner. Repair
remains open: only a small trace response has been validated from home.
The next PR prepares bounded H1 payload-size checks; they are not deployed.

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
jitter now precedes home direct/TCP diagnostic traces and precheck/download gaps.
The Hetzner direct control follows its randomized 300–360s round wait.
Existing60–90s/300–360s jitter remains. Native TLS does not disable certificate checks.

First round (Chrome first):
- Hetzner Chrome: HTTP200,216 bytes,1027ms; native: HTTP200,216 bytes,714ms.
- Home Chrome: HTTP0,headers/body0,8011ms after TLS701ms.
- Home native: HTTP0,headers/body0,8015ms after TLS852ms.
- Home direct/TCP controls passed in506/758ms, with logged jitter3.469/2.778s.

All intended workloads available, three targets scraped, new pods at zero restarts,
all five website smoke checks passed, no client startup/exit failures found.
[Raw first-round evidence](sources/2026-11-09-tls-comparison.txt).

## Latest HTTP-version result

First pair (H2 first): home native H2 timed out at8011ms after TLS1340ms;
home native H1 returned HTTP200/214 bytes in2064ms with expected exit validation.
Hetzner H2/H1 both passed in682/981ms. Home direct/TCP controls passed508/795ms.
All intended workloads available, three targets scraped, new pods at zero restarts
and all five website smoke checks passed. [Captured evidence](sources/2026-11-09-http-version-comparison.txt).

This supports a version-dependent workaround for small requests, without proving
DPI or a specific proxy defect. The previous Chrome/native H2 experiment ended
with13/13 successes per client on Hetzner and0/5 per client on home. Observe the
reversed-order version rounds; no user-facing subscription change is justified yet.

## Next step prepared — H1 payload validation

Keep the version pair. After it finishes, and only if its H1 trace passed, start a
separate native H1 client and revalidate its exit. Then compare paired direct/H1
Cloudflare transfers at4/16/64KiB on that same validated process, with existing
budgets/rate limits and bounded jitter. No candidate promotion or traffic overlap.
See [scope and rollback](H1-PAYLOAD-VALIDATION.md). Prepare/review the PR, then
verify deployment and repeat size checks before changing Happ profiles.
