- [ ] Restore reliable VPN access from the affected Russian ISPs.

## Current stage

PR #151 deployed at23dc7d9 in successful run42669746004. The first complete H1
payload ladder failed from home at4/16/64KiB; Hetzner passed all sizes. Every
paired direct control passed. H1 currently works only for tiny trace responses;
no Happ/subscription promotion is justified. This is one completed payload cycle.

## Deployed configuration

VPN services remain isolated in namespace vpn. FirstVDS is entry-only; Hetzner
and senaev-media remain exits. Home matrix profiles1/4 run; profiles3/5 are
intentionally zero. Hetzner provides a separate same-host public-endpoint control.
Pinned Xray26.9.30, verified TLS, explicit loopback SOCKS, exit validation,
8s total/3s connect budget,32KiB/s cap and bounded jitter remain in effect.
No host routes, firewall, Tailscale, credentials or production subscriptions changed.

## First payload evidence

Both fresh H1 exit checks passed. Home H1 version trace passed2068ms and size-phase
exit passed1429ms. Home4/16KiB then stalled8012ms after TLS617/593ms, with curl
reporting101/102 request bytes and no response headers/body. Home64KiB failed
during setup3010ms, TLS0/request0. Hetzner payloads passed493/977/2360ms with
exact4096/16384/65536 bytes. This is not a clean size threshold or proof of DPI.
The reused process was idle60–90s before each payload; destination and connection
state remain possible explanations.

All intended workloads available, all3 targets scraped, checker/backend pods at
zero restarts. All5 website smoke checks passed twice after deployment. No fresh
client startup/exit failures found in the initial check.
[Captured selected-field logs and metric responses](sources/2026-11-09-h1-payload-results.txt).

## Next step prepared

Keep the existing ladder unchanged. After it, wait60–90s, start a separate native
H1 process, validate the expected exit, then run one paired direct/H1 4KiB download
without the long post-exit idle (direct request and2–7s jitter still intervene).
Run from home and Hetzner; preserve failed baseline acceptance and all isolation.
See [design and interpretation](H1-PAYLOAD-VALIDATION.md#next-control--fresh-client-without-long-post-exit-idle).
Prepared locally; not deployed. Compare repeated rounds before attributing a cause.
