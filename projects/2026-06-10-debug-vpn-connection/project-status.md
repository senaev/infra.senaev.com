- [ ] Restore reliable VPN access from the affected Russian ISPs.

## Current stage

PR #154 merged atd17f690; deployment42787487968 failed because Hetzner's Kubernetes
API is down. Build/publication and provisioning sync passed. Do not claim a
fresh16KiB result or exporter-fix rollout.

## Incident

Remote Tailscale update at06:26 UTC /07:26 Madrid upgraded Hetzner1.102.2→1.104.5.
Interface deletion stopped bound K3s; Tailscale recovered, K3s did not. The recovery
rule exists but did not restart it. AutoUpdate Apply=True. No new OOM/full disk.
senaev.ru times out; same-IP jellyfin.senaev.ru responds302 and senaev.com200.
FirstVDS journal remains unavailable because SSH authentication failed; the exact
failing fallback hop is not proven.
[Evidence, recovery proposal and check design](SENAEV-RU-AVAILABILITY.md).

## VPN evidence retained

Before #152: home H1 traces/exit8/8; reused4KiB7/8 and16/64KiB0/8.
First #152 fresh4KiB passed905ms/home and535ms/Hetzner. Home reused4KiB worked,
16/64KiB failed. This does not identify idle as the cause.
#154 fresh16KiB and metric allowlist changes are merged, deployment blocked.

## Next PR prepared

Direct HEAD availability from home and Hetzner using existing checker pods,
30–45s jittered waits and bounded verified TLS. Grafana status/latency/age panels
hide stale green samples after120s.90 tests, syntax, chart lint/render and
dashboard validation pass. This availability change is not merged or deployed.

## Open actions

Confirm Tailscale/device addresses, approve/start K3s on Hetzner, verify overlay/API/
nodes/websites, retry #154 deployment. No host services changed during diagnosis.
Review future Tailscale update/recovery policy separately; no home network changes.
