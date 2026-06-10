# 2026-06-10 — Debug VPN connection (firstvds entry point)

> **This file is the working log for the investigation.** All findings, command outputs, screenshots, hypotheses confirmed/refuted, and the eventual fix must be appended to this file as we go — so the whole debug session lives in one place and is searchable later.
>
> Format: append new dated sections under `## Findings` as work proceeds. Don't rewrite earlier sections — annotate them.

## Symptom

- VPN clients connecting via the **firstvds** entry point lose internet.
- Clients connecting via **hetzner** or **vultr** entry points work normally.
- Websites `senaev.com` and `senaev.ru` themselves respond — so node, Traefik, DNS, and Reality routing are fine on firstvds at the SNI/host level.

## Context (architecture refresher)

From `CLAUDE.VPN.md` + `provisioning/helm/senaev-com/`: each VPS pod runs Xray with a Reality inbound on :443 and a socks inbound on :1080. The :443 socket is shared with Traefik via SNI — if the connection is Reality (correct uTLS + UUID), Xray handles it; otherwise it's forwarded raw to Traefik. That's exactly why `senaev.ru` still works while VPN doesn't.

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
