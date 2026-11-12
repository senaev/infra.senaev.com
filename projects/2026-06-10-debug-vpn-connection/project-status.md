- [ ] Restore reliable VPN access from the affected Russian ISPs.

## Current stage

#155 merged at0428b757; deployment43307488174 succeeded. All5 website smoke
checks passed. Live Grafana has current-status/duration/age panels; fresh
website_senaev_ru metrics show success for home and Hetzner. Logs confirm200,
curl0, home879ms and Hetzner623ms at21:14 UTC. These are website availability
results, not evidence that the VPN candidate is repaired.

#158 fresh8KiB controls deployed. Before the availability rollout reset counters,
home4/8KiB passed2/2 each and16KiB failed2/2; Hetzner all3 sizes passed3/3.
Exit checks passed. Preliminary sample only; compare direct controls and more rounds.

## Prepared next step

PR #165 appends independent fresh12KiB after existing4/16/8KiB. Same exit,
TLS/time/rate/byte-count and lifecycle guards; earlier failure does not suppress
it. Adds28KiB planned response allowance per eligible cycle, not wire-byte limit.
94 tests and local real-process integration pass; CI/review pending. Not merged
or deployed. [Evidence and interpretation](H1-PAYLOAD-VALIDATION.md).

No host networking, server/credential/privilege or production subscription changes.
FirstVDS entry-only; Hetzner and senaev-media remain exits. Original failed
candidate acceptance stays failed; no Happ profile promotion is justified.
