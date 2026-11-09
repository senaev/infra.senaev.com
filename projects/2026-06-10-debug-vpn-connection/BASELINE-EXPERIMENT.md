# Automated baseline experiment

The existing VPN checker runs these serially in every heavy round, approximately
five minutes after the preceding heavy round finishes:

- Existing direct/VPN exit-IP checks.
- Direct and VPN 64 KiB downloads with the original eight-second limit.
- Separate direct and VPN 64 KiB downloads with a thirty-second limit.
- On the IPv6 profile only: three-second TCP connects to the configured IPv6 entry
  and Cloudflare's independent IPv6 endpoint on port 443.

Short-budget failures remain failures even when long-budget downloads pass.
Light HTTPS checks are refreshed between transfers if thirty seconds have elapsed;
a running download can delay the next light check. No overlapping heavy rounds.
Each download remains capped at 64 KiB and 32 KiB/s, without redirects or retries.
Four downloads per profile per round cap payload at approximately 432 MiB/day for
six profiles (plus small checks and protocol overhead), up from 108 MiB/day.

Existing bounded metrics and JSON logs expose separate checks:
`download_64k`, `download_64k_30s`, `ipv6_entry`, `ipv6_control`.
Direct/VPN use the existing route label. No IP, credential or arbitrary-target labels.
The Grafana download panel compares both budgets/routes; a separate panel displays
IPv6 transport controls. TCP success alone is not VPN success.

## Interpret the next rounds

- Direct and profile 1 downloads pass but profile 4 stalls at thirty seconds:
  investigate the shared home-to-Hetzner public entry path. This does not yet prove DPI,
  MTU, or a server bug.
- Profile 4 completes at thirty seconds: inspect throughput and the short-budget
  result instead of declaring the original failure fixed.
- Direct bulk controls also fail: investigate the source-to-target path before
  attributing failure to the VPN.
- Both IPv6 connects fail: source IPv6 reachability is suspect. ENETUNREACH is stronger
  evidence than a timeout, which can also mean filtering.
- Only Hetzner's IPv6 connect fails: investigate external IPv6 ingress.
- Both IPv6 connects pass: investigate Reality/SNI next.

The baseline is recorded in project-status.md and project-worklog.md.
Deployed in PR #138 (run 42537716826). The next step is the [controlled recovery experiment](RECOVERY-EXPERIMENT.md), which temporarily replaces this routine suite.
