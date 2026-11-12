# senaev.ru incident and availability checks — 2026-11-10

## Confirmed incident

The user reported an outage around06:00. Confirmed infrastructure failure:
06:26 UTC /07:26 Europe/Madrid. No website time series establishes an earlier onset.

Hetzner journal and apt history:
-06:26:18 UTC: tailscaled received remote GET/POST /update requests.
-06:26:24: apt installed Tailscale1.104.5 over1.102.2.
-06:26:30–32: tailscaled restarted and tailscale0 briefly disappeared.
-06:26:31: flannel.1 was deleted; systemd stopped K3s because it is bound to
 sys-subsystem-net-devices-tailscale0.device.
-06:26:34: K3s stopped successfully and remained inactive. Tailscale recovered.
-06:27: API scraping failed; deployment later got connection refused on127.0.0.1:6443.

The existing udev rule sets SYSTEMD_WANTS=k3s.service, but the active device unit
reports Wants= and K3s remains inactive. Recovery failed; the precise
systemd/udev registration or timing defect needs a separate fix.
Effective AutoUpdate shows Apply=True despite the repository's intended disabled
setting. Logs prove a remote update request, not its sender's identity.
No new kernel OOM kill occurred in the sampled window; root disk had~23% free.
Cached Node Ready gauges did not establish current control-plane health.

Same-IP jellyfin.senaev.ru responds HTTP302; senaev.com returns200. senaev.ru times
out before TLS/HTTP completes. Its path is FirstVDS Traefik → Xray Reality fallback
→ Traefik8443 → nextjs-app. Hetzner overlay/API loss is a confirmed fault and
strong explanation for broken cross-node service/DNS paths; CoreDNS is on Hetzner.
FirstVDS SSH rejected the existing credential, so its agent/fallback journal could
not be verified. Do not claim a DNS-specific error or exact failing fallback hop.
[Selected raw evidence](sources/2026-11-10-senaev-ru-incident.txt).

## Merge and deployment

PR #154 merged atd17f690. Run42787487968 built/published the checker and synced
provisioning, then failed before Helm changes because the API refused connections.
Fresh16KiB and exporter-fix changes have not been verified live.

## Availability check proposal

Reuse the checker image/exporter. Enable one worker in home profile1 and one in
Hetzner source control. Direct verified HTTPS HEAD to https://senaev.ru/:
- Require HTTP200; no redirects, retries, VPN or ambient proxy.
-3s connect /8s total curl budget,10s subprocess bound, then30–45s jittered wait.
- No response body; discard headers. Content-Length describes the page, not a
 transfer, so HEAD does not use the download --max-filesize check.
- Export website_senaev_ru through existing success, duration, HTTP status, curl
 exit, counters and last-check metrics. Body-byte counts are0.
- Existing STOP lifecycle joins the worker before closing metrics. Manual
 --once/--invalid commands start no background website worker.

The hosting profile label identifies the exporter; route=direct does not measure
VPN-proxied website access. Tiny independent HEAD requests can overlap matrix
traffic, so quiet intervals are no longer absolutely silent. Website failures do
not change VPN acceptance. No host routing, image, secret, RBAC or policy changes.

Grafana adds status, duration and age panels by source_node, deliberately ignoring
VPN profile/route filters. Current availability uses an instant Stat query with120s freshness, so historical
range-query steps cannot extend a green status. Use dashboard end time now; stale
results cannot show a fresh PASS. Duration history and sample age remain separate. HEAD checks
public TLS/HTTP response, not complete page content. No alert or CI public probe.

Validation:90 unit tests,18 Python files parsed, VPN/telemetry chart lint, rendered
worker scope, dashboard JSON/IDs/queries and diff check. Tests cover HEAD bounds,
timeout/redirect/certificate/server failures, recovery, cadence, cancellation,
actual emit→metrics propagation, cleanup and manual-mode isolation.
Live deployment is blocked by the API outage.

## Recovery proposal — not executed

Restore the existing K3s service on Hetzner while leaving Tailscale running.
This cluster-wide recovery is separate from the website-check PR.
Preconditions: tailscaled and tailscale0 device active, IPv4/IPv6 addresses present.
The proposed write is:

```sh
systemctl start k3s
```

Verify API readiness, flannel.1/flannel-v6.1, nodes and website smoke tests before
retrying #154 deployment. Do not run broad network bootstrap, restart tailscaled,
or change home nodes during recovery. If senaev.ru still fails, obtain FirstVDS
agent/fallback logs and keep the hop-specific cause open.

Then review effective Tailscale update policy and the device-triggered recovery
mechanism separately. No permanent networking change is bundled here.
