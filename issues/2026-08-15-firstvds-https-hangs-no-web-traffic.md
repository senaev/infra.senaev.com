# 2026-08-15 — firstvds serves no web traffic: HTTPS connects then hangs

> This file is the working log for the investigation. All findings, command outputs,
> screenshots, hypotheses confirmed/refuted, and the eventual fix must be appended to
> this file as we go — so the whole debug session lives in one place and is searchable later.
>
> Format: append new dated sections under ## Findings as work proceeds. Don't rewrite
> earlier sections — annotate them.

## Symptom

All `*.senaev.ru` sites stopped serving web traffic. `senaev.ru` and `jellyfin.senaev.ru`
do not load in the browser. SSH to the host still works normally.

External probes from the laptop (2026-08-15 09:08–09:10 UTC):

```
--- DNS ---
senaev.ru              157.22.197.112
jellyfin.senaev.ru     157.22.197.112
senaev.com             77.42.120.71
--- TCP ---
port 80   OPEN
port 443  OPEN
port 22   OPEN
--- ICMP ---
3 packets transmitted, 3 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 93.588/101.621/112.767/8.133 ms
```

Port 80 answers instantly with Traefik's own redirect:

```
$ curl -D - http://157.22.197.112/ -H "Host: jellyfin.senaev.ru"
HTTP/1.1 301 Moved Permanently
Location: https://jellyfin.senaev.ru/
Date: Sat, 15 Aug 2026 09:10:15 GMT
Content-Length: 17
```

Port 443 completes the TLS handshake with a **valid, current Let's Encrypt certificate**,
then never returns an HTTP response:

```
$ openssl s_client -connect 157.22.197.112:443 -servername jellyfin.senaev.ru
depth=3 C=US, O=Internet Security Research Group, CN=ISRG Root X1   verify return:1
depth=2 C=US, O=ISRG, CN=Root YR                                    verify return:1
depth=1 C=US, O=Let's Encrypt, CN=YR1                               verify return:1
depth=0 CN=jellyfin.senaev.ru                                       verify return:1
CONNECTED(00000003)

$ curl -m 20 -w "connect=%{time_connect} appconnect=%{time_appconnect}" https://jellyfin.senaev.ru/
curl: (28) Operation timed out after 20006 milliseconds with 0 bytes received
connect=0.181262 appconnect=0.300700
```

`senaev.ru` on :443 behaves slightly differently — the handshake itself never completes:

```
$ curl -m 20 https://senaev.ru/
curl: (28) Connection timed out after 20006 milliseconds
```

Control host is healthy, so this is firstvds-specific:

```
$ curl -w "http=%{http_code} tls=%{time_appconnect}s" https://senaev.com/
http=200 tls=0.335067s
```

## Context (architecture refresher)

See `AGENTS.md`, `AGENTS.VPN.md`, and `provisioning/helm/senaev-com/values.yaml`.

- `firstvds` is a **k3s worker (agent)**, public IP `157.22.197.112`. The only control
  plane is `hetzner` (`77.42.120.71`). Not Terraform-managed.
- The k3s agent is pinned to Tailscale:
  `--node-external-ip=$TAILNET_IP --flannel-iface=tailscale0`
  (`provisioning/worker/bootstrap-worker.sh:93-97`). **All pod-to-pod traffic between
  nodes rides flannel over `tailscale0`.**
- Ingress is one **Traefik v3.2 DaemonSet per node** (`provisioning/helm/traefik/templates/traefik.yaml`),
  exposed with **hostPort 80 / 443** — no LoadBalancer, no NodePort. `traefik-firstvds`
  has IngressClass `traefik-firstvds`.
- `jellyfin.senaev.ru` — plain ingress entry `senaev-ru-direct`
  (`provisioning/helm/senaev-com/values.yaml`), `websecure` → service `jellyfin:8096`.
  **The Jellyfin pod runs on `senaev-media`** (`jellyfin.vps: senaev-media`, values.yaml:184-185).
- `senaev.ru` — `IngressRouteTCP` `xray-vpn-firstvds-passthrough` claims `HostSNI(senaev.ru)`
  on `websecure` with `tls.passthrough: true` → `xray-vpn-firstvds:443` (local to firstvds).
  Xray Reality then forwards non-VLESS traffic to
  `traefik-firstvds.traefik.svc.cluster.local:8443`, where the `senaev-ru-xray-fallback`
  ingress terminates TLS → service `nextjs-app:3000`.
  **The Next.js pod runs on `hetzner`** (`nextjs.vps: hetzner`, values.yaml:1-3).

Decisive consequence: **every backend behind firstvds lives on a different node.** The
only thing `traefik-firstvds` can answer without leaving the node is its own
`web` → `websecure` 301 redirect — which is exactly the one thing that still works.

## Hypotheses, ranked

**(A) Cross-node pod network down — Tailscale / flannel on firstvds**
Traefik terminates TLS locally and then waits forever for an upstream that it cannot
reach, because `tailscale0` is down or the tailnet IP changed, so the flannel VXLAN
route to `hetzner` and `senaev-media` is dead. Explains all four observations at once:
:80 redirect works (no backend), :443 handshake works (local cert from `acme.json`),
HTTP body never arrives (remote backend), SSH works (public IP, not Tailscale). The
`senaev.ru` handshake failing earlier also fits — Xray must resolve
`traefik-firstvds...svc.cluster.local` through CoreDNS, which runs off-node.
- `Signal:` `tailscale status` down / no `tailscale0` IP / changed IP; `kubectl get node firstvds`
  `NotReady`; ping of another node's tailnet IP or pod CIDR fails from firstvds.
- `Fix:` `tailscale up` again, then restart `k3s-agent` so flannel re-reads the interface.
  If the tailnet IP changed, re-run `scripts/connect-all-workers.sh`.

**(B) Node `NotReady` / kubelet-containerd wedged, stale Traefik config**
The k3s agent lost contact with the API server. Traefik keeps serving its last-known
config (hence the valid cert and the 301) but every endpoint it knows is now stale.
- `Signal:` `kubectl get nodes` shows `firstvds NotReady`; `systemctl status k3s-agent`
  failed/restart-looping; `journalctl -u k3s-agent` full of API-server dial errors.
- `Fix:` `systemctl restart k3s-agent`; check `provisioning/worker/check-worker.sh` output.

**(C) Disk full again (recurrence of `issues/2026-07-27-firstvds-disk-space-low.md`)**
The 15G root disk hit 100%, so containerd/kubelet stall and pods cannot be scheduled or
restarted. Previous incident left ~6.5G free after cleanup, and the journald cap was
applied by hand only — a firstvds reinstall or slow growth could have undone it.
- `Signal:` `df -h /` at or near 100%; `kubectl describe node firstvds` shows
  `DiskPressure=True`; containerd errors in `journalctl`.
- `Fix:` same as the July runbook — `crictl rmi --prune`, then
  `systemctl restart k3s-agent` (this is what actually reclaims orphaned overlay
  snapshots), `journalctl --vacuum-size=300M`, `apt clean`.

**(D) Backend pods themselves are down**
`jellyfin` on `senaev-media` and `nextjs` on `hetzner` are both crashed or evicted.
- `Signal:` `kubectl get pods -n senaev-com -o wide` shows them not `Running`, or
  `kubectl get endpoints -n senaev-com jellyfin nextjs-app` is empty.
- `Fix:` investigate those pods' own logs; unrelated to firstvds.
- Weakened a priori: two unrelated pods on two different nodes failing at the same
  moment is far less likely than one shared network path breaking.

**(E) Xray pod down (would explain `senaev.ru` only)**
`xray-vpn-firstvds` is not running, so the `senaev.ru` SNI passthrough has no backend.
- `Signal:` `xray-vpn-firstvds` pod not `Running`; `senaev.ru` fails but
  `jellyfin.senaev.ru` recovers.
- `Fix:` restart the pod / inspect its logs.
- Cannot be the whole story: it does not explain `jellyfin.senaev.ru`, which bypasses Xray.

## Collaboration model

Claude proposes commands; **the user runs them** and pastes the output back. Claude never
runs SSH, `kubectl exec`, or anything that changes cluster state.

**Round 1 is strictly read-only** — only `get`, `describe`, `logs`, `status`, `df`, `ping`,
`tailscale status`. No restarts, no `tailscale up`, no Helm upgrades, no deletes, until the
fault is localised by the Round 1 output. This constraint applies to every future agent
picking up this file.

## Round 1 diagnostic commands

Run block 1 on the control plane, block 2 on firstvds via the control plane as jump host.

```bash
# ---- Block 1: from the control plane (hetzner) ----
ssh root@77.42.120.71 'kubectl get nodes -o wide'
ssh root@77.42.120.71 'kubectl get pods -A -o wide --field-selector spec.nodeName=firstvds'
ssh root@77.42.120.71 'kubectl describe node firstvds | sed -n "/Conditions:/,/Addresses:/p"'
ssh root@77.42.120.71 'kubectl get pods -n senaev-com -o wide | grep -E "jellyfin|nextjs|NAME"'
ssh root@77.42.120.71 'kubectl get endpoints -n senaev-com jellyfin nextjs-app'
ssh root@77.42.120.71 'kubectl logs -n traefik ds/traefik-firstvds --tail=60'

# ---- Block 2: on firstvds (jump through the control plane) ----
ssh -J root@77.42.120.71 root@157.22.197.112 'tailscale status; echo "--- ip ---"; tailscale ip -4'
ssh -J root@77.42.120.71 root@157.22.197.112 'ip -brief addr show tailscale0; ip route | head -20'
ssh -J root@77.42.120.71 root@157.22.197.112 'df -h /; free -h'
ssh -J root@77.42.120.71 root@157.22.197.112 'systemctl is-active k3s-agent tailscaled; systemctl status k3s-agent --no-pager | head -20'
ssh -J root@77.42.120.71 root@157.22.197.112 'journalctl -u k3s-agent --since "-2h" --no-pager | tail -50'
```

| Command | Confirms | Kills |
|---|---|---|
| `tailscale status` / `ip addr show tailscale0` down or IP changed | **A** | — |
| `get nodes` shows `firstvds NotReady` | A or B | — |
| `describe node` shows `DiskPressure=True`, `df -h /` ≈100% | **C** | — |
| `k3s-agent` inactive / restart-looping | **B** | — |
| `jellyfin` / `nextjs` pods not `Running`, or endpoints empty | **D** | A |
| All the above healthy but `xray-vpn-firstvds` down | **E** | A, B, C |
| Traefik logs show upstream dial/i-o timeouts to pod IPs | **A** | D |

## Fix options (pending Round 1 output)

Do not run any of these until Round 1 localises the fault.

- **If A (Tailscale/flannel):**
  ```bash
  ssh -J root@77.42.120.71 root@157.22.197.112 'tailscale up'          # re-auth if needed
  ssh -J root@77.42.120.71 root@157.22.197.112 'systemctl restart tailscaled && sleep 5 && tailscale ip -4'
  ssh -J root@77.42.120.71 root@157.22.197.112 'systemctl restart k3s-agent'   # flannel re-reads tailscale0
  ```
  If the tailnet IP changed, the node must rejoin with the new external IP:
  `./scripts/connect-all-workers.sh` (re-runs `bootstrap-worker.sh` with `--node-external-ip`).
- **If B (agent wedged):** `systemctl restart k3s-agent`, then `provisioning/worker/check-worker.sh`.
- **If C (disk full):** follow the July runbook in
  `issues/2026-07-27-firstvds-disk-space-low.md` — `crictl rmi --prune`,
  `systemctl restart k3s-agent`, `journalctl --vacuum-size=300M`, `apt clean`.
  Note: `crictl rmi --prune` alone reclaims nothing while exited init containers still
  reference the images; the agent restart is what triggers containerd GC.
- **If D (backend pods):** restart/inspect `jellyfin` and `nextjs` in their own namespaces.
- **If E (Xray):** `kubectl -n senaev-com rollout restart deploy/xray-vpn-firstvds`.

## Verification

1. TLS *and* body, not just handshake:
   `curl -sS -m 20 -o /dev/null -w "http=%{http_code} tls=%{time_appconnect} total=%{time_total}\n" https://jellyfin.senaev.ru/`
   → expect `http=200` (or `302` to the login page) with `total` well under 2s.
2. `curl -sS -m 20 -o /dev/null -w "http=%{http_code}\n" https://senaev.ru/` → expect `200`.
3. Open `jellyfin.senaev.ru` in a browser and load a library page — proves the
   cross-node path to `senaev-media` carries real payload, not just a redirect.
4. `ssh root@77.42.120.71 'kubectl get nodes'` → `firstvds Ready`.
5. VPN still works after any Xray/Traefik restart — connect a client and browse
   (the `senaev.ru` Reality SNI shares the same `:443`).
6. Check `alertmanager.senaev.com` that no firstvds alert is still firing.

## Findings

### 2026-08-15 — Round 1 results

#### Node and pod state — kills (B), (C), (D), (E)

```
NAME           STATUS   ROLES           AGE   VERSION        INTERNAL-IP      EXTERNAL-IP
firstvds       Ready    <none>          65d   v1.35.2+k3s1   100.90.217.37    100.90.217.37
hetzner        Ready    control-plane   98d   v1.35.2+k3s1   100.120.76.115   100.120.76.115
proxmox        Ready    <none>          98d   v1.35.2+k3s1   100.87.199.13    100.87.199.13
senaev-media   Ready    <none>          98d   v1.35.2+k3s1   100.103.254.98   100.103.254.98
```

```
  MemoryPressure   False   KubeletHasSufficientMemory
  DiskPressure     False   KubeletHasNoDiskPressure
  PIDPressure      False   KubeletHasSufficientPID
  Ready            True    KubeletReady
```

```
/dev/vda3        15G  6.5G  7.5G  47% /
Mem:           962Mi       496Mi        71Mi       4.3Mi       539Mi       465Mi
Swap:          2.5Gi        20Mi       2.4Gi
```

`k3s-agent` and `tailscaled` both `active`; agent up since Fri 2026-08-14 05:57 MSK (≈30h).

Backend pods and endpoints are **healthy**:

```
jellyfin-7ff7c5d96d-kfx52    1/1  Running  1 (45d ago)  49d  10.42.3.179  senaev-media
nextjs-app-b774dbdfd-b4wpn   1/1  Running  0            22d  10.42.0.217  hetzner

NAME         ENDPOINTS          AGE
jellyfin     10.42.3.179:8096   98d
nextjs-app   10.42.0.217:3000   98d
```

Interpretation: **(B) killed** — agent healthy and node `Ready` for 30h.
**(C) killed** — disk at 47%, `DiskPressure=False`; the July issue has not recurred.
**(D) killed** — both backend pods `Running` with populated endpoints.
**(E) killed** — `xray-vpn-firstvds` is `1/1 Running`, and it cannot explain `jellyfin.senaev.ru` anyway.

#### Tailscale is up — refutes (A) as originally worded

```
100.90.217.37    firstvds      linux  -
100.120.76.115   hetzner       linux  active; direct 77.42.120.71:41641, tx 306676320 rx 209625016
100.87.199.13    proxmox       linux  active; direct 46.48.65.87:1027,   tx 3091568  rx 2911324
100.103.254.98   senaev-media  linux  active; direct 46.48.65.87:41641,  tx 3170840  rx 2967992
100.102.221.125  vultr         linux  offline, last seen 5d ago

--- ip ---
100.90.217.37
tailscale0       UNKNOWN        100.90.217.37/32 fd7a:115c:a1e0::d736:d926/128 ...
default via 10.0.0.1 dev ens3 onlink
10.42.0.0/24 via 10.42.0.0 dev flannel.1 onlink
10.42.1.0/24 via 10.42.1.0 dev flannel.1 onlink
10.42.2.0/24 dev cni0 proto kernel scope link src 10.42.2.1
10.42.3.0/24 via 10.42.3.0 dev flannel.1 onlink
```

`tailscale0` is up with the expected IP, direct paths to all three peers, and every
flannel route is present. So **(A) as literally worded — "Tailscale down / IP changed" —
is refuted.** The node-level transport works, which is also why kubelet keeps the node
`Ready` (kubelet↔apiserver runs over plain `tailscale0`, *not* over the flannel VXLAN
overlay that carries pod traffic).

#### Traefik log — the actual smoking gun

Every outbound DNS lookup from the Traefik pod times out, so **all** ACME renewals fail:

```
2026-08-15T02:58:03Z WRN Error checking new version error="Get \"https://update.traefik.io/repos/traefik/traefik/releases\": dial tcp: lookup update.traefik.io: i/o timeout"
2026-08-15T03:01:33Z INF Error renewing certificate from LE : {Main:senaev.ru SANs:[]}            error="... dial tcp: lookup acme-v02.api.letsencrypt.org: i/o timeout"
2026-08-15T03:02:03Z INF Error renewing certificate from LE : {Main:filebrowser.senaev.ru SANs:[]} error="... i/o timeout"
2026-08-15T03:02:33Z INF Error renewing certificate from LE : {Main:prowlarr.senaev.ru SANs:[]}    error="... i/o timeout"
2026-08-15T03:03:03Z INF Error renewing certificate from LE : {Main:webdav.senaev.ru SANs:[]}      error="... i/o timeout"
2026-08-15T03:03:33Z INF Error renewing certificate from LE : {Main:jellyfin.senaev.ru SANs:[]}    error="... i/o timeout"
2026-08-15T03:04:03Z INF Error renewing certificate from LE : {Main:qbittorrent.senaev.ru SANs:[]} error="... i/o timeout"
2026-08-15T03:04:33Z INF Error renewing certificate from LE : {Main:unmanic.senaev.ru SANs:[]}     error="... i/o timeout"
```

`i/o timeout` on a *DNS lookup* means the Traefik pod cannot get an answer out of
CoreDNS. CoreDNS does not run on firstvds — reaching it requires the **flannel VXLAN
overlay**. This is the first hard evidence that pod traffic leaving firstvds is dead
while node traffic is fine.

The xray pod was replaced at ~08:52 today (IP `10.42.2.26` → `10.42.2.27`), producing a
short burst of expected churn:

```
2026-08-15T08:52:45Z ERR Cannot create service error="no servers found for senaev-com/xray-vpn-firstvds" ingress=xray-vpn-firstvds-passthrough ...
2026-08-15T08:52:46Z ERR error="the service \"senaev-com-xray-vpn-firstvds-passthrough-...@kubernetescrd\" does not exist" entryPointName=websecure ...
```

Note the pod is `Running` with `0` restarts and age `21m`, consistent with a fresh
recreation at 08:52 rather than a crash loop.

The recurring `connection reset by peer` lines to `10.42.2.26:443` / `10.42.2.27:443`
every ~12 minutes all night are the **local** xray passthrough and are *not* a fault
signal — they prove the same-node path still works. The last three (08:58, 09:00, 09:09)
line up with the external probes run from the laptop.

#### k3s-agent log — noise plus one long-standing misconfiguration

```
E0815 12:06:55.999475  dns.go:154] "Nameserver limits exceeded" err="Nameserver limits were exceeded, some nameservers have been omitted, the applied nameserver line is: 2a01:230:1:1::229 2a01:230:1:1::230 188.120.247.2"
```

The host `/etc/resolv.conf` lists two IPv6 resolvers before the IPv4 one, and Kubernetes
caps pods at 3 nameservers. This is a pre-existing FirstVDS default, not new today, but it
is worth fixing separately because it puts unreachable IPv6 resolvers first for any
`dnsPolicy: Default` pod.

Two pods are crash-looping, both **unrelated to web traffic**:
- `iperf3-agent-firstvds` — `CrashLoopBackOff`, 367 restarts over 43d (long-standing).
- `smokeping-prober-7v55f` — `CrashLoopBackOff`, 8 restarts, 18m old. Uses `hostNetwork`
  (IP `100.90.217.37`), so it is not evidence about the pod overlay. May well be a
  *second symptom* of the same fault if it fails to reach its off-node targets.

No containerd, OOM, or flannel errors appear in the agent log.

#### Revised diagnosis

Combining: TLS terminates locally with a valid cert ✅, the local xray path works ✅,
node-level Tailscale works ✅, but **DNS to CoreDNS times out** ❌ and **both HTTP
backends live off-node** ❌ — the fault is the **flannel VXLAN overlay on top of
`tailscale0`**, not Tailscale itself. Routes exist in the table; encapsulated traffic
does not survive the trip.

Two sub-variants remain, and they need different fixes:

**(A1) Total VXLAN blackhole.** UDP 8472 encapsulated traffic is dropped outright, or
`flannel.1` has a stale FDB/ARP/VTEP mapping after the k3s-agent restart 30h ago.
- `Signal:` even a small `ping` to an off-node pod IP (`10.42.0.217`, `10.42.3.179`) fails.
- `Fix:` restart `k3s-agent` to rebuild `flannel.1` and its FDB.

**(A2) MTU blackhole.** `flannel.1` MTU is too large for `tailscale0` (Tailscale uses
1280, so VXLAN-over-Tailscale needs ≈1230). Small packets pass, full-size segments are
silently dropped. This fits the symptom unusually well: the TLS handshake — all small
records — completes in 0.30s, then the first full-size data segment from the backend
vanishes and curl reports "0 bytes received" after 20s.
- `Signal:` small `ping` to an off-node pod IP **succeeds**, but `ping -M do -s 1400`
  fails while `-s 1200` succeeds; and `ip -d link show flannel.1` MTU > `tailscale0` MTU − 50.
- `Fix:` correct the MTU (`flannel-iface-mtu` / `ip link set flannel.1 mtu 1230`) and
  compare against a healthy worker.

### 2026-08-15 — Round 2 commands (still read-only)

```bash
# --- MTU comparison: firstvds vs a known-good worker ---
ssh -J root@77.42.120.71 root@157.22.197.112 'for i in ens3 tailscale0 flannel.1 cni0; do printf "%-12s " $i; ip -o link show $i 2>/dev/null | grep -o "mtu [0-9]*" || echo MISSING; done'
ssh -J root@77.42.120.71 root@100.103.254.98 'for i in tailscale0 flannel.1 cni0; do printf "%-12s " $i; ip -o link show $i 2>/dev/null | grep -o "mtu [0-9]*" || echo MISSING; done'

# --- (A1) vs (A2): does ANY packet cross the overlay? ---
ssh -J root@77.42.120.71 root@157.22.197.112 'ping -c3 -W2 10.42.0.217; echo "--- media ---"; ping -c3 -W2 10.42.3.179'

# --- (A2): find the real MTU ceiling ---
ssh -J root@77.42.120.71 root@157.22.197.112 'for s in 1000 1200 1300 1400; do printf "size %-5s " $s; ping -c2 -W2 -M do -s $s 10.42.3.179 >/dev/null 2>&1 && echo OK || echo DROP; done'

# --- real backend reachability from the host (same overlay Traefik uses) ---
ssh -J root@77.42.120.71 root@157.22.197.112 'curl -sS -m 8 -o /dev/null -w "jellyfin http=%{http_code} total=%{time_total}\n" http://10.42.3.179:8096/ ; curl -sS -m 8 -o /dev/null -w "nextjs   http=%{http_code} total=%{time_total}\n" http://10.42.0.217:3000/'

# --- CoreDNS: where does it live, and can firstvds reach it? ---
ssh root@77.42.120.71 'kubectl get pods -n kube-system -o wide | grep -E "coredns|NAME"'
ssh root@77.42.120.71 'kubectl get svc -n kube-system kube-dns'

# --- VXLAN neighbour/FDB state on flannel.1 ---
ssh -J root@77.42.120.71 root@157.22.197.112 'echo "=== fdb ==="; bridge fdb show dev flannel.1; echo "=== neigh ==="; ip neigh show dev flannel.1'

# --- is UDP 8472 actually flowing? (run twice, ~10s apart, compare counters) ---
ssh -J root@77.42.120.71 root@157.22.197.112 'ip -s link show flannel.1 | tail -5; echo "--- nft/iptables drops ---"; nft list ruleset 2>/dev/null | grep -i drop | head -20 || iptables -L -n -v | grep -i drop | head -20'

# --- secondary: why is smokeping-prober crashing? (may be the same fault) ---
ssh root@77.42.120.71 'kubectl logs -n telemetry smokeping-prober-7v55f --tail=30 --previous 2>/dev/null || kubectl logs -n telemetry smokeping-prober-7v55f --tail=30'
```

| Result | Confirms |
|---|---|
| small `ping` to `10.42.0.217` / `10.42.3.179` fails | **A1** total VXLAN blackhole |
| small `ping` OK but `-s 1400` DROP | **A2** MTU blackhole |
| `flannel.1` MTU > `tailscale0` MTU − 50, and differs from `senaev-media` | **A2** |
| `curl` to pod IP hangs while `ping` succeeds | **A2** |
| `bridge fdb` missing entries for peer VTEPs | **A1** stale FDB |

### 2026-08-15 — Round 2 partial: (A1) CONFIRMED, (A2) killed

```
$ ping -c3 -W2 10.42.0.217        # nextjs-app on hetzner
PING 10.42.0.217 (10.42.0.217) 56(84) bytes of data.
--- 10.42.0.217 ping statistics ---
3 packets transmitted, 0 received, 100% packet loss, time 2039ms

$ ping -c3 -W2 10.42.3.179        # jellyfin on senaev-media
PING 10.42.3.179 (10.42.3.179) 56(84) bytes of data.
--- 10.42.3.179 ping statistics ---
3 packets transmitted, 0 received, 100% packet loss, time 2026ms
```

**100% loss on 56-byte ICMP to off-node pods on two different nodes.**

- **(A1) confirmed** — the flannel VXLAN overlay out of firstvds is a total blackhole,
  not a size-dependent one.
- **(A2) killed** — an MTU blackhole cannot drop a 56-byte packet. The MTU probe
  (`-s 1200/1400`) is therefore moot and does not need to be run.

This is fully consistent with every earlier observation: node-level Tailscale carries
kubelet↔apiserver traffic fine, while *encapsulated pod* traffic riding on top of it is
discarded. The routes are in the table (`10.42.0.0/24 via 10.42.0.0 dev flannel.1`) but
nothing traverses them.

Refined `time_appconnect=0.30s` reading: Traefik never needed the overlay to finish the
TLS handshake — it served the cached cert from the local `acme.json` hostPath. The stall
begins the instant it must dial an endpoint.

### 2026-08-15 — Round 3: root-cause commands (read-only) before any restart

`(A1)` is localised, so a restart is now justified — but these five commands take seconds
and are the difference between a fix and a fix that recurs in 30 hours. Run them **first**.

```bash
# 1. Is flannel.1's VXLAN bound to the correct local address (must be the tailscale0 IP)?
ssh -J root@77.42.120.71 root@157.22.197.112 'ip -d link show flannel.1'

# 2. Does flannel agree with the node's registered backend address?
ssh -J root@77.42.120.71 root@157.22.197.112 'cat /run/flannel/subnet.env; echo "--- k3s agent flags ---"; grep -o "\-\-[a-z-]*=[^ ]*" /etc/systemd/system/k3s-agent.service | head -20'
ssh root@77.42.120.71 'kubectl get node firstvds -o jsonpath="{.metadata.annotations}" | tr "," "\n" | grep -i flannel'

# 3. VXLAN peer state — missing/stale VTEP entries confirm a stale FDB
ssh -J root@77.42.120.71 root@157.22.197.112 'echo "=== fdb ==="; bridge fdb show dev flannel.1; echo "=== neigh ==="; ip neigh show dev flannel.1'

# 4. Are the encapsulated packets even leaving/arriving? (10s capture, harmless)
ssh -J root@77.42.120.71 root@157.22.197.112 'timeout 10 tcpdump -i tailscale0 -n udp port 8472 -c 20 2>&1 | tail -25'

# 5. Is something dropping UDP 8472 locally?
ssh -J root@77.42.120.71 root@157.22.197.112 'nft list ruleset 2>/dev/null | grep -iE "drop|reject|8472" | head -20; echo "--- legacy ---"; iptables -L INPUT -n -v 2>/dev/null | head -15'

# 6. Reverse direction — does hetzner reach the firstvds pod? (isolates which side is broken)
ssh root@77.42.120.71 'ping -c3 -W2 10.42.2.24; echo "--- traefik pod on firstvds ---"'
```

| Result | Root cause | Implication |
|---|---|---|
| `flannel.1` shows `local <ens3 IP>` instead of `100.90.217.37` | flannel bound to the wrong interface | `--flannel-iface=tailscale0` not honoured; agent restart alone may not fix it — needs re-bootstrap |
| `/run/flannel/subnet.env` or node annotation has a stale `PublicIP` | stale flannel registration | agent restart fixes it |
| `bridge fdb` empty / missing peer VTEPs | stale FDB after the 30h-ago restart | agent restart fixes it |
| `tcpdump` shows outgoing 8472 but no replies | drop is remote or in the tailnet | investigate peers / Tailscale ACL |
| `tcpdump` shows nothing outgoing | flannel is not encapsulating at all | agent restart |
| `nft` has a DROP covering 8472 | firewall regression | fix the rule, not the agent |
| reverse ping from hetzner also fails | bidirectional break | consistent with either; agent restart first |

### 2026-08-15 — Fix, gated on Round 3

Default fix for a stale VXLAN/FDB (the most likely outcome) — restart the agent so
flannel rebuilds `flannel.1`, its FDB, and its VTEP mappings:

```bash
ssh -J root@77.42.120.71 root@157.22.197.112 'systemctl restart k3s-agent'
sleep 45
ssh -J root@77.42.120.71 root@157.22.197.112 'ping -c3 -W2 10.42.3.179'
```

Escalation if the overlay is still dead after the restart — rebuild the node's flannel
registration from the repo (re-runs `bootstrap-worker.sh` with the correct
`--node-external-ip` / `--flannel-iface=tailscale0`):

```bash
./scripts/connect-all-workers.sh
```

Do **not** reach for `connect-all-workers.sh` first; it is heavier and the agent restart
resolves the stale-FDB case on its own.

### 2026-08-15 — Round 3 results: flannel is CORRECTLY configured — restart plan withdrawn

```
4: flannel.1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1230 qdisc noqueue state UNKNOWN
    link/ether e2:f5:27:2f:4c:36 brd ff:ff:ff:ff:ff:ff
    vxlan id 1 local 100.90.217.37 dev tailscale0 srcport 0 0 dstport 8472 ttl auto ageing 300 nolearning
```

```
FLANNEL_NETWORK=10.42.0.0/16
FLANNEL_SUBNET=10.42.2.1/24
FLANNEL_MTU=1230
FLANNEL_IPMASQ=true
```

```
"flannel.alpha.coreos.com/backend-type":"vxlan"
"flannel.alpha.coreos.com/public-ip":"100.90.217.37"
"flannel.alpha.coreos.com/public-ip-overwrite":"100.90.217.37"
```

```
=== fdb ===
42:fe:c3:b5:fe:2a dst 100.120.76.115 self permanent   # hetzner
42:08:8e:a9:46:ba dst 100.103.254.98 self permanent   # senaev-media
42:ea:48:bb:58:ba dst 100.87.199.13  self permanent   # proxmox
=== neigh ===
10.42.3.0 lladdr 42:08:8e:a9:46:ba PERMANENT
10.42.1.0 lladdr 42:ea:48:bb:58:ba PERMANENT
10.42.0.0 lladdr 42:fe:c3:b5:fe:2a PERMANENT
```

Every single thing is right:
- `local 100.90.217.37 dev tailscale0` — bound to the **correct** interface and IP.
- `mtu 1230` — exactly right for VXLAN over Tailscale's 1280.
- FDB has all three peer VTEPs with correct tailnet destinations.
- `ip neigh` maps every remote pod subnet to the correct VTEP MAC.
- Node annotations (`public-ip`, `public-ip-overwrite`) agree with `tailscale ip -4`.

**Therefore the planned `systemctl restart k3s-agent` fix is withdrawn.** There is nothing
stale for a restart to rebuild — it would recreate an identical, equally broken interface.
This is exactly the trap Round 3 was designed to avoid.

Reverse direction fails too:

```
$ ssh root@77.42.120.71 'ping -c3 -W2 10.42.2.24'     # hetzner -> traefik pod on firstvds
3 packets transmitted, 0 received, 100% packet loss, time 2049ms
```

`tcpdump` is not installed on firstvds (`No such file or directory`), so the capture step
could not run.

#### Re-derived diagnosis

The overlay is **bidirectionally** dead while the underlay is demonstrably alive:
`tailscale status` reports `active; direct` to all peers, and kubelet↔apiserver traffic
over `tailscale0` is working *right now* (node heartbeat 09:13:50, `Ready`).

So `tailscale0` carries **TCP/6443 to hetzner** but not **UDP/8472 to the same host**.
That narrows the fault to something that discriminates by protocol/port — which flannel
config cannot do, and a k3s restart cannot fix.

New hypotheses, replacing (A1)/(A2):

**(F) Tailscale ACL / packet-filter change blocking UDP 8472**
Tailscale enforces the tailnet policy as an inbound packet filter on `tailscale0`. If the
ACL was tightened (or a default-allow rule replaced with port-scoped rules), UDP 8472
would be dropped at *both* ends while an explicitly-permitted 6443 keeps working. Fits the
bidirectional failure and the intact local config perfectly.
- `Signal:` `tailscale debug netmap` packet filter lacks a rule covering UDP 8472 / `*`;
  `ping 100.120.76.115` may still work (ICMP often separately allowed).
- `Fix:` restore the tailnet ACL to permit all ports between nodes (Tailscale admin console).

**(G) Host firewall (nftables/iptables) dropping UDP 8472**
A rule was added or a package (ufw/firewalld/fail2ban) reinstated a default-drop policy.
Round 3's `nft` command was not run, so this is still completely open.
- `Signal:` a DROP/REJECT rule in `nft list ruleset` matching 8472, or a default-drop
  INPUT/FORWARD policy.
- `Fix:` remove/adjust the rule.

**(H) tailscaled auto-updated and changed data-plane behaviour**
A recent tailscaled version bump could alter netfilter mode or peer-relay handling.
- `Signal:` `tailscale version` recent; apt/journal shows a tailscaled upgrade within ~48h.
- `Fix:` pin/downgrade, or set the appropriate `--netfilter-mode`.

**(I) Underlay tailnet data plane is broken despite "active"**
The `tx/rx` counters in `tailscale status` are cumulative since tailscaled start, not
proof of current flow. Note tx to `senaev-media` is only 3.1MB vs 306MB to hetzner.
- `Signal:` `ping 100.120.76.115` / `100.103.254.98` fails, or `tailscale ping` falls
  back to DERP or fails outright.
- `Fix:` `systemctl restart tailscaled`, then re-check.

### 2026-08-15 — Round 4 commands (read-only)

```bash
# --- (I) Does the UNDERLAY actually pass traffic right now? The key discriminator. ---
ssh -J root@77.42.120.71 root@157.22.197.112 'for ip in 100.120.76.115 100.103.254.98 100.87.199.13; do printf "%-16s " $ip; ping -c2 -W2 $ip >/dev/null 2>&1 && echo OK || echo FAIL; done'
ssh -J root@77.42.120.71 root@157.22.197.112 'tailscale ping --c 3 100.120.76.115; echo "--- media ---"; tailscale ping --c 3 100.103.254.98'

# --- (G) Host firewall: the command missed in Round 3 ---
ssh -J root@77.42.120.71 root@157.22.197.112 'nft list ruleset 2>/dev/null | head -60'
ssh -J root@77.42.120.71 root@157.22.197.112 'iptables -L INPUT -n -v --line-numbers 2>/dev/null | head -20; echo "=== FORWARD ==="; iptables -L FORWARD -n -v 2>/dev/null | head -20'
ssh -J root@77.42.120.71 root@157.22.197.112 'systemctl is-enabled ufw firewalld nftables 2>&1; echo "--- ufw ---"; ufw status 2>/dev/null || echo "no ufw"'

# --- (F) Tailscale packet filter derived from the tailnet ACL ---
ssh -J root@77.42.120.71 root@157.22.197.112 'tailscale debug netmap 2>/dev/null | grep -iA25 packetfilter | head -40'

# --- (H) Version and recent tailscaled changes ---
ssh -J root@77.42.120.71 root@157.22.197.112 'tailscale version; echo "--- prefs ---"; tailscale debug prefs 2>/dev/null | grep -iE "netfilter|noSNAT|routeAll|shields"'
ssh -J root@77.42.120.71 root@157.22.197.112 'journalctl -u tailscaled --since "-48h" --no-pager | grep -iE "version|update|restart|starting|acl|filter" | tail -30'
ssh -J root@77.42.120.71 root@157.22.197.112 'grep -iE "tailscale" /var/log/apt/history.log 2>/dev/null | tail -10 || echo "no apt history match"'

# --- Compare with a healthy pair: does the overlay work BETWEEN the other nodes? ---
ssh root@77.42.120.71 'ping -c2 -W2 10.42.3.179 >/dev/null 2>&1 && echo "hetzner->media pod OK" || echo "hetzner->media pod FAIL"'
```

| Result | Confirms | Next step |
|---|---|---|
| `ping 100.120.76.115` FAILS | **I** underlay dead | `systemctl restart tailscaled` |
| tailnet ping OK but pod ping fails | **F** or **G** | inspect filter/firewall output |
| `nft`/`iptables` shows DROP touching 8472 or default-drop | **G** | remove the rule |
| packet filter lacks a UDP 8472 / wildcard rule | **F** | fix tailnet ACL in admin console |
| `tailscale ping` reports DERP relay instead of direct | **I** partial | restart tailscaled |
| `hetzner->media pod OK` | fault is firstvds-local | rules out a cluster-wide flannel break |

### 2026-08-15 — Round 4 results: (G) CONFIRMED — UFW is dropping VXLAN

#### The underlay is fine — kills (I)

```
100.120.76.115   OK
100.103.254.98   OK
100.87.199.13    OK

$ tailscale ping --c 3 100.120.76.115
pong from hetzner (100.120.76.115) via 77.42.120.71:41641 in 36ms
```

Tailnet ICMP reaches all three peers and the path is **direct**, not DERP-relayed.
**(I) killed.**

#### The Tailscale ACL is wide open — kills (F)

```json
"PacketFilter": [{
    "Dsts": [
        {"Net": "0.0.0.0/0", "Ports": {"First": 0, "Last": 65535}},
        {"Net": "::/0",      "Ports": {"First": 0, "Last": 65535}}
    ],
    "IPProto": [6, 17, 1, 58]
}]
```

All ports, all destinations, and IPProto includes **17 (UDP)**. The tailnet policy permits
UDP 8472. **(F) killed.**

#### UFW is active and does not allow VXLAN — (G) CONFIRMED

```
$ systemctl is-enabled ufw firewalld nftables
enabled
not-found
disabled

$ ufw status
Status: active

To                         Action      From
--                         ------      ----
80/tcp                     ALLOW       Anywhere
443                        ALLOW       Anywhere
22/tcp                     ALLOW       Anywhere
ispmanager                 ALLOW       Anywhere
80/tcp (v6)                ALLOW       Anywhere (v6)
443 (v6)                   ALLOW       Anywhere (v6)
22/tcp (v6)                ALLOW       Anywhere (v6)
ispmanager (v6)            ALLOW       Anywhere (v6)
```

**UFW is enforcing a default-deny INPUT policy that allows only 80, 443, 22, and
`ispmanager`.** There is no rule for UDP 8472, none for the pod CIDR `10.42.0.0/16`, none
for the service CIDR `10.43.0.0/16`, and none for the `tailscale0` / `cni0` / `flannel.1`
interfaces.

This explains the exact protocol/port discrimination that puzzled Round 3:

- UFW's INPUT chain applies to **every** interface, including `tailscale0`. A VXLAN packet
  arriving from a peer is *decapsulated by WireGuard first*, then presented to netfilter as
  `UDP dport 8472` on `tailscale0` → matches no ALLOW rule → **dropped**.
- kubelet↔apiserver (TCP/6443) survives because **firstvds initiates it outbound**, so
  conntrack `ct state related,established` lets the replies back in.
- `ping 100.120.76.115` and `tailscale ping` survive for the same reason — locally
  initiated, replies allowed by conntrack.
- Hosted WireGuard itself (UDP 41641 inbound) is likewise not in the allow list, but
  NAT-traversal is outbound-initiated, so the direct path still forms.
- Both directions of the *overlay* fail because the reply leg is always an
  unsolicited-looking inbound UDP 8472.
- Traefik's `:80` redirect and the local xray passthrough work because 80 and 443 **are**
  explicitly allowed and never leave the node.

#### Why it started ~30h ago

```
Aug 14 05:56:57 firstvds systemd[1]: Starting tailscaled.service - Tailscale node agent...
Aug 14 05:56:59 firstvds tailscaled[773]: Program starting: v1.98.4-...
Aug 14 05:59:04 firstvds tailscaled[773]: control: lite map update error after 2m0.003s: Post "https://controlplane.tailscale.com/machine/map": context canceled
...
Aug 14 06:13:20 firstvds tailscaled[773]: control: lite map update error after 14.67s: Post "https://controlplane.tailscale.com/machine/map": read tcp 157.22.197.112:48562->192.200.0.102:80: read: connection timed out
```

`tailscaled` started at **Aug 14 05:56:57 MSK** — i.e. the host **rebooted** ~30h ago,
which matches `k3s-agent` "active since Fri 2026-08-14 05:57:22 MSK", the node's
`LastTransitionTime` of Fri 14 Aug 02:57:19 UTC, and the "1 (30h ago)" restart counts on
`traefik-firstvds` and `node-exporter`.

`ufw` is `enabled`, so on that reboot it came up **enforcing**. The `ispmanager` allow rule
is the strong hint about provenance: ispmanager is the **FirstVDS control panel**, and it
manages UFW. Most likely ispmanager was installed/updated/reset and (re)configured UFW
with a stock web-server ruleset — which knows nothing about Tailscale or flannel. Whether
the rules were written earlier and only took effect at reboot, or were rewritten by the
panel, still needs confirming (see Round 5).

**(H) killed** as a cause: tailscaled v1.98.4 is running, but the log shows a clean start
at boot, not an upgrade-induced behaviour change.

#### One loose end — `hetzner->media pod FAIL`

```
hetzner->media pod FAIL
```

Pinging `10.42.3.179` from **hetzner** also fails, which cannot be explained by firstvds's
UFW. Two readings:

1. **Ping-to-pod-IP is not a valid probe in this cluster** (e.g. host→remote-pod ICMP
   source selection, or the CNI drops it), in which case my Round 2/4 ping evidence is
   weaker than assumed and the UFW finding stands on its own merits.
2. **The overlay is degraded cluster-wide**, and `senaev-media` has a similar firewall
   issue — plausible since `senaev-media` and `proxmox` share the NAT address
   `46.48.65.87` (home network).

This must be disambiguated **before** claiming resolution, because reading 2 would mean
`jellyfin.senaev.com` (served by `traefik-hetzner` → jellyfin pod on `senaev-media`) is
also broken and the user simply has not reported it.

### 2026-08-15 — Round 5: confirm scope + provenance (read-only)

```bash
# 1. DISAMBIGUATE: does hetzner reach a pod on its OWN node? Validates the ping probe.
ssh root@77.42.120.71 'echo -n "hetzner->local pod (nextjs 10.42.0.217): "; ping -c2 -W2 10.42.0.217 >/dev/null 2>&1 && echo OK || echo FAIL'
ssh root@77.42.120.71 'echo -n "hetzner->proxmox pod subnet gw (10.42.1.0): "; ping -c2 -W2 10.42.1.0 >/dev/null 2>&1 && echo OK || echo FAIL'

# 2. A probe that does NOT depend on ICMP: real TCP to the jellyfin backend, from each node
ssh root@77.42.120.71 'curl -sS -m 8 -o /dev/null -w "hetzner->jellyfin http=%{http_code} total=%{time_total}\n" http://10.42.3.179:8096/ || echo "hetzner->jellyfin FAILED"'
ssh -J root@77.42.120.71 root@157.22.197.112 'curl -sS -m 8 -o /dev/null -w "firstvds->jellyfin http=%{http_code} total=%{time_total}\n" http://10.42.3.179:8096/ || echo "firstvds->jellyfin FAILED"'

# 3. Is jellyfin.senaev.com (hetzner path to the same pod) actually up? Tests reading 2 end-to-end.
curl -sS -m 20 -o /dev/null -w "jellyfin.senaev.com http=%{http_code} total=%{time_total}\n" https://jellyfin.senaev.com/ || echo "jellyfin.senaev.com FAILED"

# 4. Do the other nodes run UFW too?
ssh root@77.42.120.71 'echo "=== hetzner ==="; ufw status 2>/dev/null || echo "no ufw"; systemctl is-enabled ufw 2>&1'
ssh -J root@77.42.120.71 root@100.103.254.98 'echo "=== senaev-media ==="; ufw status 2>/dev/null || echo "no ufw"; systemctl is-enabled ufw 2>&1'

# 5. PROOF that UFW is the one dropping 8472: look for the counters/log entries
ssh -J root@77.42.120.71 root@157.22.197.112 'nft list ruleset 2>/dev/null | grep -B3 -A12 "ufw-user-input" | head -40'
ssh -J root@77.42.120.71 root@157.22.197.112 'iptables -L ufw-user-input -n -v --line-numbers 2>/dev/null; echo "=== policies ==="; ufw status verbose 2>/dev/null | head -12'
ssh -J root@77.42.120.71 root@157.22.197.112 'journalctl -k --since "-30h" --no-pager | grep -i "UFW BLOCK" | grep -E "8472|10\.42\." | tail -15'

# 6. PROVENANCE: when were the UFW rules last written, and by what?
ssh -J root@77.42.120.71 root@157.22.197.112 'ls -la --time-style=full-iso /etc/ufw/ /lib/ufw/ 2>/dev/null | head -25'
ssh -J root@77.42.120.71 root@157.22.197.112 'grep -rn "ispmanager\|8472" /etc/ufw/ 2>/dev/null | head; echo "--- applications ---"; ls /etc/ufw/applications.d/ 2>/dev/null'
ssh -J root@77.42.120.71 root@157.22.197.112 'grep -iE "ufw|ispmanager" /var/log/apt/history.log 2>/dev/null | tail -15; echo "--- uptime/reboot ---"; uptime -s; last reboot | head -5'
```

| Result | Meaning |
|---|---|
| `hetzner->local pod OK` **and** `hetzner->jellyfin FAILED` | overlay genuinely broken beyond firstvds → **reading 2**, widen scope |
| `hetzner->local pod FAIL` | ping-to-pod is an invalid probe → **reading 1**, UFW finding stands alone |
| `hetzner->jellyfin http=200` | hetzner↔media overlay is **healthy**; only firstvds is broken |
| `jellyfin.senaev.com http=200` | confirms hetzner↔media works end-to-end → firstvds-only fault |
| `senaev-media` also runs UFW active | second node needs the same fix |
| `UFW BLOCK` lines mentioning 8472 | direct, incontrovertible proof of the drop |
| `/etc/ufw/*` mtime ≈ ispmanager install/update | provenance = control panel rewrote the rules |

### 2026-08-15 — Fix plan (gated on Round 5; NOT yet applied)

The fix must allow the overlay without re-exposing the node to the internet. Preferred:
trust the Tailscale interface and the cluster CIDRs, rather than opening UDP 8472 globally.

```bash
# Allow all traffic arriving over the tailnet (peer-authenticated by WireGuard)
ufw allow in on tailscale0
# Allow pod/service CIDRs and the local CNI bridge
ufw allow in on cni0
ufw allow from 10.42.0.0/16
ufw allow from 10.43.0.0/16
# k3s needs forwarding between pods
ufw default allow routed
ufw reload
```

Deliberately **not** using `ufw allow 8472/udp`: that would accept VXLAN from any source on
the public interface, letting an attacker inject frames into the pod network.

Also consider `ufw allow 41641/udp` so Tailscale can accept inbound direct connections
rather than relying on outbound-initiated NAT traversal.

**Durability requirement.** This is the second time a hand-fixed host setting has been at
risk of being lost (cf. the journald cap in
`issues/2026-07-27-firstvds-disk-space-low.md`, applied by hand and absent from
`provisioning/worker/bootstrap-worker.sh`). Since ispmanager may rewrite UFW rules again on
its next update, the fix must be **codified in the repo** — add the UFW allowances to
`provisioning/worker/bootstrap-worker.sh` so any re-bootstrap restores them, and consider a
monitoring check for pod-network reachability from each node.

### 2026-08-15 — Round 5 results: (G) DEMOTED — my UFW conclusion was wrong

Two claims in the previous section must be **retracted**. Annotating rather than deleting,
per the writing rules.

#### Retraction 1 — the "UFW BLOCK" evidence was a bad grep

```
Aug 14 09:21:25 ... SRC=51.83.10.158  ... ID=18472 PROTO=TCP SPT=57761 DPT=17852
Aug 14 12:22:36 ... SRC=51.83.10.161  ... ID=49198 PROTO=TCP SPT=57820 DPT=28472
Aug 14 15:32:23 ... SRC=85.217.149.66 ... ID=49239 PROTO=TCP SPT=52297 DPT=48472
Aug 15 02:02:33 ... SRC=193.46.255.142 ... PROTO=TCP SPT=48472 DPT=502
```

Every one of these is `IN=ens3`, `PROTO=TCP`, from a random internet scanner. My grep for
`8472` matched **substrings** in unrelated fields — `ID=18472`, `DPT=28472`, `SPT=48472`.
There are **zero** genuine `UDP 8472` blocks and **zero** `10.42.x` blocks in 30h of kernel
log. The "incontrovertible proof" produced no proof at all.

#### Retraction 2 — the UFW rules are a year old, and coexisted with a working cluster

```
-rw-r--r-- 1 root root  313 2025-08-23 12:55:00 +0300 ufw.conf
-rw-r--r-- 1 root root 1777 2025-08-23 12:58:00 +0300 user.rules
-rw-r--r-- 1 root root 1766 2025-08-23 12:59:00 +0300 user6.rules
```

`user.rules` was last written **2025-08-23** — nearly a year ago, and *before* firstvds
joined this cluster (node age 65d ⇒ ≈2026-06-11). So UFW was enabled, with exactly these
rules, throughout ~65 days of a **working** overlay. The ispmanager-rewrote-the-rules story
is therefore wrong: nothing about UFW changed at the reboot.

```
$ uptime -s
2026-08-14 05:56:44
```

The reboot at 05:56:44 on Aug 14 is confirmed, but UFW is no longer a satisfying
explanation for what changed.

**(G) demoted** from confirmed to unlikely-as-root-cause. It may still be a *latent*
misconfiguration worth fixing (a default-deny INPUT with no `tailscale0` allowance is
fragile), but it is not what broke on Aug 14.

#### The finding that reframes everything: the fault is NOT firstvds-specific

```
hetzner->local pod (nextjs 10.42.0.217): OK          <- probe method is VALID
hetzner->jellyfin http=000  (curl: (28) timed out)   <- hetzner -> senaev-media FAILS
jellyfin.senaev.com http=000 (0 bytes received)      <- user-facing, and also DOWN
senaev-media: no ufw                                 <- no firewall on that node
```

Three consequences:

1. **Ping-to-pod-IP is a valid probe.** `hetzner->10.42.0.217` (same node) succeeds, so the
   Round 2/4 100%-loss results are real evidence, not an artefact. Good.
2. **The overlay is broken between `hetzner` and `senaev-media` as well** — two nodes,
   *neither* of which runs UFW. firstvds's firewall cannot possibly explain this.
3. **`jellyfin.senaev.com` is also down** (`traefik-hetzner` → jellyfin pod on
   `senaev-media`). The blast radius is wider than reported; the user noticed only the
   `.ru` names.

So this is a **cluster-wide failure of flannel VXLAN over Tailscale**, affecting at least
the pairs firstvds→hetzner, firstvds→senaev-media, and hetzner→senaev-media, while
same-node pod traffic is fine everywhere. My entire firstvds-centric framing was too
narrow — driven by the user's report naming only `.ru` hosts, which all happen to live
behind the one node I then over-investigated.

Corroborating detail I under-weighted in Round 1: `tailscale status` showed only
**3.1 MB** tx to `senaev-media` since tailscaled started 30h ago. If `jellyfin.senaev.ru`
had been streaming through `traefik-firstvds` at any point in those 30h, that figure would
be in the gigabytes. Cross-node pod traffic has been ≈absent for the whole 30h window.

#### Revised hypotheses

**(J) Tailscale 1.98.4 regression affecting VXLAN/UDP over `tailscale0`**
All nodes likely auto-updated; firstvds runs `v1.98.4-t9e69045b2`. A data-plane change
(stateful filtering, netfilter mode, or the `relayserver` extension visible in the startup
log) could silently drop encapsulated UDP while leaving TCP conntrack paths intact. A
simultaneous cluster-wide break points to something common to all nodes, and Tailscale is
the shared dependency.
- `Signal:` all nodes on the same recent version; version bump timestamp correlates with
  the failure window; `ts-input`/`ts-forward` chains contain DROP rules matching the flow.
- `Fix:` pin/downgrade tailscaled, or adjust `--netfilter-mode` / stateful-filtering prefs.

**(K) VXLAN packets leave but never arrive (asymmetric/one-way tunnel)**
`ip -s link show flannel.1` counters will show TX incrementing with RX flat.
- `Signal:` TX grows during a ping burst, RX static, on every node.
- `Fix:` depends where they die — narrows to Tailscale vs netfilter.

**(L) Something in the k3s 1.35.2 / flannel stack broke on the Aug 14 restart**
All three nodes run `v1.35.2+k3s1` and `containerd 2.1.5-k3s1`.
- `Signal:` flannel config differs between nodes; k3s logs show flannel errors on hetzner too.
- `Fix:` depends on the specific defect.

### 2026-08-15 — Round 6: cluster-wide matrix (read-only)

Stop assuming firstvds. Measure every pair.

```bash
# --- 1. FULL pairwise pod-reachability matrix. flannel gateways = .0 of each node's subnet.
#     hetzner=10.42.0.0/24  proxmox=10.42.1.0/24  firstvds=10.42.2.0/24  media=10.42.3.0/24
for node in "hetzner:77.42.120.71" "firstvds:157.22.197.112" "media:100.103.254.98" "proxmox:100.87.199.13"; do
  name="${node%%:*}"; addr="${node##*:}"
  if [ "$addr" = "77.42.120.71" ]; then SSH="ssh root@77.42.120.71"; else SSH="ssh -J root@77.42.120.71 root@$addr"; fi
  echo "=== from $name ==="
  $SSH 'for t in 10.42.0.0 10.42.1.0 10.42.2.0 10.42.3.0; do printf "  -> %-12s " $t; ping -c1 -W2 $t >/dev/null 2>&1 && echo OK || echo FAIL; done' 2>/dev/null
done

# --- 2. Tailscale version on every node — is (J) plausible?
for a in 77.42.120.71 157.22.197.112 100.103.254.98 100.87.199.13; do
  if [ "$a" = "77.42.120.71" ]; then S="ssh root@77.42.120.71"; else S="ssh -J root@77.42.120.71 root@$a"; fi
  printf "%-16s " $a; $S 'tailscale version | head -1' 2>/dev/null
done

# --- 3. When did tailscaled last update on each node?
ssh root@77.42.120.71 'grep -iE "tailscale" /var/log/apt/history.log* 2>/dev/null | tail -5; echo "--- boot ---"; uptime -s'
ssh -J root@77.42.120.71 root@100.103.254.98 'grep -iE "tailscale" /var/log/apt/history.log* 2>/dev/null | tail -5; echo "--- boot ---"; uptime -s'

# --- 4. (K) Do VXLAN packets leave and return? Snapshot, ping burst, snapshot.
ssh -J root@77.42.120.71 root@157.22.197.112 'echo "=== BEFORE ==="; ip -s link show flannel.1 | tail -4; ping -c5 -W1 10.42.3.179 >/dev/null 2>&1; echo "=== AFTER 5 pings ==="; ip -s link show flannel.1 | tail -4'

# --- 5. Tailscale's own netfilter chains — the (J) mechanism
ssh -J root@77.42.120.71 root@157.22.197.112 'for c in ts-input ts-forward; do echo "=== $c ==="; iptables -L $c -n -v 2>/dev/null || echo "absent"; done'
ssh root@77.42.120.71 'for c in ts-input ts-forward; do echo "=== hetzner $c ==="; iptables -L $c -n -v 2>/dev/null || echo "absent"; done'

# --- 6. Correct UFW check: real drops on the tailnet interface (not a substring grep)
ssh -J root@77.42.120.71 root@157.22.197.112 'journalctl -k --since "-30h" --no-pager | grep "UFW BLOCK" | grep -E "IN=tailscale0|IN=flannel|IN=cni0|PROTO=UDP.*DPT=8472" | tail -10; echo "(empty above = UFW is not dropping overlay traffic)"'

# --- 7. MTU + flannel config on the OTHER nodes, for comparison with firstvds (1280/1230)
for a in 77.42.120.71 100.103.254.98; do
  if [ "$a" = "77.42.120.71" ]; then S="ssh root@77.42.120.71"; else S="ssh -J root@77.42.120.71 root@$a"; fi
  echo "=== $a ==="; $S 'ip -o link show tailscale0 | grep -o "mtu [0-9]*"; ip -d link show flannel.1 | sed -n "1p;3p"' 2>/dev/null
done

# --- 8. Does the control plane see flannel errors too?
ssh root@77.42.120.71 'journalctl -u k3s --since "-32h" --no-pager | grep -iE "flannel|vxlan|backend" | tail -20'
```

| Result | Confirms |
|---|---|
| every cross-node pair FAIL, every same-node OK | cluster-wide overlay failure — drop the firstvds framing entirely |
| some pairs OK (e.g. media↔proxmox on the same LAN) | fault correlates with the tailnet path, not flannel |
| all nodes on the same fresh tailscaled version, updated ≈Aug 14 | **J** — strongest lead |
| `flannel.1` TX climbs, RX flat | **K** — packets leave, never return |
| both TX and RX flat | packets never even get encapsulated |
| DROP rule in `ts-input` / `ts-forward` matching UDP/8472 or `100.64.0.0/10` | **J** mechanism identified |
| Round 6.6 empty | closes out **G** for good |

### 2026-08-15 — Round 6 results: (K) CONFIRMED — flannel.1 RX is exactly zero

#### Two commands failed for a shell reason, not an infrastructure reason

```
=== from hetzner ===
=== from firstvds ===
=== from media ===
=== from proxmox ===
77.42.120.71     157.22.197.112   100.103.254.98   100.87.199.13    === BEFORE ===
```

Both loops printed their headers but no results. Cause: **`ssh` consumes stdin**, and the
loops were pasted into the shell, so the first `ssh` swallowed the remainder of the script.
This is my bug in composing the commands, not a finding. Fix: add **`ssh -n`**. Re-run
below.

#### The decisive counter

```
=== BEFORE ===
    RX:  bytes packets errors dropped  missed   mcast
             0       0      0       0       0       0
    TX:  bytes packets errors dropped carrier collsns
       2095160   20218      0       5       0       0
=== AFTER 5 pings ===
    RX:  bytes packets errors dropped  missed   mcast
             0       0      0       0       0       0
    TX:  bytes packets errors dropped carrier collsns
       2095580   20223      0       5       0       0
```

- **TX increments by exactly 5 packets** for 5 pings — flannel *is* encapsulating and
  handing VXLAN frames to `tailscale0`. The send path is fully functional.
- **RX is `0 bytes / 0 packets`** — not low, not stalled: **zero since the interface was
  created at boot 30h ago.** Not one VXLAN frame has ever been decapsulated on firstvds.
- `RX dropped` is also 0, so the kernel is not discarding them *at* `flannel.1`; they never
  reach it.

**(K) confirmed.** The tunnel is strictly one-way: packets leave, nothing returns, and
nothing arrives unsolicited either. TX of 2.09 MB / 20 218 packets over 30h is consistent
with nothing but unanswered ARP and ping retries — no real payload has ever flowed.

This also finally explains the peculiar `time_appconnect=0.30s`-then-hang signature end to
end: every outbound SYN is encapsulated and sent, and the SYN-ACK either never comes back
or is discarded before `flannel.1`.

The remaining question is precisely one binary: **do the VXLAN frames fail to arrive over
the tailnet, or do they arrive and get dropped by netfilter before the VXLAN socket?**

#### This reopens (G) — but as a different, testable mechanism

Note the tension I need to resolve rather than hand-wave:

- Retraction 2 established the UFW *rules* are a year old, so nothing about their content
  changed on Aug 14.
- But `ufw.conf` merely records `ENABLED=yes`; it does **not** prove the service was
  *running* before the Aug 14 reboot. If UFW was stopped in the live kernel (or if flannel's
  ACCEPT rules previously sat above UFW's chains) and the reboot restored strict ordering,
  the observable result is exactly this: inbound UDP 8472 dropped, `flannel.1` RX = 0.
- Counter-evidence still standing: `hetzner->senaev-media` also fails, and **neither** runs
  UFW. If hetzner's `flannel.1` RX is also 0, UFW is definitively not the mechanism.

So the single most valuable next datum is **`ip -s link show flannel.1` on hetzner and
senaev-media**. That one command discriminates:

| hetzner `flannel.1` RX | Meaning |
|---|---|
| `0` | cluster-wide receive failure → UFW is irrelevant → **(J)** tailnet/Tailscale data plane |
| `> 0` and climbing | hetzner receives fine; only firstvds is deaf → firstvds-local drop → **(G)** revived with a concrete mechanism |

### 2026-08-15 — Round 7 (read-only) — note the `ssh -n`

```bash
# --- 1. THE decisive one: flannel.1 RX counters on the other nodes ---
ssh -n root@77.42.120.71 'echo "=== hetzner ==="; ip -s link show flannel.1 | tail -4'
ssh -n -J root@77.42.120.71 root@100.103.254.98 'echo "=== senaev-media ==="; ip -s link show flannel.1 | tail -4'
ssh -n -J root@77.42.120.71 root@100.87.199.13  'echo "=== proxmox ==="; ip -s link show flannel.1 | tail -4'

# --- 2. Re-run the pairwise matrix, now with ssh -n ---
ssh -n root@77.42.120.71 'echo "=== from hetzner ==="; for t in 10.42.0.0 10.42.1.0 10.42.2.0 10.42.3.0; do printf "  -> %-12s " $t; ping -c1 -W2 $t >/dev/null 2>&1 && echo OK || echo FAIL; done'
ssh -n -J root@77.42.120.71 root@157.22.197.112 'echo "=== from firstvds ==="; for t in 10.42.0.0 10.42.1.0 10.42.2.0 10.42.3.0; do printf "  -> %-12s " $t; ping -c1 -W2 $t >/dev/null 2>&1 && echo OK || echo FAIL; done'
ssh -n -J root@77.42.120.71 root@100.103.254.98 'echo "=== from media ==="; for t in 10.42.0.0 10.42.1.0 10.42.2.0 10.42.3.0; do printf "  -> %-12s " $t; ping -c1 -W2 $t >/dev/null 2>&1 && echo OK || echo FAIL; done'
ssh -n -J root@77.42.120.71 root@100.87.199.13 'echo "=== from proxmox ==="; for t in 10.42.0.0 10.42.1.0 10.42.2.0 10.42.3.0; do printf "  -> %-12s " $t; ping -c1 -W2 $t >/dev/null 2>&1 && echo OK || echo FAIL; done'

# --- 3. Tailscale versions, with ssh -n ---
ssh -n root@77.42.120.71 'printf "hetzner  "; tailscale version | head -1'
ssh -n -J root@77.42.120.71 root@157.22.197.112 'printf "firstvds "; tailscale version | head -1'
ssh -n -J root@77.42.120.71 root@100.103.254.98 'printf "media    "; tailscale version | head -1'
ssh -n -J root@77.42.120.71 root@100.87.199.13  'printf "proxmox  "; tailscale version | head -1'

# --- 4. Was UFW actually RUNNING before the Aug 14 reboot? Resolves the (G) tension.
ssh -n -J root@77.42.120.71 root@157.22.197.112 'systemctl show ufw -p ActiveEnterTimestamp -p UnitFileState -p ActiveState; echo "--- journal ---"; journalctl -u ufw --no-pager | tail -15'
ssh -n -J root@77.42.120.71 root@157.22.197.112 'ufw status verbose | head -12'

# --- 5. Netfilter counters: is anything actually dropping at the default-deny? ---
ssh -n -J root@77.42.120.71 root@157.22.197.112 'iptables -L INPUT -n -v | head -12; echo "=== ufw-user-input ==="; iptables -L ufw-user-input -n -v 2>/dev/null | head -12'
ssh -n -J root@77.42.120.71 root@157.22.197.112 'iptables -L ts-input -n -v 2>/dev/null | head -15 || echo "ts-input absent"'

# --- 6. Is the VXLAN socket even open and bound? ---
ssh -n -J root@77.42.120.71 root@157.22.197.112 'ss -ulnp | grep -E "8472|State" ; echo "--- nstat udp ---"; nstat -az 2>/dev/null | grep -iE "UdpInDatagrams|UdpNoPorts|UdpInErrors|UdpRcvbufErrors"'
```

| Result | Confirms | Fix direction |
|---|---|---|
| hetzner + media `flannel.1` RX = 0 | **J** cluster-wide receive failure | Tailscale data plane / version |
| hetzner RX > 0, firstvds RX = 0 | **G** revived, firstvds-local drop | UFW allowances on `tailscale0` |
| `ufw ActiveEnterTimestamp` = Aug 14 05:5x **and** hetzner RX > 0 | UFW started at the reboot and broke it | `ufw allow in on tailscale0` |
| `ufw ActiveEnterTimestamp` predates Aug 14 by weeks | UFW was already running while it worked → not the trigger | keep digging at **J** |
| `ts-input` has a DROP matching the flow | **J** mechanism identified | tailscaled prefs/version |
| `UdpNoPorts` climbing | frames arrive but no listener | VXLAN socket problem |
| all node versions identical + recently bumped | **J** strongly supported | pin/downgrade tailscaled |

### 2026-08-15 — Round 7 results: `flannel.1` EXISTS ONLY ON firstvds; (G) definitively dead

#### (G) UFW is exonerated — Tailscale accepts before UFW ever sees the packet

```
Chain INPUT (policy DROP 56 packets, 2380 bytes)
 pkts bytes target
 2413  730K KUBE-ROUTER-INPUT
 2413  730K KUBE-FIREWALL
   96  4780 KUBE-PROXY-FIREWALL
 2413  730K KUBE-NODEPORTS
   96  4780 KUBE-EXTERNAL-SERVICES
    0     0 ACCEPT      mark match 0x20000/0x20000
 2413  730K ts-input                          <-- BEFORE the ufw chains
  803  207K ufw-before-logging-input
  803  207K ufw-before-input
   56  2380 ufw-after-input
```

```
Chain ts-input (1 references)
 pkts bytes target  prot in          source
  278 59868 ACCEPT  all  lo          100.90.217.37
  532  188K ACCEPT  all  tailscale0  0.0.0.0/0        <-- accepts ALL inbound tailnet traffic
  800  275K ACCEPT  udp  *           0.0.0.0/0        udp dpt:41641
    0     0 RETURN  all  !tailscale0 100.115.92.0/23
    0     0 DROP    all  !tailscale0 100.64.0.0/10
```

`ts-input` is jumped from `INPUT` **before** any `ufw-*` chain, and its second rule
`ACCEPT all -i tailscale0` matches every inbound tailnet packet. An `ACCEPT` in a
user-defined chain terminates traversal of the whole table, so those packets are accepted
and **never reach UFW**. The counters agree: `ts-input` saw 2413 packets, `ufw-before-input`
only 803.

`ufw` `ActiveEnterTimestamp=Fri 2026-08-14 05:56:56 MSK` is simply the boot time, and
`Logging: on (low)` means genuine drops *would* have been logged — and none were.

**(G) is dead.** UFW cannot be, and was not, dropping the overlay traffic. My Round 4
"CONFIRMED" call was wrong, and the Round 5/6 attempts to revive it were also wrong. The
`ispmanager` rule that first drew my attention was a red herring throughout.

#### The actual finding

```
=== hetzner ===
Device "flannel.1" does not exist.
=== media ===
Device "flannel.1" does not exist.
```

**`flannel.1` exists only on firstvds.** Neither the control plane nor `senaev-media` has a
VXLAN interface at all.

This single fact explains every observation collected across seven rounds:

| Observation | Explanation |
|---|---|
| firstvds `flannel.1` RX = 0 since boot | no peer has a `flannel.1` to *send* VXLAN to it |
| firstvds `flannel.1` TX increments normally | firstvds still encapsulates and sends into the void |
| firstvds → hetzner pod FAIL | hetzner cannot decapsulate what it receives |
| firstvds → media pod FAIL | same |
| hetzner → media pod FAIL | hetzner has no interface to encapsulate *with* |
| hetzner → own pod OK | intra-node traffic uses `cni0`, no overlay needed |
| `jellyfin.senaev.com` down too | `traefik-hetzner` → jellyfin on media is also cross-node |
| tailnet ping / TCP 6443 fine | node-level traffic never touches flannel |

So the cluster is split into isolated per-node pod islands. firstvds is the only node still
*configured* for VXLAN, which is why it looked like the anomaly — when in fact it is the
only node still behaving as originally provisioned.

**This inverts the investigation.** The question is no longer "what broke on firstvds" but
**"why did `flannel.1` disappear from hetzner and senaev-media?"** — and whether firstvds is
now the odd one out after a backend change elsewhere.

Recall `bootstrap-control-plane.sh` / `bootstrap-worker.sh` pass `--flannel-iface=tailscale0`
but do **not** pin `--flannel-backend`, so the backend comes from the k3s default for the
installed version. A k3s upgrade that changed that default, or a partial re-bootstrap of
hetzner/media, would produce exactly this split-brain.

#### Revised hypotheses

**(M) Backend split-brain — hetzner/media moved off `vxlan`, firstvds did not**
The other nodes now run a different flannel backend (`host-gw`, `wireguard-native`) or a
different CNI, leaving firstvds alone on VXLAN and mutually unintelligible with everyone.
- `Signal:` hetzner/media have `flannel-wg`/`wg0` or plain routes instead of `flannel.1`;
  their node annotations show a `backend-type` other than `vxlan`.
- `Fix:` make the backend uniform, pinned explicitly in the bootstrap scripts.

**(N) Flannel failed to start on hetzner/media**
The interface is missing because flannel errored out, not because the backend changed.
- `Signal:` `journalctl -u k3s` on hetzner shows flannel init failures; annotations still
  say `vxlan`; routes to remote pod CIDRs missing entirely.
- `Fix:` restart k3s on the affected nodes; investigate the underlying error.

**(O) hetzner/media never had `flannel.1` and use routed pod networking**
Possible if pod CIDRs are reachable via Tailscale subnet routes.
- `Signal:` hetzner has explicit routes for `10.42.2.0/24`/`10.42.3.0/24` via `tailscale0`.
- `Fix:` then firstvds is the misconfigured node and should be re-bootstrapped to match.

### 2026-08-15 — Round 8 (read-only): characterise the other nodes

```bash
# --- 1. What interfaces and pod routes DO hetzner and media have? ---
ssh -n root@77.42.120.71 'echo "=== hetzner links ==="; ip -br link; echo "=== hetzner pod routes ==="; ip route | grep -E "10\.42\.|flannel|cni|tailscale"'
ssh -n -J root@77.42.120.71 root@100.103.254.98 'echo "=== media links ==="; ip -br link; echo "=== media pod routes ==="; ip route | grep -E "10\.42\.|flannel|cni|tailscale"'

# --- 2. What backend does each node ADVERTISE? (firstvds said vxlan / public-ip 100.90.217.37)
ssh -n root@77.42.120.71 'for n in hetzner firstvds senaev-media proxmox; do echo "--- $n ---"; kubectl get node $n -o jsonpath="{.metadata.annotations}" | tr "," "\n" | grep -i flannel; echo; done'

# --- 3. Does flannel's runtime state exist on the other nodes? ---
ssh -n root@77.42.120.71 'echo "=== hetzner subnet.env ==="; cat /run/flannel/subnet.env 2>/dev/null || echo MISSING'
ssh -n -J root@77.42.120.71 root@100.103.254.98 'echo "=== media subnet.env ==="; cat /run/flannel/subnet.env 2>/dev/null || echo MISSING'

# --- 4. (N) Did flannel error out on the control plane? ---
ssh -n root@77.42.120.71 'journalctl -u k3s --since "-40h" --no-pager | grep -iE "flannel|vxlan|backend|cni" | tail -40'

# --- 5. Is the k3s server started with an explicit backend? Compare with the repo. ---
ssh -n root@77.42.120.71 'cat /etc/systemd/system/k3s.service | grep -A30 ExecStart'
ssh -n -J root@77.42.120.71 root@100.103.254.98 'cat /etc/systemd/system/k3s-agent.service | grep -A20 ExecStart'

# --- 6. When did the control plane last restart / upgrade k3s? ---
ssh -n root@77.42.120.71 'systemctl show k3s -p ActiveEnterTimestamp; uptime -s; k3s --version; ls -la --time-style=full-iso /usr/local/bin/k3s'

# --- 7. Re-run the pairwise matrix properly (ssh -n) for a complete picture ---
ssh -n root@77.42.120.71 'echo "=== from hetzner ==="; for t in 10.42.0.0 10.42.1.0 10.42.2.0 10.42.3.0; do printf "  -> %-12s " $t; ping -c1 -W2 $t >/dev/null 2>&1 && echo OK || echo FAIL; done'
ssh -n -J root@77.42.120.71 root@100.103.254.98 'echo "=== from media ==="; for t in 10.42.0.0 10.42.1.0 10.42.2.0 10.42.3.0; do printf "  -> %-12s " $t; ping -c1 -W2 $t >/dev/null 2>&1 && echo OK || echo FAIL; done'
```

| Result | Confirms |
|---|---|
| hetzner/media have `flannel-wg` or `wg0` | **M** backend changed to wireguard-native |
| hetzner/media have neither, but routes via `tailscale0` for `10.42.x` | **O** routed pod networking |
| hetzner/media have neither and **no** routes to remote pod CIDRs | **N** flannel is simply broken/absent there |
| hetzner annotations say `backend-type: vxlan` but no interface | **N** flannel failed to start |
| `k3s.service` ExecStart has an explicit `--flannel-backend=...` differing from firstvds | **M** |
| `/run/flannel/subnet.env` MISSING on hetzner | flannel never initialised there |

### 2026-08-15 — Round 8 results: ROOT CAUSE — flannel stuck in "external interface not found"

#### The error, repeating every 30s on the control plane

```
Aug 15 10:17:54 hetzner k3s[3138153]: I0815 vxlan_network.go:167] external interface  not found, retrying in 30s
Aug 15 10:18:24 hetzner k3s[3138153]: I0815 vxlan_network.go:167] external interface  not found, retrying in 30s
...continuous, every 30s, through 10:37:24...
```

Note the **empty interface name** between "interface" and "not found" — flannel is looking
for an interface it cannot name, and retrying forever. While stuck in this loop it never
creates `flannel.1`.

#### Every node still *believes* it is running VXLAN

```
--- hetzner ---       backend-type: vxlan   public-ip: 100.120.76.115   --flannel-iface, --flannel-external-ip
--- firstvds ---      backend-type: vxlan   public-ip: 100.90.217.37    --flannel-iface
--- senaev-media ---  backend-type: vxlan   public-ip: 100.103.254.98   --flannel-iface
--- proxmox ---       backend-type: vxlan   public-ip: 100.87.199.13    --flannel-iface
```

All four annotations say `vxlan`, so **(M) backend split-brain is killed** — nobody
switched backends. **(O) is killed** too: neither hetzner nor media has any route to a
remote pod CIDR.

```
=== hetzner routes ===  10.42.0.0/24 dev cni0 proto kernel scope link src 10.42.0.1
=== media routes ===    10.42.3.0/24 dev cni0 proto kernel scope link src 10.42.3.1
```

Only the node's **own** subnet. No `10.42.x via flannel.1`, no `flannel.1`, no `flannel-wg`
in `ip -br link` — just `cni0`, `tailscale0`, and veths. Each node is an island that can
only talk to its own pods.

**(N) confirmed:** flannel did not change backend and did not get reconfigured — it simply
**failed to start its VXLAN network** and has been retrying ever since.

#### Why: `tailscale0` vanished under a running flannel

The control plane's k3s has **not restarted in over two months**:

```
ActiveEnterTimestamp=Sat 2026-05-30 09:04:11 UTC
uptime -s: 2026-05-08 14:38:14
k3s version v1.35.2+k3s1 (13563feb)
```

```
ExecStart=/usr/local/bin/k3s server \
    '--disable' 'traefik' \
    '--advertise-address=100.120.76.115' \
    '--node-external-ip=100.120.76.115' \
    '--flannel-iface=tailscale0' \
    '--flannel-external-ip' \
    ...
```

Flannel is pinned to `tailscale0`. If that interface disappears while k3s is running,
flannel loses its VXLAN parent device and enters exactly this retry loop — and because
k3s has not been restarted since May 30, it has never had a chance to recover.

**The repository already documents this precise failure mode**
(`terraform/bootstrap-server.sh.tpl:95-96`):

> ```
> # k3s flannel is pinned to tailscale0; Tailscale auto-updates restart tailscaled,
> # briefly remove tailscale0, and can leave flannel without cross-node pod routes.
> echo "👉 [bootstrap-server] Disabling Tailscale auto-updates"
> tailscale set --auto-update=false
> ```

So this is a **known, previously-encountered hazard** with a mitigation that was applied
only at provisioning time, on the Terraform-managed control plane. Something restarted
`tailscaled` afterwards anyway, and flannel never came back.

`--flannel-external-ip` (present on hetzner, absent on every worker — visible in the
annotations) makes flannel resolve an *external* interface for the backend; when
`tailscale0` is missing, that lookup returns the empty name seen in the log.

#### Why firstvds looked different — and was actually the healthy one

firstvds **rebooted** on Aug 14 05:56:44. `tailscaled` came up at 05:56:57, and
`k3s-agent` at 05:57:22 — *after* `tailscale0` existed. Flannel therefore initialised
correctly and created `flannel.1` with a perfect config. It has been faithfully
encapsulating and transmitting into a void ever since (TX 2.09 MB, RX 0), because none of
its peers has a VXLAN interface to answer with.

The reboot 30h ago did not break anything. It is simply when the **user-visible symptom**
appeared, because before the reboot firstvds was presumably in the same broken-flannel
state as its peers, and after it, the asymmetry became total.

#### Corrected timeline — this is much older than 30 hours

`iperf3-agent-firstvds` has been in `CrashLoopBackOff` for **367 restarts over 43 days**.
Per `provisioning/helm/vm-stack/values.yaml:143-153`, the iperf3 monitor tests exactly the
**cross-node** pairs `hetzner↔firstvds` and `senaev-media→firstvds`. That is the canary for
this exact fault, and it has been red since roughly **2026-07-03** — dismissed in Round 1 as
"long-standing, unrelated". It was neither.

Cross-node pod networking has therefore likely been broken for **~6 weeks**, not 30 hours.
Corroborating: `tailscale status` tx to `senaev-media` was only 3.1 MB.

#### Hypothesis ledger, final

| ID | Hypothesis | Verdict |
|---|---|---|
| A | Tailscale down / IP changed | refuted (Round 1) |
| A1 | Total VXLAN blackhole | confirmed as *symptom*, not cause |
| A2 | MTU blackhole | refuted (56-byte ping fails) |
| B | k3s agent wedged | refuted |
| C | Disk full recurrence | refuted (47%) |
| D | Backend pods down | refuted |
| E | Xray pod down | refuted |
| F | Tailscale ACL blocking UDP 8472 | refuted (filter is allow-all) |
| G | UFW dropping VXLAN | **wrongly confirmed, then refuted** — `ts-input` accepts first |
| H | tailscaled version regression | refuted |
| I | Underlay dead | refuted |
| J | Tailscale data-plane regression | refuted |
| K | One-way tunnel (RX=0) | confirmed as *symptom* |
| L | k3s/flannel stack defect | superseded |
| M | Backend split-brain | refuted (all annotations `vxlan`) |
| N | **Flannel failed to start on hetzner/media** | **CONFIRMED — root cause** |
| O | Routed pod networking | refuted (no remote routes) |

## Resolution plan (WRITE operations — require explicit user consent)

Localisation is complete, so writes are now justified. Order matters: bring the control
plane back first, verify, then the workers.

**Step 0 — one read-only check first: how long has this really been broken?**
```bash
ssh -n root@77.42.120.71 'journalctl -u k3s --no-pager | grep -m1 "external interface"; echo "--- count ---"; journalctl -u k3s --no-pager | grep -c "external interface"'
ssh -n -J root@77.42.120.71 root@100.103.254.98 'journalctl -u k3s-agent --no-pager | grep -m1 "external interface"'
ssh -n -J root@77.42.120.71 root@100.87.199.13 'ip -br link | grep -E "flannel|tailscale"'
```

**Step 1 — confirm `tailscale0` is present everywhere, then restart k3s on the control plane**
```bash
ssh -n root@77.42.120.71 'ip -br link show tailscale0 && tailscale ip -4'
ssh -n root@77.42.120.71 'systemctl restart k3s'
sleep 60
ssh -n root@77.42.120.71 'ip -d link show flannel.1 | head -3; ip route | grep 10.42'
```
Expected: `flannel.1` appears with `local 100.120.76.115 dev tailscale0`, plus routes to
`10.42.1.0/24`, `10.42.2.0/24`, `10.42.3.0/24`.

**Step 2 — restart the agents so they rebuild against a working control plane**
```bash
ssh -n -J root@77.42.120.71 root@100.103.254.98 'systemctl restart k3s-agent'
ssh -n -J root@77.42.120.71 root@100.87.199.13  'systemctl restart k3s-agent'
ssh -n -J root@77.42.120.71 root@157.22.197.112 'systemctl restart k3s-agent'
sleep 60
```

**Step 3 — verify the overlay pairwise**
```bash
ssh -n root@77.42.120.71 'echo "=== from hetzner ==="; for t in 10.42.1.0 10.42.2.0 10.42.3.0; do printf "  -> %-12s " $t; ping -c1 -W2 $t >/dev/null 2>&1 && echo OK || echo FAIL; done'
ssh -n -J root@77.42.120.71 root@157.22.197.112 'echo "=== from firstvds ==="; for t in 10.42.0.0 10.42.1.0 10.42.3.0; do printf "  -> %-12s " $t; ping -c1 -W2 $t >/dev/null 2>&1 && echo OK || echo FAIL; done'
ssh -n -J root@77.42.120.71 root@157.22.197.112 'ip -s link show flannel.1 | tail -4'   # RX must now be > 0
```

**Step 4 — user-facing verification** (see `## Verification` above)

### Durable fixes to codify (separate PR, after service is restored)

1. **Workers never disable Tailscale auto-update.** `tailscale set --auto-update=false`
   exists only in `terraform/bootstrap-server.sh.tpl` (control plane). Add it to
   `provisioning/worker/bootstrap-worker.sh`. firstvds's prefs still show `update=check`.
2. **Make k3s survive `tailscale0` disappearing.** A systemd drop-in with
   `After=tailscaled.service` / `Requires=tailscaled.service` does not help a *running*
   k3s. Consider a watchdog that restarts k3s when `flannel.1` is absent while
   `tailscale0` is present, or move off `--flannel-iface` to a backend that tolerates
   parent-interface churn.
3. **Reconsider `--flannel-external-ip`** on the control plane — it is what produces the
   empty-interface lookup, and no worker sets it. The asymmetry is unexplained and likely
   unintentional.
4. **Alert on the canary that was already there.** `iperf3-agent-firstvds` had been
   `CrashLoopBackOff` for 43 days with no alert. Add a VMRule for cross-node pod
   reachability and for any pod in `CrashLoopBackOff` beyond N minutes. This outage was
   detectable ~6 weeks before a human noticed.
5. **Note for future investigations:** `jellyfin.senaev.com` was also down and unreported.
   Do not scope an investigation to the hostnames the user happens to name.

### 2026-08-15 — Step 0 results: the "external interface" error is a RED HERRING

```
May 29 23:33:03 hetzner k3s[2210]: I0529 vxlan_network.go:167] external interface  not found, retrying in 1s
18965          <- total occurrences
```

```
=== proxmox ===
tailscale0       UNKNOWN        <POINTOPOINT,MULTICAST,NOARP,UP,LOWER_UP>
```

Two corrections to the previous section.

**1. The error predates the outage by ~2.5 months and survived a k3s restart.**
First occurrence **May 29 23:33:03** under PID `2210`. But `k3s` has
`ActiveEnterTimestamp=Sat 2026-05-30 09:04:11 UTC` and now runs as PID `3138153` — so k3s
*was* restarted on May 30, and the message **continues on the current instance**. 18 965
occurrences.

Therefore the `external interface  not found` loop **cannot be the thing that broke pod
networking**, because the cluster demonstrably worked for weeks while it was logging. It is
almost certainly a benign retry loop belonging to the `--flannel-external-ip` feature
(which only hetzner sets), running in parallel with a perfectly functional main VXLAN
device. My Round 8 reading of it as "the root cause" over-weighted a loud log line — the
same mistake as the UFW grep, in a different costume.

**2. `proxmox` has no `flannel.1` either.** Three of four nodes lack the interface;
firstvds is the sole exception.

#### The actual mechanism: VXLAN is a *child* of `tailscale0`

`flannel.1` is created as `vxlan id 1 ... dev tailscale0` — a VXLAN device whose **parent
link is `tailscale0`**. When a link is deleted, the kernel automatically destroys every
child device bound to it. So:

1. `tailscaled` restarts (Tailscale auto-update) on hetzner / media / proxmox.
2. `tailscale0` is removed and recreated.
3. **The kernel destroys `flannel.1` along with its parent.**
4. Flannel — already running inside a long-lived k3s process — never notices and never
   recreates it. Cross-node pod networking dies silently.
5. firstvds escaped only because it **rebooted** on Aug 14, restarting k3s-agent *after*
   `tailscale0` existed, so its flannel re-initialised cleanly.

This is exactly the hazard already written down in
`terraform/bootstrap-server.sh.tpl:95-96` ("Tailscale auto-updates restart tailscaled,
briefly remove tailscale0, and can leave flannel without cross-node pod routes") — the
mitigation was applied once at provisioning and evidently did not hold.

It also means **the fix is still `systemctl restart k3s`** — flannel will recreate
`flannel.1` now that `tailscale0` is present — but the *reason* is parent-link destruction,
not the misleading log line. And it predicts that restarting will **not** silence the
`external interface` message, which is fine and expected.

#### Confirming command (read-only) — when did tailscaled last restart on each node?

```bash
ssh -n root@77.42.120.71 'printf "hetzner  tailscaled: "; systemctl show tailscaled -p ActiveEnterTimestamp --value; printf "hetzner  k3s:        "; systemctl show k3s -p ActiveEnterTimestamp --value; tailscale version | head -1; tailscale debug prefs 2>/dev/null | grep -i autoupdate'
ssh -n -J root@77.42.120.71 root@100.103.254.98 'printf "media    tailscaled: "; systemctl show tailscaled -p ActiveEnterTimestamp --value; printf "media    k3s-agent:  "; systemctl show k3s-agent -p ActiveEnterTimestamp --value; tailscale version | head -1'
ssh -n -J root@77.42.120.71 root@100.87.199.13 'printf "proxmox  tailscaled: "; systemctl show tailscaled -p ActiveEnterTimestamp --value; printf "proxmox  k3s-agent:  "; systemctl show k3s-agent -p ActiveEnterTimestamp --value; tailscale version | head -1'
```

Prediction if the mechanism above is right: on hetzner, media, and proxmox
`tailscaled` started **after** `k3s`/`k3s-agent` — and roughly 43 days ago, matching the
`iperf3-agent` crash-loop age. On firstvds the order is reversed
(`tailscaled` 05:56:57 → `k3s-agent` 05:57:22), which is why it alone has `flannel.1`.

If instead `tailscaled` predates k3s on those nodes, the parent-link theory is wrong and
the investigation must continue before restarting anything.

### 2026-08-15 — Mechanism CONFIRMED, and the outage precisely dated

```
hetzner  tailscaled: Sun 2026-08-09 06:15:59 UTC     k3s:       Sat 2026-05-30 09:04:11 UTC
media    tailscaled: Sun 2026-08-09 06:16:01 UTC     k3s-agent: Tue 2026-06-30 18:18:35 UTC
proxmox  tailscaled: Sun 2026-08-09 06:15:57 UTC     k3s-agent: Tue 2026-06-30 18:17:50 UTC
```

On all three broken nodes `tailscaled` restarted **after** k3s — exactly as predicted. And
all three restarted **within 4 seconds of each other**, at
**Sun 2026-08-09 06:15:57–06:16:01 UTC**: a coordinated Tailscale **auto-update** rolling
across the tailnet.

Version confirms it: hetzner/media/proxmox are on **1.102.2**, while firstvds is still on
**1.98.4** — firstvds did not take that update, which is precisely why it kept its
`flannel.1` while every peer lost theirs.

**Root cause, final:**

> At **2026-08-09 06:16 UTC** a Tailscale auto-update restarted `tailscaled` on hetzner,
> senaev-media, and proxmox. Removing `tailscale0` caused the kernel to destroy `flannel.1`,
> which is a VXLAN child device of that parent link. The long-running k3s processes never
> recreated it, so all cross-node pod networking stopped. firstvds skipped the update, kept
> its `flannel.1`, and has been transmitting VXLAN into a void ever since.

#### Corrected outage window — 6 days, not 30 hours and not 6 weeks

- **Broken since:** 2026-08-09 06:16 UTC.
- **Not** 30 hours (the Aug 14 firstvds reboot was incidental — it merely re-created
  firstvds's `flannel.1`, changing nothing user-visible).
- **Not** ~6 weeks. My previous estimate from the `iperf3-agent` "43d age" was wrong: 43d is
  the **pod's** age, not the failure duration. 367 restarts over the 6 days since Aug 9
  (~61/day) matches `CrashLoopBackOff` backoff behaviour well. Retracting that claim.

Affected the whole time: `senaev.ru`, `jellyfin.senaev.ru`, all other `*.senaev.ru` hosts,
**and** `jellyfin.senaev.com` — i.e. every route whose backend pod is not on the same node
as its Traefik.

#### Note on the failed mitigation

`terraform/bootstrap-server.sh.tpl:97` runs `tailscale set --auto-update=false` at
provisioning, specifically to prevent this. hetzner nonetheless updated to 1.102.2 on
Aug 9, so the setting was either never applied, later reset, or overridden by a tailnet-wide
auto-update policy. This needs checking as part of the durable fix.

## Resolution

Fix confirmed and ready. Restart k3s so flannel recreates `flannel.1` against the
now-present `tailscale0`. Control plane first, then the two workers. firstvds needs no
restart — it is the only healthy node — but its flannel will re-learn peer VTEP MACs
automatically from the API server.

```bash
# 1. Control plane
ssh -n root@77.42.120.71 'systemctl restart k3s'
sleep 60
ssh -n root@77.42.120.71 'ip -d link show flannel.1 | sed -n "1p;3p"; ip route | grep 10.42'

# 2. Workers that lost the interface
ssh -n -J root@77.42.120.71 root@100.103.254.98 'systemctl restart k3s-agent'
ssh -n -J root@77.42.120.71 root@100.87.199.13  'systemctl restart k3s-agent'
sleep 60

# 3. Verify the overlay pairwise
ssh -n root@77.42.120.71 'echo "=== from hetzner ==="; for t in 10.42.1.0 10.42.2.0 10.42.3.0; do printf "  -> %-12s " $t; ping -c1 -W2 $t >/dev/null 2>&1 && echo OK || echo FAIL; done'
ssh -n -J root@77.42.120.71 root@157.22.197.112 'echo "=== from firstvds ==="; for t in 10.42.0.0 10.42.1.0 10.42.3.0; do printf "  -> %-12s " $t; ping -c1 -W2 $t >/dev/null 2>&1 && echo OK || echo FAIL; done; echo "--- RX must now be > 0 ---"; ip -s link show flannel.1 | tail -4'

# 4. User-facing
curl -sS -m 20 -o /dev/null -w "jellyfin.senaev.ru  http=%{http_code} total=%{time_total}\n" https://jellyfin.senaev.ru/
curl -sS -m 20 -o /dev/null -w "senaev.ru           http=%{http_code} total=%{time_total}\n" https://senaev.ru/
curl -sS -m 20 -o /dev/null -w "jellyfin.senaev.com http=%{http_code} total=%{time_total}\n" https://jellyfin.senaev.com/
```

Expected: `flannel.1` reappears on hetzner as `vxlan id 1 ... local 100.120.76.115 dev
tailscale0` with routes to the three remote subnets; all pairwise pings OK; firstvds
`flannel.1` RX finally non-zero; all three URLs return 200/302 in well under 2s.

The `external interface  not found` message will **continue** after the restart. That is
expected — it is unrelated to this fault (see Step 0 results).

### Durable fixes (follow-up PR, after service is restored)

1. **Stop Tailscale auto-updates from destroying `flannel.1`.** Verify why
   `tailscale set --auto-update=false` did not hold on hetzner (it updated anyway on
   Aug 9), and add the same call to `provisioning/worker/bootstrap-worker.sh`, which has no
   equivalent step. Check for a tailnet-wide auto-update policy in the admin console.
2. **Make recovery automatic.** Even with auto-update disabled, any `tailscaled` restart
   re-arms this trap. Add a systemd drop-in or watchdog that restarts k3s/k3s-agent when
   `flannel.1` is missing while `tailscale0` is present. `After=tailscaled.service` alone
   does **not** help a running process.
3. **Alert on cross-node pod reachability.** `iperf3-agent-firstvds` is exactly the right
   canary and it was `CrashLoopBackOff` for 6 days with no alert. Add a VMRule for it and a
   generic `CrashLoopBackOff > 15m` rule. This outage was machine-detectable within minutes.
4. **Review `--flannel-external-ip`** on the control plane: only hetzner sets it, it
   produces 18 965 log lines of `external interface  not found`, and no worker needs it.
   Removing it would cut real noise that actively misled this investigation.
5. **Process note.** Two loud-but-irrelevant signals (the UFW `ispmanager` rule, the
   `external interface` loop) each produced a wrong "confirmed" call. Both were caught only
   by asking "was this also true while the system worked?" — check that *before* declaring a
   root cause, not after.

### Fix applied — 2026-08-15

```bash
ssh -n root@77.42.120.71 'systemctl restart k3s'
ssh -n -J root@77.42.120.71 root@100.103.254.98 'systemctl restart k3s-agent'
ssh -n -J root@77.42.120.71 root@100.87.199.13  'systemctl restart k3s-agent'
```

`flannel.1` immediately reappeared on the control plane with the correct parent and all
three remote routes:

```
3: flannel.1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1230 ... state UNKNOWN
    vxlan id 1 local 100.120.76.115 dev tailscale0 srcport 0 0 dstport 8472 ttl auto ageing 300 nolearning
10.42.0.0/24 dev cni0 proto kernel scope link src 10.42.0.1
10.42.1.0/24 via 10.42.1.0 dev flannel.1 onlink
10.42.2.0/24 via 10.42.2.0 dev flannel.1 onlink
10.42.3.0/24 via 10.42.3.0 dev flannel.1 onlink
```

Overlay verified in both directions:

```
=== from hetzner ===          === from firstvds ===
  -> 10.42.1.0    OK            -> 10.42.0.0    OK
  -> 10.42.2.0    OK            -> 10.42.1.0    OK
  -> 10.42.3.0    OK            -> 10.42.3.0    OK
```

And the decisive counter — firstvds `flannel.1` **RX is finally non-zero** after 6 days at
exactly 0:

```
RX:  bytes packets    12019      61        (was 0 / 0)
TX:  bytes packets  2127670   20526
```

User-facing:

```
jellyfin.senaev.ru  http=302 total=0.800501
senaev.ru           http=200 total=6.288581
jellyfin.senaev.com http=302 total=0.728285
```

All three serve again. Service restored.

## Resolution

**Root cause.** At **2026-08-09 06:15:57–06:16:01 UTC** a Tailscale auto-update restarted
`tailscaled` on hetzner, senaev-media, and proxmox (1.98.4 → 1.102.2). `flannel.1` is a
VXLAN device whose **parent link is `tailscale0`**; when the parent was removed the kernel
destroyed it, and the long-running k3s processes never recreated it. All cross-node pod
networking stopped. firstvds skipped that update, kept its `flannel.1`, and spent six days
encapsulating VXLAN into a void (TX 2.1 MB, RX 0).

**Why it looked like a firstvds problem.** Every `*.senaev.ru` backend lives on a different
node from `traefik-firstvds`, so firstvds appeared uniquely broken. In fact it was the only
*correctly configured* node. `jellyfin.senaev.com` was equally broken and simply unreported.

**Fix.** `systemctl restart k3s` on the control plane, `systemctl restart k3s-agent` on
senaev-media and proxmox. firstvds needed nothing.

**Outage window.** 2026-08-09 06:16 UTC → 2026-08-15 ~10:45 UTC, about **6 days**.

**Detection gap.** The purpose-built canary (`iperf3-agent-firstvds`, which probes exactly
the cross-node pairs) was in `CrashLoopBackOff` the entire time with no alert. The outage
was machine-detectable within minutes of Aug 9 06:16.

### Open follow-up — `senaev.ru` TLS handshake takes 10–15s

Post-fix measurements from the laptop:

```
senaev.ru           http=200 tls=10.387596 total=10.702208
senaev.ru           http=200 tls=15.385748 total=16.124549
senaev.ru           http=200 tls=15.430497 total=15.957775
jellyfin.senaev.ru  http=302 total=0.386140
webdav.senaev.ru    http=401 total=0.869072
senaev.com          http=200 total=0.638846
```

Every other host is sub-second. Only `senaev.ru` is slow, and the delay is entirely in
`time_appconnect` (the TLS handshake), not in the response. `senaev.ru` is the one host that
goes through the Xray Reality passthrough
(`IngressRouteTCP` → `xray-vpn-firstvds:443` → `traefik-firstvds...svc.cluster.local:8443`),
so it is the only path that must resolve a `cluster.local` name mid-handshake.

Prime suspect is the pre-existing resolver misconfiguration first seen in Round 1:

```
E0815 dns.go:154] "Nameserver limits exceeded" err="... the applied nameserver line is: 2a01:230:1:1::229 2a01:230:1:1::230 188.120.247.2"
```

Two **IPv6** resolvers are tried before the working IPv4 one. At the usual 5s per-resolver
timeout that yields ≈10s (two failures) or ≈15s (three attempts) — matching the observed
10.4s / 15.4s almost exactly. Not caused by this incident, but now the dominant source of
latency on the main domain.

Suggested next steps (separate investigation): confirm which pod DNS policy picks up the
host `/etc/resolv.conf` on firstvds, drop the unreachable IPv6 nameservers (or reorder so
`188.120.247.2` is first), and re-measure. Note the FirstVDS panel may rewrite
`/etc/resolv.conf`, so the fix likely needs to be pinned.

### Durable fix implemented — 2026-08-15 (provisioning, not yet deployed)

Chosen approach: **declare the dependency at provisioning time**, rather than run a
polling watchdog that heals after the fact.

New file **`provisioning/common/bootstrap-node-networking.sh`**, idempotent, installs:

1. A systemd drop-in `/etc/systemd/system/<unit>.service.d/10-tailscale-binding.conf`:
   ```ini
   [Unit]
   BindsTo=sys-subsystem-net-devices-tailscale0.device
   After=sys-subsystem-net-devices-tailscale0.device
   ```
   systemd now stops k3s when `tailscale0` disappears, instead of leaving it running with a
   destroyed `flannel.1`.
2. A udev rule `/etc/udev/rules.d/99-tailscale-k3s.rules`:
   ```
   ACTION=="add|move", SUBSYSTEM=="net", KERNEL=="tailscale0", TAG+="systemd", ENV{SYSTEMD_WANTS}+="<unit>.service"
   ```
   `BindsTo=` stops a unit but never restarts it, so this half is what makes the pair
   recover by itself when tailscaled returns.
3. `tailscale set --auto-update=false`, and it **prints the effective `AutoUpdate` prefs** —
   because the same setting was already applied to hetzner at provisioning yet hetzner still
   updated on Aug 9, which points at a tailnet-wide policy override that needs checking in
   the admin console.

**Safety interlock.** If `sys-subsystem-net-devices-tailscale0.device` is not active, a
`BindsTo` + `After` drop-in would make k3s **permanently unstartable**. The script therefore
verifies the device unit first, removes any previously installed drop-in if the unit has
gone missing, and exits non-zero rather than installing a trap. It also verifies afterwards
that `systemctl show <unit> -p BindsTo` really contains the device, so a typo cannot pass as
success, and reports whether `flannel.1` is currently present.

Wiring, so `make cluster` converges on the **existing** cluster rather than only on a fresh
one:

- `provisioning/control-plane/bootstrap-control-plane.sh` — called **outside** the
  `if ! command -v k3s` guard. An already-installed k3s is exactly the case that needs it.
- `provisioning/worker/bootstrap-worker.sh` — called on **both** paths: the
  `check-worker.sh` "Worker is OK" early exit, and after a fresh agent install.

Deliberately **not** added to `check-worker.sh`: a failed check there triggers
`k3s-agent-uninstall.sh` and a full node reinstall. A missing binding warrants a config
refresh, not a rebuild — wiring it there would turn every tailscaled restart into a
cluster-wide reinstall storm.

Deliberately **not** implemented: the polling watchdog + systemd timer. Superseded by the
declarative binding above.

Still outstanding from the earlier list: alerting (item 3) and the `--flannel-external-ip`
review (item 4).
