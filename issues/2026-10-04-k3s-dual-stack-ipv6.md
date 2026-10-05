# 2026-10-04 — k3s cluster has no IPv6 support

> This file is the working log for the investigation. All findings, command outputs,
> screenshots, hypotheses confirmed/refuted, and the eventual fix must be appended to
> this file as we go — so the whole debug session lives in one place and is searchable later.
>
> Format: append new dated sections under ## Findings as work proceeds. Don't rewrite
> earlier sections — annotate them.

## Symptom

The cluster is IPv4-only. Nodes, pods and Services have only IPv4 addresses, and the
public sites are not reachable over IPv6. Goal: change the cluster to dual-stack
(IPv4 + IPv6) with **one** cluster rebuild.

k3s cannot change an existing IPv4-only cluster to dual-stack. `--cluster-cidr` and
`--service-cidr` are fixed when the server is first started, so a full rebuild is necessary.

## Context (architecture refresher)

- Server: `provisioning/control-plane/bootstrap-control-plane.sh` — installs k3s only when
  it is not installed (line 11), so a flag change has no effect on the existing server.
- Workers: `provisioning/worker/bootstrap-worker.sh`, gated by `provisioning/worker/check-worker.sh`.
  `check-worker.sh` does not check network flags, so existing workers are seen as OK.
- Node IPs come from `tailscale ip -4` only. The control plane URL in
  `scripts/connect-all-workers.sh` is also IPv4 (keep it IPv4).
- flannel: VXLAN over `tailscale0` (`--flannel-iface=tailscale0`). `tailscale0` MTU is 1280,
  `flannel.1` MTU is 1230 (see `issues/2026-08-15-firstvds-https-hangs-no-web-traffic.md`).
- `provisioning/common/bootstrap-node-networking.sh` runs on every node at every deployment
  and binds k3s to `tailscale0` (systemd `BindsTo` + udev restart rule).
- Ingress: Traefik DaemonSet-like pods with `hostPort` 80/443 on `hetzner` and `firstvds`
  (`provisioning/helm/traefik/`). ACME storage is on `hostPath` — it survives a rebuild.
- k3s version: `K3S_VERSION=v1.35.2+k3s1` in `provisioning/common/.env`.
- Nodes: `hetzner` (control plane, Hetzner cx33, Debian 13, IPv6 enabled by default),
  `firstvds`, `senaev-media`, `proxmox`.

## Hypotheses, ranked

This is a task, not an incident. The entries below are the **blockers and risks** that can
make the one-shot rebuild fail.

**(A) Pod MTU is below the IPv6 minimum**
IPv6 VXLAN adds 70 bytes. On a 1280 `tailscale0` the pod MTU becomes 1210, and Linux
disables IPv6 on any interface with MTU < 1280, so pods get no IPv6 address.
- `Signal:` `ip -o link show tailscale0` shows `mtu 1280`.
- `Fix:` set `TS_DEBUG_MTU=1350` in `/etc/default/tailscaled` from
  `bootstrap-node-networking.sh`; restart `tailscaled` only when the value changed; verify
  the MTU after restart. `TS_DEBUG_MTU` is an unsupported debug knob — the script must
  fail loudly when it has no effect. Roll out one node at a time (the restart deletes
  `flannel.1`; the existing BindsTo + udev rule restart k3s).

**(B) `k3s-uninstall.sh` deletes local-path PVC data on hetzner**
`/var/lib/rancher/k3s/storage` is removed. Affected: Vault (`vault/values.yaml`
`dataStorage`, `storage "file"`), `opencode-telegram-git`, VictoriaMetrics `vmsingle`.
- `Signal:` `kubectl get pv -o wide` lists `local-path` volumes.
- `Fix:` back up the PV directories (and the Vault unseal keys) before uninstall;
  restore into the new PVs before Vault starts.

**(C) Bootstrap scripts do not apply the new flags**
- `Fix:` add the dual-stack flags to both scripts; add a dual-stack check to
  `check-worker.sh` (for example: `--node-ip` contains a `:`) so old workers reinstall.

**(D) A node has no IPv6 inside the OS or no Tailscale IPv6**
For example IPv6 disabled by sysctl, or `proxmox` is an LXC container with IPv6 off.
- `Signal:` `tailscale ip -6` is empty, or `sysctl net.ipv6.conf.all.disable_ipv6` = 1.
- `Fix:` enable IPv6 on that node before the rebuild.

**(E) Firewall blocks IPv6**
- `Signal:` UFW `IPV6=no`, or no v6 rules for 80/443 / flannel UDP 8472 on `tailscale0`.
- `Fix:` set `IPV6=yes`, add the v6 rules.

**(F) Chosen ULA ranges collide with an existing network**
- `Signal:` `ip -6 route` on any node shows `fd42::/56` or `fd43::/112` in use.
- `Fix:` choose other ranges.

**(G) AAAA records point to a broken IPv6 path**
Let's Encrypt prefers IPv6 for HTTP-01; a broken v6 path makes certificate renewal fail.
- `Fix:` add AAAA records only after an external `curl -6` test passes.

## Collaboration model

The agent proposes commands; the user runs them and pastes the output.
**Round 1 is read-only** — no writes, no restarts — until every blocker above is checked.
Script changes are prepared in the repo but not committed without explicit consent.

## Round 1 diagnostic commands

Run on each node (`hetzner`, `firstvds`, `senaev-media`, `proxmox`). For workers, use
`ssh -J root@77.42.120.71 root@<tailnet-ip> '...'`.

```bash
# 1. (A)(D) Tailscale IPv6 address and MTU
tailscale ip -6; ip -o link show tailscale0 | grep -o "mtu [0-9]*"

# 2. (D) Public IPv6 and IPv6 enabled in the kernel
ip -6 addr show scope global; sysctl net.ipv6.conf.all.disable_ipv6 net.ipv6.conf.all.forwarding

# 3. (D) Container or VM? (LXC limits sysctl and IPv6)
systemd-detect-virt

# 4. (E) Firewall state
ufw status verbose 2>/dev/null; grep -E "^IPV6=" /etc/default/ufw 2>/dev/null

# 5. (F) Existing IPv6 routes
ip -6 route

# 6. (D) Outbound IPv6 works from the host
curl -6 -sS -m 5 https://ifconfig.co || echo "NO IPv6 EGRESS"

# 7. (A) Current tailscaled environment file
cat /etc/default/tailscaled
```

On `hetzner` only:

```bash
# 8. (B) Which PVs live in local-path storage
kubectl get pv -o custom-columns=NAME:.metadata.name,CLAIM:.spec.claimRef.name,NS:.spec.claimRef.namespace,PATH:.spec.local.path,HOSTPATH:.spec.hostPath.path,NODE:.spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values[0]
ls -la /var/lib/rancher/k3s/storage/
```

| Result | Hypothesis |
|---|---|
| `tailscale0` mtu 1280 | **A** confirmed — MTU change is required |
| `tailscale ip -6` empty / `disable_ipv6 = 1` | **D** on that node |
| `systemd-detect-virt` = `lxc` | **D** risk on that node |
| `IPV6=no` or no v6 rules | **E** |
| `fd42::` / `fd43::` routes present | **F** |
| PVs outside `hetzner` or unexpected PVs | **B** — extend the backup list |

## Fix options (pending Round 1 output)

Planned changes (one rebuild):

1. `bootstrap-node-networking.sh`: manage `TS_DEBUG_MTU=1350` (idempotent, restart only on
   change, verify MTU); check `flannel-v6.1` exists in addition to `flannel.1`.
2. `bootstrap-control-plane.sh` (server):
   `--cluster-cidr=10.42.0.0/16,fd42::/56 --service-cidr=10.43.0.0/16,fd43::/112`
   `--node-ip=<ts-v4>,<ts-v6> --node-external-ip=<ts-v4>,<ts-v6> --flannel-ipv6-masq`
   (keep `--advertise-address=<ts-v4>`).
3. `bootstrap-worker.sh`: `--node-ip=<ts-v4>,<ts-v6> --node-external-ip=<ts-v4>,<ts-v6>`.
4. `check-worker.sh`: fail when the agent is not configured as dual-stack.
5. Rollout:
   1. Apply step 1 on each node, one at a time; test MTU (`ping -M do -s 1322` between
      nodes over tailnet) and throughput (iperf3 monitor).
   2. Back up local-path PVs and Vault unseal keys.
   3. Uninstall all agents, then the server.
   4. `make cluster`, then `make services`; restore PV data; unseal Vault.
   5. Add `ipFamilyPolicy: PreferDualStack` where needed; add AAAA records.

## Verification

- `kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name} {.spec.podCIDRs}{"\n"}{end}'`
  shows an IPv4 and an IPv6 pod CIDR for every node.
- A test pod has both addresses; pod-to-pod `ping6` works across every node pair.
- `ip -s link show flannel-v6.1` RX increases on every node.
- From outside: `curl -6 https://senaev.com` returns the site; certificate renewal works.
- VPN clients connect over IPv4 as before (and over IPv6, if AAAA is added for the VPN host).

## Findings

*(append results below)*

### 2026-10-04 — Decisions (answers from the user)

- **No AAAA records.** Public domains stay IPv4-only. This removes (G).
- **IPv6 is for fallback use:** VPN clients on IPv6-only networks, and pod egress to
  IPv6-only hosts. Inside the cluster, traffic stays IPv4.
- **Data loss is accepted.** Vault is rebuilt from zero (new init, new unseal key from
  `bootstrap-vault.sh`, secrets re-entered by hand). All local-path PVCs are lost. (B) is
  reduced to "list the PVCs".
- **k3s is upgraded in the same rebuild** (to the current `stable` channel version at
  rebuild time; read its release notes for removed or renamed flags).
- **Tailscale MTU change is rolled out first, separately**, on the live IPv4 cluster.
- **Downtime is acceptable** at any time.

Consequences for the design:

- IPv4 is listed first in `--cluster-cidr` / `--service-cidr`, so it is the primary family.
  Services stay `SingleStack` IPv4 by default, and cluster DNS returns only A records for
  them. No `ipFamilyPolicy` changes are needed.
- Pods get a ULA address (`fd42::/56`). With RFC 6724 address selection, a ULA source is
  not preferred for a global IPv6 destination, so pods use IPv4 for dual-stack hosts and
  IPv6 only for IPv6-only hosts (masqueraded by `--flannel-ipv6-masq`). On a node without
  public IPv6, an IPv6-only host stays unreachable — the same as today.
- VPN over IPv6 without AAAA: clients must connect to the IPv6 literal of the VPS.
  `vpn-subscription` must add VLESS entries with `[<public-ipv6>]:443` — a follow-up code
  change after the rebuild. The public IPv6 of each VPS must be static.
- Traefik `hostPort` 443 receives IPv6 through the CNI `portmap` plugin once the Traefik
  pod has an IPv6 address. UFW must allow 80/443 over IPv6.

PVCs that are lost (from the repo; all on `hetzner`):

| Namespace | PVC | Size | Source |
|---|---|---|---|
| `vault` | `data-vault-0` | 1Gi | `provisioning/helm/vault/values.yaml` `dataStorage` |
| `senaev-com` | `opencode-telegram-git` | 16Gi | `provisioning/helm/senaev-com/templates/opencode-serve.yaml` |
| `telemetry` | `vmsingle-…` | 20Gi | victoria-metrics-k8s-stack 0.72.2 chart default |

Confirm on the live cluster with `kubectl get pvc -A`.

### 2026-10-04 — Relation to `issues/2026-06-10-debug-vpn-connection.md`

That issue found that **VPN exit traffic to IPv6 destinations fails** with
`network is unreachable`, because xray pods have no IPv6 route (IPv4-only flannel). Two
workarounds were added in `provisioning/helm/senaev-com/templates/_helpers.tpl`:

- `outbound-freedom` `"domainStrategy": "UseIPv4"` (line 70)
- routing rule `ip: ["::/0"] → outbound-blackhole` (lines 76–80)

After the rebuild, the root cause is gone **on nodes with public IPv6 egress** (Round 1
command 6). Follow-up change, after the rebuild and per xray instance:

- IPv6-capable exit node: remove the `::/0` blackhole rule and change `domainStrategy` to
  `UseIPv4v6` (prefer IPv4, fall back to IPv6). IPv6-only destinations and client DNS to
  `2001:4860:4860::8888` then work.
- Node without public IPv6 (probably `senaev-media`, `proxmox`): keep both workarounds —
  the fast reject is still what makes clients fall back to IPv4 quickly.

This needs a per-instance flag in `values.yaml` (for example `ipv6Egress: true`).

The **main** problem of that issue — DPI blocks VLESS+Reality from Russian ISPs — is not
fixed by dual-stack. One side effect may help it: the IPv6 /64 of a VPS gives addresses that
have never carried VPN traffic. That is a cheap test of its hypothesis **(F) IP reputation**,
but only for clients whose network has IPv6.

### 2026-10-05 — Round 1 results

**hetzner**

```
fd7a:115c:a1e0::6936:4c73
mtu 1280
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP qlen 1000
    inet6 2a01:4f9:c013:5425::1/64 scope global
       valid_lft forever preferred_lft forever
494: tailscale0: <POINTOPOINT,MULTICAST,NOARP,UP,LOWER_UP> mtu 1280 state UNKNOWN qlen 500
    inet6 fd7a:115c:a1e0::6936:4c73/128 scope global
net.ipv6.conf.all.disable_ipv6 = 0
net.ipv6.conf.all.forwarding = 0
kvm
2a01:4f9:c013:5425::/64 dev eth0 proto kernel metric 256 pref medium
fd7a:115c:a1e0::6936:4c73 dev tailscale0 proto kernel metric 256 pref medium
fe80::/64 dev eth0 proto kernel metric 256 pref medium
fe80::/64 dev tailscale0 proto kernel metric 256 pref medium
default via fe80::1 dev eth0 metric 1024 onlink pref medium
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>...   (Cloudflare challenge page from ifconfig.co)
PORT="41641"
FLAGS=""
```

Public IPv6 `2a01:4f9:c013:5425::1/64` with a default route. `curl -6` reached Cloudflare
(the challenge page is an HTTP answer), so **IPv6 egress works**. No UFW output — UFW is not
installed or not active. **(D) refuted for hetzner. (A) confirmed (mtu 1280).**

**firstvds**

```
fd7a:115c:a1e0::d736:d926
mtu 1280
3: tailscale0: ... mtu 1280 ...
    inet6 fd7a:115c:a1e0::d736:d926/128 scope global
net.ipv6.conf.all.disable_ipv6 = 0
net.ipv6.conf.all.forwarding = 0
kvm
Status: active
Default: deny (incoming), allow (outgoing), deny (routed)
80/tcp                     ALLOW IN    Anywhere
443                        ALLOW IN    Anywhere
22/tcp                     ALLOW IN    Anywhere
1500/tcp (ispmanager)      ALLOW IN    Anywhere
80/tcp (v6)                ALLOW IN    Anywhere (v6)
443 (v6)                   ALLOW IN    Anywhere (v6)
22/tcp (v6)                ALLOW IN    Anywhere (v6)
1500/tcp (ispmanager (v6)) ALLOW IN    Anywhere (v6)
IPV6=yes
fd7a:115c:a1e0::d736:d926 dev tailscale0 proto kernel metric 256 pref medium
fe80::/64 dev ens3 proto kernel metric 256 pref medium
fe80::/64 dev tailscale0 proto kernel metric 256 pref medium
curl: (7) Failed to connect to ifconfig.co port 443 after 32 ms: Could not connect to server
NO IPv6 EGRESS
PORT="41641"
FLAGS=""
```

**No public IPv6** on `ens3` and no IPv6 default route. **(D) confirmed for firstvds** — unless
the provider can assign an IPv6 address. UFW is ready for IPv6 (`IPV6=yes`, v6 rules for
80/443). UFW `deny (routed)` must be checked for IPv6 pod forwarding later, if firstvds gets IPv6.

**senaev-media**

```
fd7a:115c:a1e0::3f36:fe63
mtu 1280
net.ipv6.conf.all.disable_ipv6 = 0
kvm
fd7a:115c:a1e0::3f36:fe63 dev tailscale0 proto kernel metric 256 pref medium
fe80::/64 dev eth0 proto kernel metric 256 pref medium
fe80::/64 dev tailscale0 proto kernel metric 256 pref medium
curl: (7) Failed to connect to ifconfig.co port 443 after 8 ms: Could not connect to server
NO IPv6 EGRESS
```

**proxmox**

```
fd7a:115c:a1e0::6136:c70d
mtu 1280
net.ipv6.conf.all.disable_ipv6 = 0
none
fd7a:115c:a1e0::6136:c70d dev tailscale0 proto kernel metric 256 pref medium
fe80::/64 dev tailscale0 proto kernel metric 256 pref medium
fe80::/64 dev vmbr0 proto kernel metric 256 pref medium
fe80::/64 dev cni0 proto kernel metric 256 linkdown pref medium
curl: (7) Failed to connect to ifconfig.co port 443 after 2 ms: Could not connect to server
NO IPv6 EGRESS
```

Home nodes: no public IPv6, no UFW. Only link-local on the LAN (`eth0`, `vmbr0`), so the home
router gives no IPv6 prefix. `proxmox` is bare metal (`none`), not LXC. **(D) confirmed for
both.**

All nodes: Tailscale IPv6 present, `disable_ipv6 = 0`, `tailscale0` mtu 1280, empty
`FLAGS` in `/etc/default/tailscaled`. **(A) confirmed on every node. (F) refuted** — no
`fd42::` / `fd43::` routes anywhere.

**PVs on hetzner** (command 8 failed: zsh globbed `[0]`; the directory listing is enough):

```
pvc-53226c1b-..._vault_data-vault-0
pvc-9e7744e2-..._senaev-com_data-redpanda-0
pvc-c2d77aca-..._telemetry_vmsingle-vm-stack-victoria-metrics-k8s-stack
pvc-cb11cd65-..._senaev-com_opencode-telegram-git
```

`data-redpanda-0` is extra: Redpanda is no longer in the repo (last references in commits
`4b256c3`, `5c803f5`, `b248df9`). It is an orphaned PVC and is lost in the rebuild, which is
fine. **(B) closed** — data loss accepted.

**Conclusion of Round 1: only hetzner has public IPv6.** The dual-stack rebuild gives:

- hetzner: pod IPv6 egress and inbound VPN over IPv6 — the full goal.
- firstvds, senaev-media, proxmox: pods get only an internal ULA IPv6 address; no change
  for the outside world. Xray instances on these nodes keep the `UseIPv4` and `::/0`
  workarounds.

Open question before the rebuild: is the benefit (one node) worth a cluster rebuild, compared
with a per-pod solution on hetzner (`hostNetwork: true` for `xray-vpn-hetzner`), which gives
the same hetzner result without a rebuild?

### 2026-10-05 — Decision: dual-stack rebuild, IPv6 by default on every node

- firstvds IPv6 costs extra — **not enabled**.
- **Rebuild is confirmed.** Requirement: every node is dual-stack by default, and a node that
  gets public IPv6 later uses it **without a config change**. `hostNetwork` is rejected.

Final design — nothing in the cluster config depends on whether a node has public IPv6:

| Layer | Setting | Why it works on every node |
|---|---|---|
| Node IPs | `--node-ip` / `--node-external-ip` = Tailscale v4 + v6 | Every node has a Tailscale IPv6 (Round 1) |
| Pod/Service CIDRs | `10.42.0.0/16,fd42::/56` / `10.43.0.0/16,fd43::/112` | IPv4 first = primary family |
| Pod egress | `--flannel-ipv6-masq` | Pods leave as the node's public IPv6 when the node has one |
| Overlay MTU | `TS_DEBUG_MTU=1350` | Pod MTU ≥ 1280 on all nodes, so pods keep IPv6 |
| Inbound | Traefik `hostPort` 80/443 | CNI `portmap` also writes ip6tables DNAT |
| Router Advertisements | `accept_ra=2` on the uplink interface | k3s sets `forwarding=1`; with forwarding on, Linux ignores RAs, so a node that gets IPv6 from SLAAC (home router) would get no IPv6 default route. hetzner uses a static route, so it is not affected today |
| Xray | same config on all instances (see below) | — |

Xray (after the rebuild, `_helpers.tpl`): change `domainStrategy` to `UseIPv4v6` and remove the
`::/0` blackhole on **all** instances. Reason: after the rebuild every pod has an IPv6 route.
On a node without public IPv6, the node has no IPv6 default route and answers with ICMPv6
"no route" at once, so the connection fails fast — the same effect as the blackhole.
**Must be verified** on firstvds (UFW `deny (routed)`) and senaev-media: from the xray pod,
`nc -6 -w3 2001:4860:4860::8888 53` must fail in well under 1 s. If it hangs, keep the
blackhole as a per-instance option.

Per-node data that cannot be automatic: `vpn-subscription` VLESS entries with an IPv6 literal
(no AAAA records). Add a `[2a01:4f9:c013:5425::1]:443` entry for hetzner after the rebuild.

Updated rollout:

1. **Deploy A (no rebuild):** `bootstrap-node-networking.sh` — `TS_DEBUG_MTU=1350`,
   `accept_ra=2`. Roll out one node at a time; verify MTU and iperf3.
2. **Rebuild:** script changes (server + worker flags, `check-worker.sh` dual-stack check,
   `flannel-v6.1` check), k3s upgrade to the current stable version, uninstall all nodes,
   `make cluster`, `make services`, Vault init, re-enter secrets.
3. **Deploy B:** xray `UseIPv4v6` + remove blackhole (after the fast-fail test);
   `vpn-subscription` IPv6 entry for hetzner.

### 2026-10-05 — Deploy A code prepared (not committed, not deployed)

`provisioning/common/bootstrap-node-networking.sh` — two new steps, after the BindsTo/udev
binding is verified:

- **(4) accept_ra:** detects the uplink from the IPv4 default route, writes
  `net.ipv6.conf.<uplink>.accept_ra = 2` to `/etc/sysctl.d/90-ipv6-accept-ra.conf`, applies
  and verifies it.
- **(5) Tailscale MTU:** checks that `tailscaled` loads `/etc/default/tailscaled`, writes
  `TS_DEBUG_MTU=1350` (idempotent). Only when `tailscale0` MTU ≠ 1350: restart `tailscaled`,
  wait up to 30 s for the new MTU (exit 1 if it does not apply), restart the k3s unit so
  flannel uses the new MTU, wait up to 60 s for `flannel.1`. A normal deploy restarts nothing.

Expected after the rollout: `tailscale0` mtu 1350, `flannel.1` mtu 1300.

Rollout, one node at a time (start with a home node, end with hetzner, the control plane):

```bash
# Workers: connect-worker.sh runs the worker bootstrap, which runs this script.
# Or run the script alone on a node after rsync:
make rsync   # control plane only; workers get files from scripts/connect-worker.sh
ssh root@<node> "sudo bash <K3S_CLUSTER_PATH>/provisioning/common/bootstrap-node-networking.sh"
```

Verify on each node after it, before the next node:

```bash
cat /sys/class/net/tailscale0/mtu /sys/class/net/flannel.1/mtu      # 1350 / 1300
sysctl net.ipv6.conf.$(ip -4 route show default | awk '{print $5}').accept_ra   # = 2
# MTU path to another node over the tailnet (1322 = 1350 - 28). The other node must already
# be at 1350, so run this from the second node on. Mixed 1280/1350 nodes still work in the
# meantime: TCP negotiates MSS per side.
ping -M do -s 1322 -c 3 <other-node-tailnet-ip>
# Cross-node pod traffic still works, and iperf3-monitor throughput did not drop.
```
