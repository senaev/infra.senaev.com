# 2026-06-10 — Debug VPN connection (firstvds entry point)

- [ ] Make the firstvds VPN entry point work from Russian ISPs

> **This file is the working log for the investigation.** All findings, command outputs, screenshots, hypotheses confirmed/refuted, and the eventual fix must be appended to this file as we go — so the whole debug session lives in one place and is searchable later.
>
> Format: append new dated sections under `## Findings` as work proceeds. Don't rewrite earlier sections — annotate them.

## Symptom

- VPN clients connecting via the **firstvds** entry point lose internet.
- Clients connecting via **hetzner** or **vultr** entry points work normally.
- Websites `senaev.com` and `senaev.ru` themselves respond — so node, Traefik, DNS, and Reality routing are fine on firstvds at the SNI/host level.

## Context (architecture refresher)

From `AGENTS.VPN.md` + `provisioning/helm/senaev-com/`: each VPS pod runs Xray with a Reality inbound on :443 and a socks inbound on :1080. The :443 socket is shared with Traefik via SNI — if the connection is Reality (correct uTLS + UUID), Xray handles it; otherwise it's forwarded raw to Traefik. That's exactly why `senaev.ru` still works while VPN doesn't.

firstvds (`values.yaml:26–38`) exposes **3 client profiles** to end users:

| profile | outbound | description |
|---|---|---|
| `firstvds → freedom` (uuid:4) | local `freedom` | direct exit from firstvds — does NOT chain |
| `firstvds → vultr` (uuid:6) | socks → `xray-vpn-vultr:1080` | hops to vultr first |
| `firstvds → hetzner` (uuid:1) | socks → `xray-vpn-hetzner:1080` | hops to hetzner first |

Inter-pod socks traffic rides Kubernetes Service DNS → flannel → **`tailscale0`** (see `provisioning/worker/bootstrap-worker.sh:88` `--flannel-iface=tailscale0`), so all inter-VPS hops go over Tailscale.

## The 3-profile diagnostic (cheap, decisive)

Switching the client through each firstvds profile narrows the problem to one bucket:

- ✅ `firstvds → freedom` works, ❌ both chained → **chain transport broken**: firstvds pod can't reach other pods' :1080. Most likely Tailscale or flannel on firstvds (see Hypothesis A).
- ❌ ALL three broken → **firstvds pod's outbound is broken at the pod level** (DNS in pod / iptables / CNI on the host). Reality decrypt still works because that's pure local; egress is what's dead.
- ❌ only one of the chained ones (`→ vultr` OR `→ hetzner`) → **destination-specific**: that destination's pod or its egress is the culprit, not firstvds.
- ✅ all three from a fresh client, but user still reports failure → likely **client-side** (DNS leak / split tunnel / iOS Hiddify profile cache).

## Hypotheses, ranked

1. **(A) Tailscale degraded on firstvds.** Matches symptoms exactly: host :443 still answers (local), but flannel-over-`tailscale0` can't reach hetzner/vultr pod IPs → chained socks fails. Cross-check signal already in repo: `provisioning/helm/vm-stack/values.yaml:139–188` (iperf3Monitor probes `firstvds↔hetzner`, `firstvds↔vultr` continuously) and `:119–137` (smokeping). **If those have been red for hours, you have your answer.**
2. **(B) xray-vpn-vultr or xray-vpn-hetzner pod not Ready / not serving :1080.** Cheap to check via `kubectl get pods -n senaev-com -l app=xray-vpn-vultr`. If both look healthy from the cluster but unreachable from firstvds → back to (A).
3. **(C) Service / EndpointSlice for the chained pods missing on firstvds's view.** kube-proxy or kube-dns issue on the firstvds node specifically.
4. **(D) Xray config regression on firstvds.** Bad ConfigMap render (e.g. wrong socks outbound address) after a recent secret reload. `kubectl logs deploy/xray-vpn-firstvds` will show socks connect errors with the exact target — `_helpers.tpl:79` has `"loglevel": "debug"` so the log is verbose.
5. **(E) Provider-side egress block at firstvds.** Less likely (websites work, so inbound is fine), but firstvds is the only node not managed by Terraform (`terraform/server.tf` is Hetzner-only) — its firewall is configured out-of-repo. If the provider added an egress rule blocking the Tailscale port (UDP 41641 default) recently, exactly this would happen.

## Collaboration model

You drive — Claude does NOT run kubectl/SSH itself. For each step Claude gives you:
- the exact command to run, OR
- the exact Grafana panel to screenshot

You execute it, paste the output (or drop the screenshot into the chat), and Claude reads it and tells you the next step. Goal is for *you* to build the mental model, not to hand off the investigation.

This means every command Claude proposes must be:
- self-contained (no env vars Claude assumed exist)
- safe (read-only — no writes, no restarts, no config changes until we've localised the fault)
- copy-pasteable

**Logging discipline:** every command Claude proposes and every output you paste back should also be appended to this file under `## Findings` with a short interpretation. The chat conversation is ephemeral; this file is the source of truth.

## Starting point: jump to kubectl (chosen)

Skipping the 30-sec client test and telemetry glance — going straight to log + connectivity probes from the cluster.

### Round 1 commands (copy-paste, paste output back)

```bash
# A. firstvds xray logs (debug-level is on — last 200 lines)
kubectl logs -n senaev-com deploy/xray-vpn-firstvds --tail=200

# B. hetzner xray logs — to see if chained socks connections from firstvds even arrive
kubectl logs -n senaev-com deploy/xray-vpn-hetzner --tail=200

# C. Pod-to-pod connectivity from firstvds to its two chain destinations
kubectl exec -n senaev-com deploy/xray-vpn-firstvds -- /bin/sh -c \
  'nc -zv xray-vpn-hetzner 1080 2>&1; nc -zv xray-vpn-vultr 1080 2>&1'

# D. DNS resolution from firstvds pod (separate failure mode from connectivity)
kubectl exec -n senaev-com deploy/xray-vpn-firstvds -- /bin/sh -c \
  'getent hosts xray-vpn-hetzner; getent hosts xray-vpn-vultr'

# E. Endpoint health of the chain destination Services
kubectl get endpointslices -n senaev-com \
  -l 'kubernetes.io/service-name in (xray-vpn-hetzner,xray-vpn-vultr)' \
  -o wide

# F. Pod & node status (sanity)
kubectl get pods -n senaev-com -o wide \
  | grep -E 'xray-vpn-(firstvds|hetzner|vultr)'
kubectl get nodes -o wide
```

What each command rules in / out:

| Command | Result that points to | Hypothesis |
|---|---|---|
| **A** xray logs on firstvds | socks-out connect errors → chain dead at network layer; "no inbound matched" → Reality side / wrong UUID; "connection refused" → destination pod down | A, B, or D |
| **B** xray logs on hetzner | inbound accepted from firstvds pod IP → chain is working & problem is downstream of hetzner; no entries → packets never arrive → Tailscale/flannel | A vs. B |
| **C** `nc -zv` | success → chain transport fine, look at xray config; refused → destination port down; "no route to host" / hang → Tailscale | A vs. B/D |
| **D** DNS lookups | NXDOMAIN → kube-dns or service missing | C |
| **E** EndpointSlices | empty / NotReady → destination pod has no ready endpoints | B |
| **F** pods/nodes | NotReady node → cluster-level firstvds issue | A |

### What Claude does with your paste-back

Claude reads the output and either:
1. Names the failed component + the next narrowing command, OR
2. If everything in Round 1 looks healthy, proposes Round 2 (likely SSH-based commands for the firstvds host: `tailscale status`, `journalctl -u tailscaled -n 100 --no-pager`).

## Optional parallel signal — Grafana

If you want a second independent data point while running Round 1, screenshot these vm-stack panels (defined in `provisioning/helm/vm-stack/values.yaml:119–188`):

- **iperf3Monitor** — pairwise throughput; look for `firstvds↔hetzner` and `firstvds↔vultr` going flat / red recently
- **smokeping** — latency/loss to firstvds

A red iperf3 panel for the firstvds pairs would corroborate Hypothesis A (Tailscale/transport) before Claude even reads the kubectl output. A green iperf3 panel almost rules A out and pushes weight toward B/D.

## Stop conditions before any fix

Claude will NOT propose any write/restart/config-change command until Round 1 (and optionally Round 2) localises the fault to a specific component. Once localised, Claude will propose the fix command and explain what it does — same drive-yourself model — before you run it.

---

## Findings

### 2026-06-10 22:05 — Round 1 results

**Command C — nc -zv from firstvds pod:**
```
xray-vpn-hetzner (10.43.129.100:1080) open
xray-vpn-vultr (10.43.161.184:1080) open
```
Interpretation: ✅ Transport layer healthy — both chain destinations are reachable on :1080.

**Command D — DNS from firstvds pod:**
```
10.43.129.100   xray-vpn-hetzner.senaev-com.svc.cluster.local ...
10.43.161.184   xray-vpn-vultr.senaev-com.svc.cluster.local ...
```
Interpretation: ✅ kube-dns is resolving correctly from firstvds node.

**Command E — EndpointSlices:**
```
xray-vpn-hetzner-mgdjd   IPv4  443,1080  10.42.0.179  41h
xray-vpn-vultr-p799w     IPv4  443,1080  10.42.6.24   41h
```
Interpretation: ✅ Both services have healthy endpoints.

**Command F — pod/node status:**
```
xray-vpn-firstvds  1/1 Running  firstvds (10.42.4.19)
xray-vpn-hetzner   1/1 Running  hetzner  (10.42.0.179)
xray-vpn-vultr     1/1 Running  vultr    (10.42.6.24)
All nodes: Ready
```
Interpretation: ✅ All nodes and pods healthy.

**Command A — firstvds xray logs (key lines):**
```
[Info] received request for tcp:courier.sandbox.push.apple.com:5223
[Info] app/dispatcher: taking detour [outbound-hetzner]
[Info] transport/internet/tcp: dialing TCP to tcp:xray-vpn-hetzner:1080
from 10.42.4.10:35190 accepted ... [inbound-xray-vpn-firstvds -> outbound-hetzner] email: user-socks
```
Interpretation: ✅ The chain is working — firstvds accepted a real client connection, correctly routed it to outbound-hetzner, and hetzner's :1080 was dialed. The "user-socks" email confirms the right UUID/profile was matched.

**Command B — hetzner xray logs (key lines):**
```
# Connection FROM firstvds (10.42.4.19) arriving at hetzner socks inbound:
from tcp:10.42.4.19:55374 accepted tcp:courier.sandbox.push.apple.com:5223 [inbound-socks -> outbound-freedom]
proxy/freedom: connection opened to tcp:courier.sandbox.push.apple.com:5223, local endpoint 10.42.0.179:55186, remote endpoint 17.188.168.210:5223

# FAILURE — IPv6 destination:
app/proxyman/outbound: failed to process outbound traffic >
  proxy/freedom: failed to open connection to tcp:e8a540b6-..fbcdn.net:443 >
  common/retry: [dial tcp [2a03:2880:f13b:82:face:b00c:0:79f4]:443: connect: network is unreachable]
```
Interpretation: ✅ Chain arriving at hetzner works for IPv4 destinations (Apple, Instagram CDN on `157.240.205.63`). ❌ **IPv6 destinations fail with `network is unreachable`** — `2a03:2880:...` is a Meta/Facebook IPv6 address.

---

### Conclusion of Round 1

**Hypotheses A–D refuted.** Transport, DNS, endpoints, and config are all fine.

**Root cause: IPv6 egress is broken in the hetzner pod.** The hetzner node's pod network (`flannel` over `tailscale0`) has no IPv6 default route. When DNS returns an AAAA record (IPv6) for a destination, `outbound-freedom` on hetzner gets `network is unreachable` and the connection fails. This affects ALL traffic that exits via hetzner's freedom outbound, including:
- The `firstvds → hetzner` profile (uuid:1)  
- Hetzner's own direct freedom profile (uuid:5)

This explains "no internet from firstvds entry point": modern apps (iOS especially) prefer IPv6 — Instagram, Facebook, iCloud, and many others return AAAA records. With IPv6 broken, those requests fail; the VPN client sees repeated failures and reports no connectivity.

The reason "hetzner entry point works": the two hetzner profiles in the subscription exit through **firstvds** (`hetzner → firstvds`, uuid:2) and **senaev-media** (`hetzner → senaev-media`, uuid:3), not through hetzner's own freedom. If the user tested those, they exit via different nodes that may have IPv6 working.

---

### 2026-06-10 — Round 2 (confirm IPv6 scope)

Run these to confirm IPv6 is broken in hetzner pod and check other nodes:

```bash
# Check IPv6 routes in each xray pod
kubectl exec -n senaev-com deploy/xray-vpn-hetzner -- ip -6 route show 2>&1
kubectl exec -n senaev-com deploy/xray-vpn-vultr  -- ip -6 route show 2>&1
kubectl exec -n senaev-com deploy/xray-vpn-firstvds -- ip -6 route show 2>&1
```

Expected: hetzner shows no default `via` route for IPv6. If vultr and firstvds also show empty/no-default, the fix should apply to all freedom outbounds.

---

### Proposed fix (pending Round 2 confirmation)

Add `"domainStrategy": "UseIPv4"` to the freedom outbound in the xray config template. This tells xray to always resolve hostnames to IPv4 before connecting via freedom, skipping the broken IPv6 path entirely.

**Where to change:** `provisioning/helm/senaev-com/templates/_helpers.tpl` — the block that emits `"protocol": "freedom"` for the `outbound-freedom` tag. Add:
```json
"settings": {
  "domainStrategy": "UseIPv4"
}
```

This is a low-risk change: it only affects freedom outbounds (direct internet exit), not the socks chain hops. Sites that are IPv6-only would still fail, but there are very few of those, and they're already failing. Dual-stack sites (the vast majority) would fall back to IPv4 and work.

**Note:** this is a config change that triggers a rolling restart (pod-reloader watches the ConfigMap). Plan for a brief ~10-second restart per affected pod.

---

## User requests to claude (don't forget to do)

 TODO: Check IPv6 availability on every node pod:                                                                                                                       ▎ for pod in xray-vpn-firstvds xray-vpn-hetzner xray-vpn-vultr xray-vpn-senaev-media; do
      ▎   echo "=== $pod ==="; kubectl exec -n senaev-com deploy/$pod -- ip -6 route show 2>&1; done

## Resolution

**Root cause:** All xray pods (firstvds, hetzner, vultr, senaev-media) run on k3s with flannel over `tailscale0`. This overlay is IPv4-only — no IPv6 routes exist in any pod. When a destination domain returns an AAAA record, xray's `outbound-freedom` gets `network is unreachable` immediately and retries the same IPv6 address multiple times without falling back to IPv4. Modern apps (iOS, Instagram, Meta services, iCloud) heavily prefer IPv6, so they fail consistently, producing a "no internet" experience in the VPN client.

**Fix:** Added `"domainStrategy": "UseIPv4"` to the `outbound-freedom` block in `provisioning/helm/senaev-com/templates/_helpers.tpl`. This tells xray to always resolve hostnames to IPv4 before connecting, skipping the broken IPv6 path entirely. Applied globally to all instances since all nodes have the same IPv6 gap.

IPv6-only sites remain inaccessible, but they were already failing and are extremely rare on the public internet.

**Deploy:**
```bash
helm upgrade senaev-com provisioning/helm/senaev-com -n senaev-com
```
Pod-reloader triggers a rolling restart of all xray-vpn pods on ConfigMap change.

**Result: VPN still didn't appear to work after deploying the fix.** `domainStrategy: UseIPv4` only covers one half of the IPv6 problem — see Round 3 below for additional improvements. However, see **Final Resolution** at the bottom — the reported "no internet" was a client-side issue.

---

### 2026-06-10 — Round 3 plan

#### Step 1 — Verify the fix is actually running in the pods

The config flow is: `_helpers.tpl` → ConfigMap (`<name>-config-template`) → initContainer renders secrets → `/etc/xray/config.json` in pod. Verify both the ConfigMap and the live config were updated:

```bash
# Check pod restart times — confirm pods restarted after helm upgrade
kubectl get pods -n senaev-com -o wide | grep xray-vpn

# Verify the rendered config inside the running pod has domainStrategy
kubectl exec -n senaev-com deploy/xray-vpn-firstvds -- \
  grep -A3 '"freedom"' /etc/xray/config.json

kubectl exec -n senaev-com deploy/xray-vpn-hetzner -- \
  grep -A3 '"freedom"' /etc/xray/config.json
```

Expected: `"domainStrategy": "UseIPv4"` appears in the output. If not — the pods didn't restart, or the ConfigMap wasn't picked up.

#### Step 2 — Test raw internet access from each pod

This is the most direct test: can the xray pod reach the internet at all, independent of xray routing?

```bash
# IPv4 internet from firstvds pod
kubectl exec -n senaev-com deploy/xray-vpn-firstvds -- \
  wget -q -O- http://ipv4.icanhazip.com 2>&1

# IPv4 internet from hetzner pod
kubectl exec -n senaev-com deploy/xray-vpn-hetzner -- \
  wget -q -O- http://ipv4.icanhazip.com 2>&1

# IPv4 internet from vultr pod
kubectl exec -n senaev-com deploy/xray-vpn-vultr -- \
  wget -q -O- http://ipv4.icanhazip.com 2>&1
```

Expected: each returns the node's public IP. If a pod hangs or errors — that node has no outbound internet at the pod level (likely a missing iptables MASQUERADE rule), and `outbound-freedom` on that node will never work regardless of xray config. This is a separate, more fundamental issue.

#### Step 3 — Fresh xray logs after the fix (filter out debug noise)

```bash
# firstvds — last 5 min, without XtlsPadding/Reshape spam
kubectl logs -n senaev-com deploy/xray-vpn-firstvds --since=10m 2>&1 \
  | grep -v XtlsPadding | grep -v ReshapeMultiBuffer

# hetzner — same
kubectl logs -n senaev-com deploy/xray-vpn-hetzner --since=10m 2>&1 \
  | grep -v XtlsPadding | grep -v ReshapeMultiBuffer
```

Look for: new error patterns different from the IPv6 errors, connection resets, "failed to process", "no matching rule".

---

### 2026-06-10 — Round 3 findings: actual root cause identified

**Vultr xray logs at 22:50:14** reveal the real problem:

```
proxy/freedom: connection opened to udp:[2001:4860:4860::8888]:53, local endpoint [::]:55415
failed > write udp [::]:55415->[2001:4860:4860::8888]:53: sendto: network is unreachable
```

The phone's VPN client (HiddifyNext on Android) sends DNS queries **directly to Google's IPv6 DNS server** `2001:4860:4860::8888` by IP address. When this arrives at xray's socks inbound, it's already an IPv6 address — not a domain name — so `domainStrategy: UseIPv4` has no effect. xray tries to connect `[::]:xxxxx → 2001:4860:4860::8888:53` on the pod, which has no IPv6 routes → `network is unreachable` immediately.

The VPN client's DNS fails → apps can't resolve hostnames → "no internet" perception, even though IPv4 TCP connections work fine (the same 22:50 session shows YouTube streaming, hh.ru, Google, Apple all succeeding).

**Why this didn't surface with the domainStrategy fix:** `domainStrategy: UseIPv4` only applies when xray resolves a domain name for the freedom outbound. It does nothing when the client sends an explicit IPv6 IP.

**Fix: add a blackhole routing rule for all IPv6 destinations.** When xray receives a connection to any IPv6 address (`::/0`), it returns an immediate reject instead of trying and hanging. The client immediately falls back to IPv4 DNS (8.8.8.8) and everything works.

Changes made to `provisioning/helm/senaev-com/templates/_helpers.tpl`:
- Added `outbound-blackhole` (protocol: blackhole)
- Added routing rule: `ip: ["::/0"] → outbound-blackhole` (placed BEFORE the socks→freedom rule)

Deploy:
```bash
helm upgrade senaev-com provisioning/helm/senaev-com -n senaev-com
```

---

---

## Narrowed symptom (key finding — updated)

**firstvds entry profiles work on WeWork WiFi and Vodafone. They fail on most other carriers and networks, including friends on different ISPs.**

- `senaev.ru` website loads fine everywhere (basic HTTPS not blocked)
- Hetzner entry profiles (senaev.com) work everywhere
- firstvds entry profiles (senaev.ru) fail on most ISPs; only WeWork + Vodafone pass

This is an **ISP-level DPI/filtering** problem. Most ISPs block or disrupt the Reality VPN tunnel to firstvds specifically. Vodafone and WeWork happen to not apply this filtering (different DPI vendors, policies, or bypass rules).

### Why the website loads but VPN doesn't

Both use port 443. The difference:
- Regular HTTPS (Traefik) has a standard TLS fingerprint — passes DPI cleanly
- VLESS+Reality uses uTLS to mimic Chrome, but the connection has traffic patterns (sustained throughput, no Host header, no HTTP payload) that modern DPI systems recognise as a proxy tunnel even through the TLS camouflage

### Why hetzner works but firstvds doesn't

Two likely reasons (possibly both):
1. **IP geography**: firstvds is a Russian hosting provider. Many ISPs apply more aggressive DPI to Russian datacenter IP ranges, especially post-2022. Hetzner (Finnish/EU IP) gets lighter scrutiny.
2. **IP reputation**: firstvds's specific IP may be on DPI rule lists as a known proxy host.

### Immediate workaround

The hetzner entry profiles (🇷🇺 3. hetzner → firstvds and 🇷🇺 4. hetzner → senaev-media) work universally. Users on blocked carriers should use those. The firstvds entry profiles are only useful for Vodafone/WeWork users who want a Russian exit IP.

### DPI theory — tests and conclusions

**Test 1 (2026-06-10):** Tailed `xray-vpn-firstvds` logs while connecting from a blocked carrier — complete silence. No `authentication failed`, no `from … accepted`. TCP is being dropped before it reaches xray.

**Test 2 (2026-06-10):** Changed `realityServerName` to `www.microsoft.com`, deployed, tested on blocked carrier — still blocked. Reverted to `senaev.ru`.

**Key logical deduction:** Both the website (`senaev.ru`) and the VPN use the same IP, same port (443), same SNI. The website works on all carriers. Therefore the ISP is NOT filtering on IP, port, or SNI. The DPI must be detecting **post-handshake traffic behavior**: sustained bidirectional throughput, no HTTP structure, large frames — patterns characteristic of a proxy tunnel, invisible to TLS inspection but visible to behavioral analysis. Modern TSPU-class DPI boxes (deployed widely by Russian ISPs) do exactly this.

**Option A is ruled out** — SNI change has no effect on behavioral DPI.

### Fix options (in order of effort)

**~~Option A — Change `realityServerName` for firstvds~~** (ruled out — see DPI tests above)

The current SNI is `senaev.ru`. Changing it to a high-traffic trusted domain (e.g. `www.microsoft.com`, `www.apple.com`) changes what the connection *looks like* to DPI. DPI that pattern-matches on suspicious Russian domains would stop triggering. Note: sophisticated DPI that checks SNI↔IP consistency would still flag it, but simpler DPI wouldn't.

Change in `values.yaml`:
```yaml
- name: xray-vpn-firstvds
  realityServerName: www.microsoft.com   # was: senaev.ru
```

The `dest` (Traefik fallback) still serves senaev.ru — only the SNI the VPN accepts changes. Clients' subscription links would need updating.

**Option B — Add a transport layer** (medium effort)

Switch firstvds from raw TCP to XHTTP (HTTP/1.1 wrapped) or WebSocket transport. This makes the traffic look like ordinary HTTP/S web traffic to DPI, not a proxy connection pattern. Harder to detect than raw TCP Reality.

**Option C — Move the entry point to a non-Russian IP** (architectural)

Add a new entry point on a non-Russian VPS (another Hetzner node, a Vultr node, etc.). firstvds would then only be used as an *exit* node (the chain hop), not as the inbound that faces the internet directly. This is the most reliable long-term fix.

### Next debugging step — confirm Reality auth is failing

While on a blocked carrier, try connecting to a firstvds profile while tailing the logs:
```bash
kubectl logs -n senaev-com deploy/xray-vpn-firstvds -f 2>&1 \
  | grep -v XtlsPadding | grep -v ReshapeMultiBuffer
```

- `REALITY: processed invalid connection … authentication failed` → Reality handshake is being disrupted by the ISP's DPI (the most likely case)
- Complete silence (no log entry at all) → connection is being dropped before it even reaches xray — ISP is blocking at TCP level
- `from ... accepted ...` followed by nothing → Reality auth succeeded but data transfer is disrupted

### Improvements made during investigation (kept, correct regardless)

1. **`"domainStrategy": "UseIPv4"` on all freedom outbounds** — prevents xray from attempting IPv6 connections when resolving domain names.
2. **IPv6 blackhole routing rule (`::/0 → outbound-blackhole`)** — fast-rejects IPv6 destinations so clients fall back to IPv4 immediately.

---

#### What each result means

| Result | Interpretation | Next step |
|---|---|---|
| `domainStrategy` not in config | Fix not applied — pods didn't restart or reloader missed it | Force restart: `kubectl rollout restart -n senaev-com deploy/xray-vpn-firstvds` etc. |
| wget from firstvds pod hangs/fails | firstvds pod has no internet egress — iptables NAT broken on the host | SSH to firstvds, check `iptables -t nat -L POSTROUTING -n` for MASQUERADE rule on pod CIDR `10.42.4.0/24` |
| wget from hetzner pod hangs/fails | Same, on hetzner | Same check on hetzner host |
| wget all work, logs show new errors | xray-level config issue | Read fresh logs and investigate specific error |
| wget all work, logs look clean, client fails | Problem is client-side or in how client connects (profile selection, UUID mismatch, client DNS) | Need to know which specific profile the user is testing |

---

### 2026-06-10 — firstvds full OS reinstall (no IP change) — did not help

The firstvds VPS was completely reinstalled from scratch (fresh OS, no software pre-installed) while keeping the **same IP address**. After reinstall, the problem persisted identically — firstvds entry profiles still blocked on most ISPs, Hetzner entry profiles still work everywhere.

**Interpretation:** This conclusively rules out any server-side software, configuration, or OS state as the cause. The IP address is the only constant across the reinstall, and the blocking behavior follows the IP. Combined with the earlier observation that the *website* (`senaev.ru`) loads fine on the same IP+port, this further confirms the blocking is **behavioral DPI** reacting to the VPN traffic pattern, not an IP/port blacklist. The ISP's DPI classifies firstvds's IP range (Russian hosting) as higher-risk and applies stricter traffic analysis — enough to disrupt Reality tunnels while passing normal HTTPS.

**Rules out:** any hypothesis involving firewall misconfiguration, leftover xray state, OS-level routing issues, or anything fixable by a server-side change that doesn't involve the IP or transport-layer traffic pattern.

**Remaining options:** Option B (XHTTP/WebSocket transport obfuscation) or Option C (move entry point to a non-Russian IP). A bare IP change at firstvds (substituting a new IP from the same Russian provider) is worth trying but may not help if the entire provider's ASN is under aggressive DPI.

---

### 2026-06-11 — Option B (XHTTP transport) — did not help, reverted

XHTTP transport was deployed on firstvds (`transport: xhttp` in `values.yaml`, subscription links switched to `type=xhttp&path=/api/v1/data`). DPI blocking on affected carriers persisted — no improvement observed.

**Interpretation:** XHTTP wraps xray traffic in HTTP/1.1 framing, but TSPU-class DPI can still identify the Reality+VLESS pattern through connection behavior (timing, payload sizes, lack of HTTP semantics beyond headers). The carrier DPI is more sophisticated than SNI or transport-type inspection.

**~~Option B — XHTTP transport~~** (ruled out — no effect on behavioral DPI)

Reverted: removed `transport: xhttp` from firstvds instance, subscription links reverted to `type=tcp&flow=xtls-rprx-vision`. Also added "💄 5. hetzner → freedom" as a new direct-exit profile on hetzner (no chain hop, exits from hetzner IP).

**Only remaining option: Option C — move entry point to a non-Russian IP.** firstvds will remain as a chain *exit* only.

---

### 2026-06-23 — Further DPI confirmation with Hetzner freedom outbound

A new test was conducted to provide even stronger evidence for the ISP-level DPI hypothesis.

**Test setup:**
- A new VPN profile was created: a direct "freedom" outbound on the **Hetzner** node (`senaev.com`). This means traffic exits directly from the Hetzner (EU) IP address, with no chaining to Russia.

**Test results:**
- **From Madrid, Spain (EU):** The connection to the Hetzner freedom profile works perfectly.
- **From Russia:** The connection to the same Hetzner freedom profile fails.

**Interpretation:**
This is conclusive proof of geographically-targeted, behavioral DPI by Russian ISPs.
- The server configuration is correct (it works from outside Russia).
- The Hetzner IP itself is not blocked (the website `senaev.com` on the same IP works fine from Russia).
- The failure only occurs for VPN traffic patterns originating from Russian ISPs.

This test isolates the variable to the user's geographical location and the nature of the traffic, confirming that Russian ISPs are specifically disrupting the VLESS+Reality protocol, regardless of the server's IP location (EU or Russian).

### Next Steps

The VLESS+Reality protocol, even with uTLS camouflage and various transport wrappers (TCP, XHTTP), has proven insufficient to bypass the advanced behavioral DPI deployed by Russian state ISPs.

The next phase of this investigation will be to research and prototype alternative protocols known for their resistance to DPI, such as:
- **Shadowsocks (with v2ray-plugin)**
- **Hysteria2**
- **Tuic**

The goal is to find a protocol that can successfully establish a stable tunnel from within Russia, which can then be used as the transport for chaining traffic to the desired exit nodes.

---

### 2026-06-25 — Working VLESS Configuration from Russia

A contact in Russia has provided a configuration that is successfully bypassing ISP-level DPI. This provides a strong data point on what currently works.

**Working Configuration Details:**

*   **Protocol:** VLESS over TCP
*   **Flow:** `XTLS-RPRX-Vision`
*   **TLS:** `Reality`
*   **uTLS Fingerprint:** `Firefox`
*   **Reality Server Name (SNI):** `sun6-21.userapi.com`

**Analysis:**

The most significant parameter is the Reality `serverName` (SNI) being set to `sun6-21.userapi.com`. This domain is part of the infrastructure for **VKontakte (VK)**, Russia's largest social network.

This strongly suggests that Russian DPI systems are configured to **not** interfere with traffic that masquerades as connections to major, domestic web services. The sheer volume of legitimate traffic to VK makes it an ideal camouflage target. The risk of accidentally blocking a critical national service is too high for the ISP, so the DPI gives a pass to anything that looks like VK traffic.

This is a more specific and actionable finding than simply changing protocols. The VLESS+Reality+Vision stack is confirmed to work, provided the SNI is chosen carefully.

**Updated Next Steps:**

Instead of switching protocols, the next immediate action should be to test this SNI-based circumvention strategy.

1.  **Test:** Change the `realityServerName` on the `xray-vpn-hetzner` instance to `sun6-21.userapi.com`.
2.  **Verify:** Ask a user in Russia to test the `hetzner → freedom` profile.

If this test is successful, it confirms that the choice of a high-traffic, domestic SNI is the key to bypassing DPI in this environment. The `firstvds` (Russian IP) entry point may even become viable again using this strategy, as the geographical IP block appears to be secondary to the behavioral DPI.

---

### 2026-06-25 — SNI swap test: `sun6-21.userapi.com` — did not help

**What was tested:**

Changed `realityServerName` for `xray-vpn-firstvds` from `senaev.ru` to `sun6-21.userapi.com` and deployed. VPN clients connecting to `firstvds` were updated with the new SNI. Tested from Russia.

**Result:** VPN did not start working. Reverted to `senaev.ru`.

**Side effect discovered:**

Changing `realityServerName` also breaks `https://senaev.ru` (the website). The Traefik `IngressRouteTCP` uses the same value as the SNI match (`HostSNI(realityServerName)`), and the website's fallback ingress only listens on the `websecure-xray` (port 8443) entrypoint — not on the normal `websecure` (port 443). So when the SNI match no longer covers `senaev.ru`, browser traffic to the site has no valid route.

This means **any future attempt to change the SNI on `xray-vpn-firstvds` must also add a separate ingress entry for `senaev.ru` on the `websecure` entrypoint** to keep the website alive.

**Interpretation:**

The VK (`userapi.com`) SNI hypothesis was wrong — or at minimum insufficient on its own. The working configuration seen from a contact in Russia may depend on factors beyond the SNI alone: the specific server (its IP history, ASN, provider), the exact Xray build version, or additional transport parameters not captured from the screenshots.

**Revised hypotheses — what to investigate next:**

1. **(F) The working config's server IP/ASN is the key differentiator.** The contact's server may be hosted on an ASN not yet targeted by Russian DPI lists (e.g. a smaller cloud provider or residential IP). Our firstvds is on a Russian provider IP, which may be on a stricter inspection path regardless of SNI.

2. **(G) The uTLS fingerprint matters, not just the SNI.** The working config uses `fp=firefox`; our configs use `fp=chrome`. Some DPI implementations specifically look for Chrome fingerprint + Reality as a signature. Switching to `firefox` fingerprint alone (without changing SNI) is worth testing — it does not break the website.

3. **(H) A dedicated entry point with a non-Russian IP + VK SNI is needed.** The combination of: (a) non-Russian ASN IP, (b) VK SNI, (c) Firefox uTLS fingerprint may all be required together. The `xray-vpn-hetzner` instance (Finnish IP, `senaev.com`) is the cleanest candidate to test this combination, as changing its SNI does not break any website.

**Recommended next step — lowest risk, highest signal:**

Change only the `fp` parameter (uTLS fingerprint) on the existing firstvds profiles from `chrome` to `firefox`. This requires no server-side changes (the fingerprint is client-side only in the subscription link), does not alter the SNI, and therefore does not break the website. If this alone unblocks connectivity from Russia, hypothesis G is confirmed.

---

### 2026-07-30 — SNI swap to the Jellyfin subdomains (deployed, awaiting test)

New attempt at the SNI strategy, this time using a subdomain that **already hosts a real,
high-bandwidth service on the same IP** — Jellyfin. The reasoning: the earlier
`sun6-21.userapi.com` attempt used a domain that does *not* resolve to our IP, so any DPI
doing SNI↔IP consistency checking would immediately flag the mismatch. A Jellyfin subdomain
avoids that entirely, and media streaming is a natural cover for sustained high-throughput
TLS — the exact traffic pattern that behavioral DPI was flagging as "proxy tunnel".

**DNS confirms SNI↔IP consistency (the key improvement over the VK attempt):**

```
senaev.ru                  157.22.197.112
jellyfin.senaev.ru         157.22.197.112   <- same IP as firstvds
senaev.com                 77.42.120.71
jellyfin.senaev.com        77.42.120.71     <- same IP as hetzner
```

**Changes made in `provisioning/helm/senaev-com/values.yaml`:**

| instance | `realityServerName` | was |
|---|---|---|
| `xray-vpn-firstvds` | `jellyfin.senaev.ru` | `senaev.ru` |
| `xray-vpn-hetzner` | `jellyfin.senaev.com` | `senaev.com` |

Subscription links: both the connect address **and** the `sni=` parameter were changed to
the Jellyfin host, so that the DNS lookup and the TLS SNI are the same name:

```
vless://{XRAY_USER_UUID:4}@jellyfin.senaev.ru:443?...&sni=jellyfin.senaev.ru    (firstvds)
vless://{XRAY_USER_UUID:2}@jellyfin.senaev.com:443?...&sni=jellyfin.senaev.com  (hetzner)
```

An earlier iteration kept the connect address as `@senaev.ru:443` while only changing
`sni=`. That works functionally (both names resolve to the same IP, and `@host` is used
only to pick the dial address), but it leaves a correlatable anomaly: the client resolves
one name via DNS and then presents a *different* name in the TLS SNI. Aligning them
produces a fully coherent session — resolve `jellyfin.senaev.ru`, connect to that IP,
present SNI `jellyfin.senaev.ru`, then move a lot of data — which is exactly what a real
Jellyfin client does. Note this makes the VPN entry depend on the `jellyfin.*` DNS record
staying pointed at the same node as the root domain.

**Ingress rework — this is the part the 2026-06-25 attempt got wrong.**

`realityServerName` drives two things at once:
1. the Reality `serverNames` (`_helpers.tpl:29`), and
2. the Traefik passthrough match `HostSNI(...)` (`xray-vpn-ingress-route-tcp.yaml:16`).

So whichever host is the Reality SNI has its `:443` claimed by the VPN passthrough, and its
real website must instead be served on the `websecure-xray` (8443) entrypoint — because
that is where xray forwards non-Reality traffic (`_helpers.tpl:28`,
`dest: traefik-<vps>:8443`). Accordingly the two `*-xray-fallback` ingress entries were
repointed from the root domains to the Jellyfin hosts, and the root domains moved back to
the normal `web,websecure` entrypoints:

| ingress entry | host | entrypoints |
|---|---|---|
| `senaev-ru-xray-fallback` | `jellyfin.senaev.ru` | `websecure-xray` |
| `senaev-ru-root` (new) | `senaev.ru` | `web,websecure` |
| `senaev-com-xray-fallback` | `jellyfin.senaev.com` | `websecure-xray` |
| `senaev-com-root` (new) | `senaev.com` | `web,websecure` |

`jellyfin.senaev.ru` / `jellyfin.senaev.com` were removed from the `senaev-*-direct`
entries so they are no longer bound to plain `websecure` (which would collide with the
passthrough). ACME is unaffected: the HTTP-01 challenge is served globally on the `web`
entrypoint (`traefik/templates/traefik.yaml:43`), so routers on `websecure-xray` still
renew — this is already how the root domains worked before this change.

**Verified by `helm template` before deploy:**

```
"serverNames": [ "jellyfin.senaev.ru" ]        (xray-vpn-firstvds)
"serverNames": [ "jellyfin.senaev.com" ]       (xray-vpn-hetzner)
- match: HostSNI(`jellyfin.senaev.ru`)   -> xray-vpn-firstvds
- match: HostSNI(`jellyfin.senaev.com`)  -> xray-vpn-hetzner
senaev-com-senaev-ru-xray-fallback   websecure-xray   jellyfin.senaev.ru
senaev-com-senaev-ru-root            web,websecure    senaev.ru
senaev-com-senaev-com-xray-fallback  websecure-xray   jellyfin.senaev.com
senaev-com-senaev-com-root           web,websecure    senaev.com
```

**Deploy:**
```bash
helm upgrade senaev-com provisioning/helm/senaev-com -n senaev-com \
  -f provisioning/helm/common-values.yaml
```

**Verification checklist (all four must pass):**
1. `https://senaev.ru` and `https://senaev.com` still load (root domains on plain :443).
2. `https://jellyfin.senaev.ru` and `https://jellyfin.senaev.com` still load — this
   proves the Reality `dest` fallback correctly reaches Jellyfin via `websecure-xray`.
3. Re-import the subscription in the client (both the address and `sni=` changed — old
   profiles will fail).
4. Test a firstvds profile from a previously-blocked Russian ISP.

**Result: did not help.** Deployed as commit `a8e83d9`. VPN still blocked from Russia.

The ingress rework itself was correct — verified from outside after deploy:

```
https://senaev.ru             HTTP 200  tls=0
https://senaev.com            HTTP 200  tls=0
https://jellyfin.senaev.ru    HTTP 302  tls=0   <- via xray dest fallback -> websecure-xray
https://jellyfin.senaev.com   HTTP 302  tls=0   <- via xray dest fallback -> websecure-xray
```

So the SNI moved cleanly and the Reality fallback path works; the DPI simply does not care
about the SNI. **This is now the third distinct SNI to fail** (`www.microsoft.com`,
`sun6-21.userapi.com`, `jellyfin.senaev.*`) — and critically, the third one had *correct
SNI↔IP consistency*, which was the stated reason the VK attempt was thought to have failed.
That reasoning is now refuted: SNI-based camouflage is not the lever here, regardless of
whether the name legitimately resolves to the server.

---

## Elimination table (state as of 2026-07-30)

| Variable | Tested | Result |
|---|---|---|
| Server software / OS state | full reinstall, same IP | no change |
| SNI value | microsoft.com, VK, jellyfin.senaev.* | no change (×3) |
| SNI↔IP consistency | jellyfin.senaev.* resolves to the node | no change |
| Transport | raw TCP, XHTTP | no change (×2) |
| Server geography / IP | firstvds (RU), hetzner (FI) | both fail from RU |
| Client geography | Madrid vs Russia | works from EU, fails from RU |
| Plain HTTPS on same IP:443 | continuously | always works |
| uTLS fingerprint | **not tested** — still `fp=chrome` | — |
| TLS ClientHello fragmentation | **not tested** | — |
| A never-used IP | **not tested** | — |
| Non-Reality protocol | **not tested** | — |

**What the table implies.** The discriminator is not the SNI, not the transport wrapper, not
the server config, and not the server's country. Plain HTTPS to the exact same IP:port
always succeeds while VLESS+Reality to it always fails from Russia. Combined with the
2026-06-10 observation that a blocked-carrier connection attempt produced **complete
silence in the xray log** (the TCP stream never reached the pod), the remaining candidates
are narrow:

1. **(G) uTLS fingerprint** — the one parameter from the contact's known-working config that
   we have still never matched (`firefox` vs our `chrome`). Cheap, client-side only.
2. **(I) The client's TLS ClientHello is being parsed by the DPI** and matched against a
   Reality/VLESS signature. Countermeasure is client-side ClientHello fragmentation, which
   prevents the DPI from reassembling the record. Free to test; Traefik still reassembles at
   the TCP layer, so the server side is unaffected.
3. **(F) IP reputation.** TSPU is known to flag IPs observed carrying proxy traffic and then
   drop VPN-shaped flows to them while still permitting ordinary web traffic — which would
   explain why *both* our IPs now fail from Russia yet both serve websites fine, and why no
   amount of server-side reconfiguration has mattered. If this is the cause, the only fix is
   an IP that has never carried our VPN traffic.
4. **(K) Reality/VLESS protocol detection.** If TSPU now fingerprints Reality itself, no
   parameter tuning will work and the protocol must change (Hysteria2 / TUIC /
   Shadowsocks-2022 / AmneziaWG).

Hypotheses 1 and 2 are free and should be tested before spending money or time on 3 and 4.
Hypothesis 3 is the decisive experiment and should be run on a throwaway VPS *before* any
architectural work, so that a negative result costs one hour instead of a migration.

---

### 2026-07-30 — Reverted the Jellyfin SNI

Since the SNI swap produced no improvement, `values.yaml` was reverted to its pre-change
state so the config stays at the simplest arrangement that works. Reverted exactly (zero
diff against `70cda1e`):

| surface | back to |
|---|---|
| `xray-vpn-firstvds` Reality SNI | `senaev.ru` |
| `xray-vpn-hetzner` Reality SNI | `senaev.com` |
| Traefik passthrough `HostSNI` | `senaev.ru` / `senaev.com` |
| `*-xray-fallback` ingress | root domains on `websecure-xray` |
| `jellyfin.senaev.*` | back in the `*-direct` entries on `web,websecure` |
| subscription links | `@senaev.ru` / `@senaev.com`, `sni=` matching |
| `senaev-*-root` entries | removed |

Rationale for reverting rather than keeping: the Jellyfin SNI was not harmful, but it made
`jellyfin.senaev.*` depend on the xray pod being up (its `:443` was owned by the VPN
passthrough, with traffic only reaching Jellyfin through the Reality `dest` fallback). That
is a real availability coupling for a service that is actually used, and it buys nothing now
that SNI is known not to matter. Clients must re-import the subscription again, since the
address and `sni=` revert with it.

The pending next step is unchanged and is client-side only, so it is unaffected by this
revert: test TLS fragmentation in Hiddify, then `fp=chrome` → `fp=firefox`, tailing
`kubectl logs -n senaev-com deploy/xray-vpn-firstvds -f` during each attempt to see whether
the connection reaches the pod at all.

## 2026-11-08 — Namespace migration preparation

Move the unchanged VPN services into their own `vpn` Helm release before building a
future debugging environment. See [cutover and rollback](NAMESPACE-MIGRATION.md).
No debugging client or automated experiments are included in this step.

## 2026-11-08 — Repeatable diagnostic baseline

Prepare six isolated clients on senaev-media, with lightweight checks every ~30s and
bounded exit/download checks every ~300s.
Deployed through PRs #135 and #137. Several rounds show repeatable transfer stalls on direct Hetzner entry, while FirstVDS → Hetzner downloads succeed. See [deployed baseline](BASELINE-EXPERIMENT.md) and [project status](project-status.md).


## Controlled recovery investigation

The [recovery experiment](RECOVERY-EXPERIMENT.md) deployed in PR #139. Its first cycle found successful small checks at 5/30/60s after a stalled transfer. The [size/destination matrix](TRANSFER-MATRIX.md) is deployed; its first round found size-dependent failures on direct Hetzner entry. Entry-only FirstVDS and bounded checker timing variation deployed in PR #143.


## XHTTP comparison

The [XHTTP/TLS candidate](XHTTP-COMPARISON.md) deployed in PR #144 alongside the
deployed TCP/Reality baseline, with a dedicated backend and no subscription changes.
FirstVDS entry-only configuration and randomized checker timing are deployed.


## XHTTP response stall

Deployed diagnostics confirmed the initial post-TLS stall and later connection
timeouts; direct/TCP controls passed. Candidate payload tests stay skipped.
The [fresh/reused comparison](XHTTP-RESPONSE-DIAGNOSTICS.md) deployed in PR #146;
both request orders failed from home with the same post-TLS/setup pattern.

The isolated Hetzner source control is deployed and its first XHTTP trace passed;
a contemporaneous home trace still stalled after destination TLS. See
[scope and interpretation](XHTTP-RESPONSE-DIAGNOSTICS.md#source-control--hetzner).

PR #149 deployed fresh Chrome/native TLS over HTTP/2 and short request jitter.
In the first round both clients passed on Hetzner and stalled from home. [Details and limits](XHTTP-RESPONSE-DIAGNOSTICS.md#validation-and-scope-of-this-iteration).

PR #150 deployed the comparison: fresh native TLS with HTTP/2 versus HTTP/1.1
from both sources, retaining jitter and limits. [Scope and local verification](XHTTP-RESPONSE-DIAGNOSTICS.md#next-comparison-prepared--native-http2-versus-http11).

PR #150 deployed: the first native H1 trace worked from home while H2 stalled;
both passed on Hetzner. PR #151 then deployed [payload validation](H1-PAYLOAD-VALIDATION.md).
Its first ladder passed4/16/64KiB on Hetzner but failed all three from home; paired
direct controls passed. H1 is not a working payload workaround yet.
[Raw results](sources/2026-11-09-h1-payload-results.txt) and
[current stage](project-status.md) record the limits. PR #152 deployed the fresh, exit-validated4KiB comparison without long post-exit
idle. Its first cycle passed on home and Hetzner; home reused16/64KiB still failed.
[Current evidence](sources/2026-11-09-h1-fresh-control.txt) also records the longer
#151 baseline (home4KiB7/8,16/64KiB0/8). Fresh checks are logged but missing from
the deployed metrics allowlist. The next prepared PR fixes that omission and adds
a separate fresh16KiB control, retaining4KiB and all bounds. No user profile changes.


## senaev.ru outage and availability monitoring — 2026-11-10

PR #154 merged, but rollout stopped because Hetzner's Kubernetes API refused
connections. A Tailscale update at06:26 UTC /07:26 Madrid removed its interface,
stopped bound K3s, and did not recover K3s afterward. Website failure is reproduced;
the exact FirstVDS fallback hop remains unverified. No host changes were made.
[Evidence, recovery proposal and check design](SENAEV-RU-AVAILABILITY.md).
The prepared availability PR adds direct HEAD metrics and Grafana panels;
it does not repair node networking.

## Availability monitoring follow-up (#155)

Independent bounded senaev.ru HEAD checks from home and Hetzner are prepared
in [the availability PR design](SENAEV-RU-AVAILABILITY.md). Conflicts resolved
with latest main, retaining the deployed fresh8KiB VPN control. Current-status
panel uses an instant120s-freshness query to avoid stale green timelines.
Not merged/deployed. Latest VPN rollout #158 succeeded at7900d081; repeated8KiB
results still need analysis. No host networking changes are part of this PR.

## 2026-11-12 — Availability merged; prepare12KiB control

PR #155 merged at0428b757 after conflict resolution and the instant-status panel
fix. Deployment43307488174 succeeded; all5 website smoke checks pass. Both website
workers report fresh200 results and Grafana contains the new availability panels. First post-#158 fresh
8KiB results passed home2/2 and Hetzner3/3;16KiB still failed home0/2 and passed
Hetzner3/3. These are preliminary current-process counters. Prepare a bounded
fresh12KiB control after the retained4/16/8KiB sequence, without deploying it.
[Design, traffic allowance and interpretation](H1-PAYLOAD-VALIDATION.md).

### 2026-11-12 — Routing safety and Happ local proxy authentication

FirstVDS has only SOCKS outbounds and its authenticated user routes explicitly to
Hetzner. A manual test of the rendered config with pinned Xray 26.9.30 passed:
healthy selected exit -> exit stopped, origin untouched -> exit recovered.
A second exit remains available during failure. This isolates routing with fake
credentials and loopback plain VLESS, not production Reality/WAN transport.
No routing change or extra blackhole is justified by this result; Hetzner and home
remain intentional exits. See the manual command in `AGENTS.VPN.md`.

Add only Happ's documented `socks-auth-mode: auto` and `http-auth-mode: auto`
subscription headers. Official semantics: credentials generated and injected into
configs/tunnel by the app. No shared password or Vault change. External programs
using Happ's local proxy need its generated credentials. Actual app refresh and
connectivity remain a post-deployment check; headers alone do not prove client
compliance or general DNS/IPv6 leak protection.

Source: https://github.com/HappDev/happ_su/blob/main/dev-docs/app-management.md
This safety step is independent of the unresolved home-to-Hetzner transfer stall.

### 2026-11-13 — Merge safety headers; prepare ordinary HTTPS bulk control

PR #168 merged at af23212b8715e914ff7b8d06493fb83e43f87ec2. Deployment
43388530309 succeeded. All three new probe targets scraped up; fresh senaev.ru
checks passed from home and Hetzner; all five website smoke checks passed. No
subscription error logs found in the checked ten-minute window. Real Happ
subscription refresh/authentication remains a user-side check.

Before probe rollout reset the counters (07:49 UTC), fresh XHTTP/H1 payloads:

| Source | 4 KiB | 8 KiB | 12 KiB | 16 KiB |
|---|---|---|---|---|
| home | 17/18 | 17/17 | 4/18 | 0/16 |
| Hetzner | 32/32 | 32/32 | 32/32 | 32/32 |

These are current-process success/attempt counters, not matched rounds. Home
12 KiB direct controls were 17/18; other listed direct controls all passed.
Home exit checks also had occasional setup failures (16 KiB exit 16/18, 8 KiB
17/18), so payload counts omit failed exit gates. 12 KiB failures included HTTP
200 with 5,521 or 5,513 body bytes, and a separate zero-body timeout after TLS.
This is not evidence of one exact byte cutoff or a proven DPI/MTU diagnosis.

Next step: after existing matrices, independently download ordinary HTTPS/H1
8/16/64 KiB ranges from the existing senaev.com static assets, on both home
profile 4 and Hetzner control. Discover the current asset from bounded homepage
HTML, inspect at most four same-origin script paths with HEAD, choose one at
least 64 KiB, require HTTP 206 and exact byte counts. Do not pin a build hash,
add endpoints, bypass TLS checks, follow redirects or add a worker. Failed
asset discovery leaves the comparison inconclusive. A failed size does not
suppress later sizes; original VPN acceptance remains unchanged.

Bounds: existing 3s connect/8s total/32 KiB/s curl settings; 60–90s before the
control and 2–7s jitter before each HEAD/range. At most 152 KiB planned response
bodies per eligible round (64 KiB HTML cap + 88 KiB ranges), plus HEAD/response
headers and transport overhead; this is not a wire-byte limit. Full rounds
already wait 300–360s plus matrix duration. Existing website worker may overlap.
Grafana transfer panels include fixed transfer_https_hetzner_* names and explain
their independent meaning. Discovery is exported separately.

Interpretation: ordinary bulk success alongside XHTTP failure weakens a general
bulk-path failure hypothesis and favors a VPN/framing/classification-dependent
problem. Both failing strengthens a broader source/path hypothesis. Neither
proves DPI or PMTU; curl and Xray TLS differ, and this control lacks the VPN's
external destination hop. Hetzner remains a same-host control. Next, if needed,
use FirstVDS as an independent source to Hetzner's public endpoint, not an exit.

Live preflight on Code Tools passed HTTP 206 and exact 8/16/64 KiB bytes using
current existing website assets. Timing waits were mocked for this preflight;
it does not establish success from the home ISP or scheduled operation.

### 2026-11-13 — Add an independent FirstVDS source (draft)

PR #169 merged at 0b38516c5f6a57559377caed3df4db42218a5a33 after CodeRabbit
approval with no findings. Deployment43480667883 succeeded at18:18 UTC.
All5 website smoke tests passed through `npm run test:smoke`; all3 current
probe targets are scraped, with fresh successful website checks on both nodes
and zero5m probe restart increases. Ordinary HTTPS
results are not available immediately: these controls run after existing serial
matrices. Do not treat absent samples as failures or claim the hypothesis tested
before fresh home and Hetzner results arrive.

Pre-rollout snapshot at18:15 UTC (current-process XHTTP/H1 success/attempt):

| Source | 4 KiB | 8 KiB | 12 KiB | 16 KiB |
|---|---|---|---|---|
| home | 17/17 | 15/16 | 5/16 | 0/17 |
| Hetzner | 32/32 | 32/32 | 32/32 | 32/32 |

Paired direct payload counters in this snapshot all passed. These are not
matched rounds, and exit gates can omit payloads. Persistent source dependence
and size sensitivity remain; neither a fixed byte boundary nor DPI is proven.
Classification/filtering, loss/PMTU behavior and WAN-sensitive streaming remain
plausible. The ordinary HTTPS comparison is the next evidence to review.

Prepare the subsequent source comparison as a draft, not deployed: reuse the
existing source-control Deployment template for one extra probe on FirstVDS.
It uses the same image, dedicated XHTTP test profile, public senaev.com:443
endpoint, matrix, budgets and cadence as the Hetzner source control. Existing
resources render unchanged, including Hetzner's local-frontend policy. FirstVDS
gets no additional internal-network allowance and no website worker. Metrics
use its distinct profile label and existing node relabeling/dashboard selectors.

The probe is only a client; FirstVDS still has no SOCKS inbound or direct Freedom
outbound. No production subscription/profile, listener, server route, secret,
host route, firewall, capability or service-account privilege is added. Its
ordinary direct diagnostic requests are not forwarding user VPN traffic.
Resource limits remain200mCPU/128Mi, scratch16Mi. It duplicates one existing
bounded control workload; it does not run continuously every few seconds.

If FirstVDS passes while home fails, prioritize differences in the home
source/path (including host/ISP/MTU). If both remote sources fail while Hetzner
self-connect passes, prioritize behavior needing a real network path; this still
does not isolate Russia-specific filtering or exclude streaming implementation
issues. An external European source or bounded TCP evidence may then be useful.
Keep this PR draft until #169 produces interpretable ordinary HTTPS results.

### 2026-11-13 — #178 deployed; evidence gate before another runtime change

User approved #178 merge. It merged at65c3d280dfe93898d10ab19cfca5a3d807fa6f7c;
deployment43485466491 succeeded. The FirstVDS probe is scraped (up=1), alongside
the three existing probes, whose pod identities remain unchanged. All5 tests in
`npm run test:smoke` passed. No production exit, host network or privilege change.
#178 had successful CI, no review findings and no approving review before merge.

At18:43 UTC, Hetzner had one successful ordinary HTTPS discovery and one success
at each8/16/64KiB, with zero failures. Home had no samples for these controls yet;
its matrix was still running. FirstVDS had not been deployed at that snapshot.
Do not infer a home HTTPS failure or a completed source comparison from absence.

Next: collect at least three completed, exit-validated rounds per relevant source
(home, Hetzner and FirstVDS), checking paired direct controls, ordinary discovery,
body byte counts, timestamps and resets. The scheduled20:20 Madrid /19:20 UTC
analysis will report whatever is available and explicitly identify insufficient
samples. Source results are not perfectly synchronized or a proof of geography.

If failures persist, the prepared next experiment is a client-only packetization
comparison, not a host MTU change:

- Keep existing diagnostic baselines. Add a separate default-vs-small-MSS pair
  of fresh native-TLS XHTTP/H1 clients, requesting the same16KiB Cloudflare body.
- Only one arm sets `streamSettings.sockopt.tcpMaxSeg: 1000`. Alternate arm order
  by round; use independent temporary processes, existing exit gates/direct
  pairs,8s budget,32KiB/s setting and60–90s quiet /2–7s request jitter.
- Preserve TLS verification, endpoint, credentials, payload, timeout and original
  acceptance. Tag diagnostic results separately; do not promote them to a fix.
- Adds72KiB planned responses per eligible source round (two arms, each4KiB exit
  allowance plus16KiB direct and16KiB proxy), not a wire-byte cap.
- Require reproducible paired differences. Improvement shows packetization
  sensitivity, compatible with PMTU/loss, traffic classification or streaming
  behavior; it does not uniquely prove any of them. A negative result cannot
  exclude PMTU unless effective WAN MSS is actually lower than the baseline.

This is only a proposal; no new probe arm or socket setting is deployed here.
A pinned26.9.30 Xray loopback preflight using the real XHTTP/H1 dial path observed
peer MSS32768 by default versus988 when tcpMaxSeg=1000. Dummy TLS listener was
intentionally incomplete: it verifies socket-option application, not successful
TLS, upload/download behavior, WAN MSS or VPN recovery. No host changes needed.
A1000-byte MSS is an experimental arm, not a discovered path MTU or recommended
production setting. First inspect the new source results before implementing it.

Primary sources:
- https://xtls.github.io/en/config/transports/sockopt.html
- https://github.com/XTLS/Xray-core/blob/v26.9.30/transport/internet/sockopt_linux.go
- https://github.com/XTLS/Xray-core/blob/v26.9.30/transport/internet/splithttp/dialer.go

### 2026-11-13 18:59 UTC — First control results; align discovery before MSS tests

One initial FirstVDS round passed ordinary HTTPS8/16/64KiB. Its small native
XHTTP/H2 trace passed (HTTP200,216 bytes,curl0,1.316s), while H1 trace setup
failed (HTTP0,0 bytes,curl28,3.138s), so no H1 payload ladder ran. This differs
from home's H2-fail/H1-small-pass pattern. It is one round, not a stable verdict.

Home's first discovery at18:54:30 UTC returned HTTP200 but only9,862 body bytes
before curl28 at8.011s (TLS488ms, first byte589ms). Discovery failed and no
ordinary range payloads ran. That is a real ordinary-request stall, not evidence
that the absent8/16/64KiB controls failed or that all VPN protocols share one cause.

Found an experimental gap: range requests explicitly use HTTP/1.1, whereas the
homepage GET and asset HEAD discovery previously used curl's automatic protocol
negotiation. The failed request did not log its negotiated version, so calling
that historical request H2 would be speculation. Align only bulk-control
homepage/HEAD discovery with H1, and include a bounded known HTTP-version field
in result logs. Keep original counters/failures and existing check names; split
analysis by deployment time. Website availability and legacy probes retain their
existing protocol selection. No retry, timeout or byte-budget increase.

This protocol alignment is the immediate next PR. MSS A/B remains conditional
on interpretable source controls, not the next automatic configuration change.

### 2026-11-13 23:28 UTC — Independent configured-asset HTTPS ranges

Home's ordinary H1 discovery has failed three times, preventing all range
attempts. User approved separating the size checks from that prerequisite.
Keep the existing discovery request, metadata checks and failed metric intact.
Supply `vpnProbe.httpsControlAssetPath` to home profile4 and both source controls
as `HTTPS_CONTROL_ASSET_PATH`. When configured, ranges use that same-origin asset
regardless of discovery outcome; logs identify configured/discovered selection.
Empty configuration preserves the previous discovery-based behavior.

Verified current asset: `/_next/static/chunks/6b932d840e5ca137.js`, Content-Length
223452. Paths are restricted to static chunk JavaScript filenames under the fixed
https://senaev.com origin; schemes, traversal and query strings are rejected.
A removed asset yields visible HTTP failures with no retry or automatic fallback.
After a website build removes it, verify and update the chart value before
interpreting those failures as transport evidence. Revert to an empty value to
restore discovery-dependent behavior. No server or host configuration change.

Retain H1/TLS verification, exact HTTP206/byte checks,8s/32KiB/s settings and
existing jitter/cadence/acceptance. Planned body caps stay152KiB per eligible
round plus headers/transport overhead; home now attempts its intended88KiB range
payload total even when discovery fails. No MSS arm enabled.

Validation:105 Python tests; VPN Helm lint; rendered environment present on
exactly3 diagnostic Deployments. A live Code Tools preflight with mocked waits
and a forced homepage timeout retained discovery failure and fetched exact
8/16/64KiB with HTTP206/H1.1. This does not demonstrate home-path recovery.

### 2026-11-14 10:02 UTC — Dedicated bounded HTTPS control endpoint

User replaced the configured website-chunk proposal with a dedicated endpoint in
senaev/senaev.com. GET /api/vpn-test?bytes=N returns deterministic binary content,
HTTP200 and exact Content-Length; bytes defaults to16384 and is bounded1..524288
(512KiB, user-approved cap). HEAD has metadata only. Invalid/duplicate/unknown
parameters and Range are rejected. No caching/compression, URL fetching, file reads,
delays, retries or unbounded allocations. The cap is per response, not a rate limiter.

Infra PR181 now requests8/16/64KiB independently of the H1 homepage result and
requires HTTP200 plus exact bytes. Removed chunk discovery, HEAD asset selection,
Range helper and the asset setting/templates. Existing metric names remain;
https_bulk_discovery now reports only homepage completion, not asset selection.
Logs mark the new cohort control_target=vpn-test-v1. Never combine HTTP206 chunk
controls with these HTTP200 endpoint controls as identical experiments.

Retain3s connect/8s total/32KiB/s curl, TLS verification, jitter, existing cadence
and exit/direct gates. Routine payload total stays88KiB; homepage cap64KiB remains
(the152KiB total excludes headers/wire overhead). The512KiB server cap does not
increase automated traffic. Endpoint is fixed on https://senaev.com, no new secret,
service, privilege, route, host/MSS or production subscription change.

Deploy the website endpoint first after approval; verify public exact-size responses
and identity encoding before merging/deploying infra PR181. Until then a404 is a
missing endpoint, not transport evidence. After rollout obtain at least3 comparable
completed rounds per relevant source, account for freshness/resets/skipped gates,
then reassess. MSS remains deferred. No merge or deployment authorized here.

### 2026-11-14 12:04 UTC — Independent diagnostic schedules

User approved independent schedules and allowed overlap between groups. Ordinary
H1 homepage plus8/16/64KiB endpoint checks now run in one worker with0–30s initial
jitter and300–360s start cadence. No accumulated backlog or concurrent run within
a group. Removed the extra60–90s pre-bulk quiet wait in scheduled mode only.

Home fresh XHTTP diagnostics run in a separate worker using the same source-control
loop as the VPSs. The old home matrix retains direct/baseline trace diagnostics but
cannot invoke fresh clients on1083 in scheduled mode. One fresh group owns that
port per pod, keeping H2/H1 ordering, per-client pauses, exit gates and paired
requests sequential. Its full round still takes longer than5min; no promised
five-minute fresh16KiB sample. VPS fresh diagnostics and bulk now overlap too.
Website HEAD checks retain their existing independent cadence. Manual --once
retains the serial matrix/diagnostics/bulk sequence and launches no workers.

Worker exceptions stop the process for normal Deployment restart; graceful shutdown
signals all workers and joins them before closing metrics. No new framework,
service, image, configuration setting, endpoint, privilege, host network, secret,
MSS or production route change. Existing request timeouts/byte limits unchanged.
Overlap may affect comparisons on the troubled path; use experiment IDs/timestamps,
paired direct checks and separate post-rollout cohorts. At most one run per group.
Ordinary body caps152KiB per5–6min/source (plus wire overhead), not a global cap.

Validation:106 Python tests passed, including cadence, overruns, no duplicate fresh
port use and existing shutdown/manual behavior. Full pre-push/CI checks follow.
PR only; no deployment. After approval verify all4 probe scrapes/restarts/logs and
at least3 completed new endpoint rounds per source before selecting another variable.

### 2026-11-14 14:27 UTC — Same-endpoint direct and XHTTP pairs

Add two separate exit-validated fresh XHTTP/H1 clients, for16/64KiB, after the
existing Cloudflare controls. Each compares identical https://senaev.com/api/vpn-test
responses directly and through XHTTP, with HTTP1.1, verified TLS, HTTP200 and exact
bytes. Direct failure marks the comparison inconclusive. Fixed new metric names
transfer_h1_fresh_endpoint_16384/65536 and diagnostic_h1_endpoint_exit_16384/65536
separate results from existing Cloudflare checks; bounded exporter allowlist updated.

Retain quiet intervals, request jitter,3s connect/8s total/32KiB/s limits and cleanup.
Each size has its own process and exit gate; no additional port or worker. Original
H1 trace gate still applies; failed gates skip payloads, not count as payload errors.
Adds168KiB planned successful response bodies per eligible fresh group/source:
2*(4KiB exit)+2*(16+64KiB paired payloads). This excludes headers/transport overhead.
Fresh group duration increases by at least two60–90s waits. Independent ordinary
HTTPS five-minute schedule is unchanged. No MSS, production routing/subscriptions,
host networking, services, privileges or secrets changed. FirstVDS stays entry-only.

108 Python tests passed. PR only, not deployed. After rollout compare at least three
completed pairs per size/source, including gates, exact bytes/status, timestamps,
resets and simultaneous group activity. Same-host endpoint traverses Hetzner egress
back to its public website; it is not an independent origin. Results cannot uniquely
identify DPI or PMTU. Retain Cloudflare controls to distinguish destination effects.

### 2026-11-14 16:21 UTC — Repair experimental self-target control path

Backend Datadog logs identify a concrete self-target connection failure, independent
of the home ISP. Example2026-11-14T16:17:54Z:
```
proxy/freedom: failed to open connection to tcp:senaev.com:443
 dial tcp 77.42.120.71:443: connect: connection refused
```
This localizes the new all-source endpoint comparison failure before the origin TLS
handshake. It does not establish why the public self-dial is refused or explain
home's separate partial-response stalls. No host networking changes attempted.

Prepare an experiment-backend-only exact TCP/domain/port route: full:senaev.com:443
uses a dedicated freedom redirect to traefik-hetzner.traefik.svc.cluster.local:443.
The default internet outbound remains first and unchanged apart from its tag.
Client TLS/SNI, verification, HTTP path and payload stay intact. Add one egress rule
allowing only Hetzner Traefik pods in namespace traefik onTCP443. No broad private
CIDR allowance; DNS and existing public443 policy unchanged. No production Xray,
subscription, host/Tailscale/K3s/firewall/MTU/MSS change. No new service or secret.
The redirected destination applies to all paths on that exact hostname/port in the
experimental backend, not only /api/vpn-test; Xray TCP routing cannot filter URLs.

This changes the experimental exit-to-origin path; keep direct public requests and
Cloudflare controls and treat post-rollout pairs as a new cohort. The control no
longer tests the exit's public self-dial. Revert these two configuration changes to
restore it.109 Python tests and VPN Helm lint passed. Live internal reachability,
TLS certificate and payload recovery remain unverified until approved deployment.
After rollout require three completed pairs/source with valid exit/direct gates;
if VPS endpoint controls still fail, investigate that before home-path variables.
Official redirect reference: https://xtls.github.io/en/config/outbounds/freedom.html
