# VPN probes from the Russian home connection

One non-root pod per existing subscription entry, pinned to `senaev-media`. Each runs
one persistent Xray 26.9.30 client and a Python runner using curl. Profile links come
directly from the chart's existing subscription entries, with the same UUID derivation.
No inbound Service, TUN, host network, host ports, host mounts or host routing/DNS changes.
SOCKS listens only on pod loopback. Only the runner's explicitly proxied requests use it.

The pods have bounded CPU/memory, read-only root filesystems, dropped capabilities and
no service-account token. Their NetworkPolicy allows inbound metrics only from telemetry vmagent and permits
only CoreDNS plus TCP/443 to public addresses (excluding private, link-local and tailnet
ranges). No Kubernetes API access, host changes or server reconfiguration is needed.
Existing VPN server and subscription manifests are unchanged.

## Routine checks

- About every 30 seconds: direct and proxied HTTPS requests to Google's `generate_204`.
  Require HTTP 204, cap each response at 4 KiB.
- About every 300 seconds: Cloudflare trace through direct and proxied routes; parse a
  valid public IP and compare with the expected exit, then request exactly 64 KiB from
  Cloudflare's download endpoint. Require HTTP 200 and the full 65,536-byte body.
- HTTPS verification stays enabled. No redirects, retries or direct fallback. Curlrc
  and proxy environment variables are ignored. SOCKS5h resolves destination names at
  the VPN exit; resolving the VPN entry's own hostname still uses pod DNS.
- Each request has 3s connection / 8s total / 10s process timeouts and a 32 KiB/s rate
  ceiling. Expected-exit DNS resolution is separately bounded to 4s.
- Profiles are staggered by 3s. One serial loop per pod prevents overlap. Checks schedule
  the next round after completion; slow/failed rounds reduce frequency instead of
  producing queued bursts. Routine probes create fresh HTTPS requests, but leave the
  client process running. This does not assert that an idle tunnel remains established.

For six profiles the bulk payload is about 108 MiB/day. Small checks, TLS overhead,
DNS and VPN framing add traffic. A 64 KiB transfer verifies bounded data flow, not maximum
throughput or long-lived streaming. Third-party endpoint failures can affect results;
compare the direct control and both providers before attributing a failure to VPN/DPI.

`--ipv4` makes direct target requests IPv4 so the home-exit comparison matches the
existing server's IPv4-preferred freedom outbound. The IPv6 subscription still dials
its entry over IPv6 through Xray. IPv6-only destination handling and Android/Happ TUN
behavior are outside this first baseline.

## VictoriaMetrics and Grafana

The routine runner exposes Prometheus metrics on pod port 8080 at `/metrics`.
A VMPodScrape collects them every 30s; NetworkPolicy allows this port only from
`telemetry` pods labeled `app.kubernetes.io/name: vmagent`. SOCKS stays loopback-only;
there is no public Service or ingress.

The provisioned **VPN Probes — Russia** dashboard (UID `vpn-probes`) uses the existing
VictoriaMetrics datasource. It shows exporter availability, per-profile direct/VPN
status timelines, duration and success rate, expected-exit and 64 KiB download results,
payload volume/rate, failures and sample age. Light results older than 90s and heavy
results older than 420s are excluded from fresh-status panels. No sample is not a pass.
An exporter being UP is not proof that the VPN works.

Metrics include `vpn_probe_checks_total`, `vpn_probe_received_bytes_total`,
`vpn_probe_success`, last-check/last-success timestamps, duration, HTTP status, curl
exit code and payload size. Labels are bounded to configured profile/check/route and
counter result; IPs, credentials, URLs and run IDs are never metric labels. Counters
reset on pod restart and dashboard queries account for resets. Manual commands emit
logs only, without starting another metrics server or affecting routine samples.

Dashboard: `https://grafana.senaev.com/d/vpn-probes`. Actual exit IPs and detailed
failures remain in Datadog logs. No alerts are added in this PR.

## Results and on-demand runs

Each check writes JSON to stdout for Datadog (`service:vpn-probe kube_namespace:vpn`):
`profile`, `check`, `route`, `timestamp`, `run_id`, `ok`, curl exit code, HTTP status,
bytes, latency and observed exit IP where applicable. Logs contain no base UUID,
public key, subscription URL/token or rendered client config. `run_id` identifies one
observation; correlate server logs by its timestamp/profile, not by a shared server ID.
Pod health is not a tunnel success: failures remain visible as `ok:false` log records.

From an authorized personal-cluster management terminal (never a work kubecontext):

```bash
kubectl -n vpn logs deployment/vpn-probe-0 -c probe --tail=30
# A fresh client on a separate loopback port: reconnect plus one full diagnostic round.
kubectl -n vpn exec deployment/vpn-probe-0 -c probe -- python /app/probe.py --once
# Working credentials first, then a fresh client with a random UUID. A subsequent
# failure is inconclusive (exit 2); correlate server logs for actual rejection evidence.
kubectl -n vpn exec deployment/vpn-probe-0 -c probe -- python /app/probe.py --invalid
```

Manual checks use a nonblocking per-pod file lock and port 1081; concurrent manual
runs are rejected. Routine tests use 1080 and continue independently.
Indices 0–5 follow the subscription order. The IPv6 profile may legitimately fail if
this ISP has no IPv6 route. Failed probes emit data rather than restarting healthy
clients. A client process crash causes the runner to exit and Kubernetes restarts it.
Rendered configs and response bodies are temporary, mode-restricted pod files.

## Deployment and recovery

The existing pipeline builds `vpn-probe` and deploys `vpn` plus the dashboard in `telemetry/vm-stack`. Adding its service
mapping triggers a full deployment on the first merge under the current planner;
subsequent probe source/chart changes select only VPN. This PR does not introduce
branch deployments, alerts or an autonomous configuration-editing loop.

After deployment verify all six pods are on `senaev-media`, CoreDNS egress works,
JSON records appear in Datadog, direct controls pass, both routine intervals run, and
VictoriaMetrics has `up{job="vpn-probe"}` plus fresh check metrics. Open the provisioned
Grafana dashboard and confirm results/ages and both intervals before trusting it.
A working profile should report its expected exit; a broken profile must never pass
via direct fallback. Compare at least two five-minute rounds before establishing the
baseline. Then run the on-demand invalid-credentials control on a working profile.

To stop only probes, from the personal management host apply the current chart with
its usual values plus `--set vpnProbe.enabled=false`; also set that value in git so
CI retains it. Existing VPN servers/subscription are unaffected. No host networking
rollback is necessary. The home-node connectivity safeguards in AGENTS.md still apply.
