# Baseline and next controlled experiment

Four to five heavy rounds establish a repeatable difference: direct Hetzner-entry
profiles 2–4 receive HTTP 200 and partial downloads, whereas profile 1 enters FirstVDS
and exits Hetzner successfully. Exit validation passes on profiles 0–4. IPv6 profile 5
does not connect. See project-status.md for counters and project-worklog.md for evidence.

This narrows the shared failing segment, but does not prove throttling, DPI, MTU,
or an Xray issue. There is no direct bulk control in the routine checks yet.

## Run on the personal cluster management host

Do not run against a work kubecontext. This starts short-lived Python/curl processes
inside the existing unprivileged probes; it does not edit configuration, restart Xray,
print credentials, or change host networking. Run once, serially, with no background
loop. It can take about four minutes in the worst case.

Compare profiles 0, 1 and 4 from the same source node using the existing local SOCKS
client. Each request allows at most 64 KiB at 32 KiB/s, no redirects or retries.
Twelve requests total: at most 768 KiB of response payload, plus protocol overhead.
Retain all results, including failed direct controls.

```bash
for index in 0 1 4; do
  kubectl -n vpn exec -i deployment/vpn-probe-$index -c probe -- python - <<'PY'
import json
import os
from pathlib import Path
import subprocess
import tempfile

env = {k: v for k, v in os.environ.items()
       if k.lower() not in {"http_proxy", "https_proxy", "all_proxy", "no_proxy"}}
for route, proxy in [("direct", ""), ("vpn", "socks5h://127.0.0.1:1080")]:
    for budget in [8, 30]:
        with tempfile.TemporaryDirectory(prefix="vpn-control-") as folder:
            body = Path(folder) / "body"
            cmd = ["curl", "--disable", "--silent", "--show-error", "--fail",
                   "--proto", "=https", "--ipv4", "--connect-timeout", "3",
                   "--max-time", str(budget), "--max-filesize", "65536",
                   "--limit-rate", "32768", "--proxy", proxy, "--noproxy", "",
                   "--output", str(body), "--write-out", "%{json}",
                   "https://speed.cloudflare.com/__down?bytes=65536"]
            run = subprocess.run(cmd, env=env, capture_output=True, text=True,
                                 timeout=budget + 2, check=False)
            info = json.loads(run.stdout or "{}")
            print(json.dumps({
                "profile_index": os.environ["PROFILE_INDEX"], "route": route,
                "budget_seconds": budget, "curl_exit": run.returncode,
                "http_status": info.get("http_code", 0),
                "bytes": body.stat().st_size if body.exists() else 0,
                "duration_seconds": info.get("time_total", 0),
                "tls_seconds": info.get("time_appconnect", 0)
            }), flush=True)
PY
done
```

## Independent IPv6 control

Run two bounded TCP handshakes from the IPv6 probe, to Hetzner and an independent
public endpoint. No TLS payload or application credentials. A successful TCP connect
does not prove the VPN handshake works.

```bash
kubectl -n vpn exec -i deployment/vpn-probe-5 -c probe -- python - <<'PY'
import json
import socket
for name, address in [
    ("hetzner", "2a01:4f9:c013:5425::1"),
    ("cloudflare", "2606:4700:4700::1111")
]:
    with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as connection:
        connection.settimeout(3)
        try:
            connection.connect((address, 443))
            result = {"connected": True}
        except OSError as error:
            result = {"connected": False, "errno": error.errno,
                      "reason": type(error).__name__}
        print(json.dumps({"target": name, **result}), flush=True)
PY
```

## Decide from the results

- Direct downloads succeed, profile 1 succeeds, profile 4 still stalls at thirty
  seconds: investigate the home-to-Hetzner public entry path. Next compare a client
  fingerprint on a separate temporary client; do not change subscription defaults.
- Profile 4 completes at thirty seconds: report measured throughput; do not simply
  declare the routine failures fixed by increasing its timeout.
- Direct downloads also stall: investigate the source-to-test-target path before
  attributing failure to VPN configuration.
- Both IPv6 connects fail: source IPv6 reachability is suspect. An immediate
  ENETUNREACH is stronger evidence than a timeout, which can also mean filtering.
- Cloudflare IPv6 connects but Hetzner does not: investigate Hetzner's external IPv6
  ingress path before changing the client.
- Both connect: investigate Reality/SNI next; transport reachability is established.

Do not infer a specific cause from Datadog's error severity alone: Xray stderr debug
and info messages are also labelled as error. Server log timestamps have a different
displayed timezone; correlate using Datadog event timestamps.
