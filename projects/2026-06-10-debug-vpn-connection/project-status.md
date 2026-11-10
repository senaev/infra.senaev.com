- [ ] Restore reliable VPN access from the affected Russian ISPs.

## Current stage

PR #152 deployed at2874173 in successful run42706106663. The full PR workflow
also passed on retry, including image build; no workflow change was needed.
Fresh immediate4KiB control passed in the first cycle: home905ms, Hetzner535ms,
both exact4096 bytes after successful expected-exit checks. Reused4KiB also
passed; home16/64KiB failed3011/8012ms. Direct controls and the Hetzner ladder
passed. No Happ or production-subscription promotion is justified.

Before rollout, home H1 traces and size exit checks passed8/8. Reused4KiB passed
7/8, but16/64KiB each failed8/8. All paired direct controls passed. Hetzner H1
traces/exits passed16/16;4KiB16/16 and16/64KiB15/16. Initial all-size home
failure was not representative of later4KiB rounds. These counters strengthen
the need to distinguish size and process history without proving a cause.
[Pre-rollout counters and deployment evidence](sources/2026-11-09-h1-fresh-control.txt).

## Deployed configuration

VPN services remain isolated in namespace vpn. FirstVDS is entry-only; Hetzner
and senaev-media remain exits. Home matrix profiles1/4 run; profiles3/5 are
intentionally zero. Hetzner provides a separate same-host public-endpoint control.
Pinned Xray26.9.30, verified TLS, explicit loopback SOCKS, exit validation,
8s total/3s connect budget,32KiB/s cap and bounded jitter remain in effect.
No host routes, firewall, Tailscale, credentials or production subscriptions changed.

## Historical first payload evidence (#151)

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

## Deployed fresh control (#152)

Keep the existing ladder unchanged. After it, wait60–90s, start a separate native
H1 process, validate the expected exit, then run one paired direct/H1 4KiB download
without the long post-exit idle (direct request and2–7s jitter still intervene).
Run from home and Hetzner; preserve failed baseline acceptance and all isolation.
See [design and interpretation](H1-PAYLOAD-VALIDATION.md#fresh-client-without-long-post-exit-idle-152-deployed).
Deployed. Compare repeated rounds before attributing a cause.


## Observability issue and next prepared step

The deployed #152 fresh checks are logged, but its metrics exporter allowlist
omitted their names. Therefore their absence in Grafana is not a failed check;
the first fresh result above is established by logs. The next PR adds the fixed
fresh check names to the exporter with regression coverage.

Retain fresh4KiB, then wait60–90s before a separate fresh16KiB process. Each
process must pass its own exit check before one paired direct/H1 payload, with
2–7s jitter and unchanged bounds. A failed earlier measurement does not suppress
the independent16KiB control. This distinguishes a larger payload on a fresh
process from reused-client history; it still sends a trace first and runs
sequentially after earlier traffic. Adds36KiB planned responses per eligible
cycle, with read-ahead/overhead caveats. Prepared, not deployed.
