- [ ] Restore reliable VPN access from the affected Russian ISPs.

## Current stage

K3s repair was performed by the user; PR #156 closed without merge. No recovery
workaround from that PR is deployed. Run42910743093 successfully deployed #154
with the subsequent main change1f00ca7. All5 website smoke checks passed after
recovery, including senaev.ru. This records availability then, not continuous uptime.

At2026-11-11 08:43 UTC, fresh H1 payload counters: home4KiB19/20 passed,
16KiB0/19; Hetzner4/16KiB38/38 each. Home16KiB exit checks19/20; the failed
exit skipped its payload. All paired direct controls passed. Reused home
4/16/64KiB19/19,0/19,0/19; Hetzner39/39,37/39,38/38. These are cumulative
current-process counters, not matched independent rounds or proof of DPI.

## Prepared next step

Append an independently exit-validated fresh8KiB control after existing4/16KiB,
with unchanged timeout/rate/TLS/cleanup limits,60–90s pre-start quiet time and
2–7s paired-request jitter. Run on existing home and Hetzner paths. Adds20KiB
planned response allowance per eligible cycle; not a strict wire limit.
Prepared only; merge/deployment and repeated observations remain pending.
[Design, evidence and interpretation](H1-PAYLOAD-VALIDATION.md).

## Isolation and remaining work

VPN namespace retained; FirstVDS entry-only, Hetzner and senaev-media remain exits.
No host networking, credentials, privileges, server configuration or production
subscriptions changed. Original failed candidate acceptance stays failed.
The fresh8KiB payload is exported through existing transfer dashboard selectors.
Website availability work remains separate in PR #155, still unmerged.
