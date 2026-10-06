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

### 2026-10-05 — Deploy A on proxmox: MTU applied, k3s-agent restart failed

`make workers` (first node, proxmox), relevant part:

```
👉 [bootstrap-node-networking] Setting [net.ipv6.conf.vmbr0.accept_ra=2] in [/etc/sysctl.d/90-ipv6-accept-ra.conf]
✅ [bootstrap-node-networking] net.ipv6.conf.vmbr0.accept_ra=2
👉 [bootstrap-node-networking] Writing [TS_DEBUG_MTU=1350] to [/etc/default/tailscaled]
✅ [bootstrap-node-networking] [TS_DEBUG_MTU=1350] written
👉 [bootstrap-node-networking] tailscale0 MTU is 1280, restarting tailscaled to apply 1350
✅ [bootstrap-node-networking] tailscale0 MTU is 1350
👉 [bootstrap-node-networking] Restarting unit=[k3s-agent] so flannel uses the new MTU
Job for k3s-agent.service failed because the control process exited with error code.
See "systemctl status k3s-agent.service" and "journalctl -xeu k3s-agent.service" for details.
make: *** [workers] Error 1
```

- `accept_ra` step: OK (uplink detected as `vmbr0`).
- **`TS_DEBUG_MTU` works** — `tailscale0` came back with mtu 1350. (A) fix confirmed on proxmox.
- `k3s-agent` failed to start right after the restart. The run stopped, so senaev-media and
  firstvds were not touched.

Hypotheses:

**(H) k3s started before tailscale0 had its IP / before tailscaled was Running.** The script
waits only for the MTU, which is set when the interface is created. The tailnet IPv4 comes a
moment later; k3s (`--node-external-ip`, `--flannel-iface=tailscale0`) exits fatally without it.
- `Signal:` journal shows `failed to find interface` / `no IPv4 address` / IP error for
  tailscale0; the unit is `active` now because `Restart=always` retried 5 s later.
- `Fix:` in the script, wait for `tailscale ip -4` and an `inet` address on tailscale0 before
  restarting k3s, and wait for the unit to become `active` instead of failing on the first try.

**(I) BindsTo/udev race.** The udev rule started k3s at the same moment, and the explicit
restart collided with it.
- `Signal:` journal shows two starts within a second, or a dependency error.
- `Fix:` same — wait for tailscale to settle; then `restart` only.

**(J) Unrelated agent failure** (for example a config error after the long uptime).
- `Signal:` the unit is still `failed` / restart loop with the same error.

Round 2 (read-only), on proxmox:

```bash
systemctl status k3s-agent --no-pager | head -15
journalctl -u k3s-agent --since "-15min" --no-pager | grep -vi "level=info" | tail -40
journalctl -u k3s-agent --since "-15min" --no-pager | grep -E "Started|Starting|Stopped|Stopping|Failed|exited" | tail -20
cat /sys/class/net/tailscale0/mtu /sys/class/net/flannel.1/mtu; tailscale ip -4
```

### 2026-10-05 — Round 2 results (proxmox): k3s-agent recovered on its own

(A first run of these commands was by mistake on hetzner: `k3s-agent` not found, mtu
1280/1230, IP `100.120.76.115` = control plane. Ignore it.)

```
● k3s-agent.service - Lightweight Kubernetes
     Loaded: loaded (/etc/systemd/system/k3s-agent.service; enabled; preset: enabled)
    Drop-In: /etc/systemd/system/k3s-agent.service.d
             └─10-tailscale-binding.conf
     Active: active (running) since Mon 2026-10-05 19:32:43 UTC; 1min 54s ago
...
Oct 05 19:32:43 proxmox k3s[1544808]: I1005 19:32:43.930063 1544808 kube.go:704] List of node(proxmox) annotations: map[string]string{"alpha.kubernetes.io/provided-node-ip":"100.87.199.13,fd7a:115c:a1e0::6136:c70d", ... "flannel.alpha.coreos.com/public-ip":"100.87.199.13", ...
Oct 05 19:32:43 proxmox k3s[1544808]: time="2026-10-05T19:32:43Z" level=warning msg="no subnet found for key: FLANNEL_IPV6_NETWORK in file: /run/flannel/subnet.env"
Oct 05 19:32:43 proxmox k3s[1544808]: time="2026-10-05T19:32:43Z" level=warning msg="no subnet found for key: FLANNEL_IPV6_SUBNET in file: /run/flannel/subnet.env"
...
Oct 05 19:32:43 proxmox k3s[1544808]: I1005 19:32:43.940325 1544808 vxlan_network.go:265] Received Subnet Event with VxLan: BackendType: vxlan, PublicIP: 100.90.217.37, ...
Oct 05 19:32:43 proxmox k3s[1544808]: I1005 19:32:43.941804 1544808 vxlan_network.go:265] Received Subnet Event with VxLan: BackendType: vxlan, PublicIP: 100.120.76.115, ...
Oct 05 19:32:43 proxmox k3s[1544808]: I1005 19:32:43.944549 1544808 vxlan_network.go:265] Received Subnet Event with VxLan: BackendType: vxlan, PublicIP: 100.103.254.98, ...
Oct 05 19:32:43 proxmox k3s[1544808]: I1005 19:32:43.950735 1544808 iptables.go:358] bootstrap done
Oct 05 19:32:43 proxmox systemd[1]: Started k3s-agent.service - Lightweight Kubernetes.
1350
1300
100.87.199.13
```

- `k3s-agent` is `active` since 19:32:43 — `Restart=always` retried after the failed start.
- **`tailscale0` = 1350, `flannel.1` = 1300** — Deploy A target state reached on proxmox.
- flannel sees all 3 other nodes' VTEPs.
- The `FLANNEL_IPV6_*` warnings are normal for an IPv4-only cluster.
- k3s already detects the Tailscale IPv6 in `provided-node-ip` (`100.87.199.13,fd7a:…`).

The grep did not filter klog-format lines, so the exact error of the failed start is not in
this output. Both (H) and (I) stay possible; (J) is refuted (the unit runs normally now).

Fix in the script (covers H and I): after the MTU is applied, wait until `tailscale0` has
an IPv4 address, then restart k3s; if the restart reports a failure, wait up to 90 s for the
unit to become `active` (systemd `Restart=always`), and fail only if it does not.

### 2026-10-05 — Round 3: exact error of the failed start — (H) confirmed

```
Oct 05 19:32:20 proxmox k3s[1544717]: time="2026-10-05T19:32:20Z" level=fatal msg="Error: interface tailscale0 does not have a correct global unicast ip: can't find ip for interface tailscale0"
Oct 05 19:32:20 proxmox systemd[1]: k3s-agent.service: Main process exited, code=exited, status=1/FAILURE
Oct 05 19:32:20 proxmox systemd[1]: k3s-agent.service: Failed with result 'exit-code'.
```

**(H) confirmed, (I) refuted:** k3s started while `tailscale0` existed (with the new MTU) but
had no IP yet. systemd restarted it 23 s later (19:32:43) and it came up.

The script fix waits for **both** the IPv4 and a global IPv6 address on `tailscale0`, because
after the rebuild dual-stack flannel needs the IPv6 address at startup too. The tolerant
restart + 90 s `is-active` wait stays as a second safety net.

### 2026-10-05 — Deploy A on all workers: success

`make workers` with the fixed script (key lines):

```
# proxmox (already done) - idempotent, nothing restarted
✅ [bootstrap-node-networking] net.ipv6.conf.vmbr0.accept_ra=2
✅ [bootstrap-node-networking] [TS_DEBUG_MTU=1350] already in [/etc/default/tailscaled]
✅ [bootstrap-node-networking] tailscale0 MTU is 1350, no restart needed
✅ [bootstrap-node-networking] flannel.1 is present (mtu 1300), cross-node pod networking is up

# senaev-media
✅ [bootstrap-node-networking] net.ipv6.conf.eth0.accept_ra=2
👉 [bootstrap-node-networking] tailscale0 MTU is 1280, restarting tailscaled to apply 1350
✅ [bootstrap-node-networking] tailscale0 MTU is 1350
✅ [bootstrap-node-networking] tailscale0 has IPv4 and IPv6 addresses
✅ [bootstrap-node-networking] unit=[k3s-agent] is active
✅ [bootstrap-node-networking] flannel.1 is present (mtu 1300), cross-node pod networking is up

# firstvds
✅ [bootstrap-node-networking] net.ipv6.conf.ens3.accept_ra=2
👉 [bootstrap-node-networking] tailscale0 MTU is 1280, restarting tailscaled to apply 1350
✅ [bootstrap-node-networking] tailscale0 MTU is 1350
✅ [bootstrap-node-networking] tailscale0 has IPv4 and IPv6 addresses
✅ [bootstrap-node-networking] unit=[k3s-agent] is active
✅ [bootstrap-node-networking] flannel.1 is present (mtu 1300), cross-node pod networking is up
✅ [Makefile] Worker nodes connected
```

- All 3 workers: `tailscale0` 1350, `flannel.1` 1300, `accept_ra=2` on the uplink.
- The address wait worked: k3s-agent came up on the **first** start on both nodes (no
  "First start ... failed" warning).
- The re-run on proxmox restarted nothing — the script is idempotent.

Remaining for Deploy A: path MTU test between workers, cross-node pod check, then hetzner
(`make control-plane`).

### 2026-10-05 — Path MTU test: all 4 pings fail locally

```
PING 100.90.217.37 (100.90.217.37) 1322(1350) bytes of data.
ping: sendmsg: Message too long
... (same for 100.87.199.13 at 1350, 10.42.2.0 and 10.42.1.0 at 1300)
3 packets transmitted, 0 received, +3 errors, 100% packet loss
```

`sendmsg: Message too long` is a **local** error: the sending kernel refuses the packet
before it leaves, because the outgoing interface MTU (or a cached path MTU) is smaller than
the packet. It says nothing about the path. Exactly this result is expected on a host where
`tailscale0` is 1280 and `flannel.1` is 1230 — that is **hetzner**, which is not yet changed.
The prompt is not in the paste, so the host is unknown.

Hypotheses:
- **(K) Run on hetzner** (or on another host still at 1280) — most likely.
- **(L) Cached path MTU on senaev-media** from before the change (`ip route get` shows `mtu`
  with a cache entry).

Round 4 (read-only), on **senaev-media**:

```bash
hostname; cat /sys/class/net/tailscale0/mtu /sys/class/net/flannel.1/mtu
ip route get 100.90.217.37; ip route get 10.42.2.0
ping -M do -s 1322 -c 3 100.90.217.37
ping -M do -s 1272 -c 3 10.42.2.0
```

### 2026-10-05 — Round 4 results: path MTU 1350 / 1300 works between workers

```
senaev-media
1350
1300
100.90.217.37 dev tailscale0 table 52 src 100.103.254.98 uid 0
    cache
10.42.2.0 via 10.42.2.0 dev flannel.1 src 10.42.3.0 uid 0
    cache
PING 100.90.217.37 (100.90.217.37) 1322(1350) bytes of data.
1330 bytes from 100.90.217.37: icmp_seq=1 ttl=64 time=66.8 ms
...
3 packets transmitted, 3 received, 0% packet loss, time 2002ms
PING 10.42.2.0 (10.42.2.0) 1272(1300) bytes of data.
1280 bytes from 10.42.2.0: icmp_seq=1 ttl=64 time=63.8 ms
...
3 packets transmitted, 3 received, 0% packet loss, time 2004ms
```

**(K) confirmed** — the previous paste was from a host still at 1280 (hetzner). **(L) refuted**
— no cached `mtu` in `ip route get`. Full-size packets with DF set cross both the tailnet
(1350) and the flannel VXLAN overlay (1300) from senaev-media (home) to firstvds (RU VPS), so
the larger WireGuard packets are not dropped on that internet path. (ping prints the ICMP
size, 1330 / 1280 bytes, which matches 1350 / 1300 IP packets.)

### 2026-10-05 — Cluster health after Deploy A on workers

```
NAME           STATUS   ROLES           AGE    VERSION
firstvds       Ready    <none>          117d   v1.35.2+k3s1
hetzner        Ready    control-plane   150d   v1.35.2+k3s1
proxmox        Ready    <none>          150d   v1.35.2+k3s1
senaev-media   Ready    <none>          150d   v1.35.2+k3s1
NAMESPACE     NAME   READY   STATUS    RESTARTS        AGE
```

All nodes `Ready`; no pod outside `Running` / `Completed`. Workers are done. Next: hetzner
(`make control-plane`).

### 2026-10-05 — Deploy A on hetzner: applied, but 1300-byte flannel ping to senaev-media fails

`make control-plane` (key lines):

```
✅ [bootstrap-node-networking] net.ipv6.conf.eth0.accept_ra=2
👉 [bootstrap-node-networking] tailscale0 MTU is 1280, restarting tailscaled to apply 1350
✅ [bootstrap-node-networking] tailscale0 MTU is 1350
✅ [bootstrap-node-networking] tailscale0 has IPv4 and IPv6 addresses
✅ [bootstrap-node-networking] unit=[k3s] is active
✅ [bootstrap-node-networking] flannel.1 is present (mtu 1300), cross-node pod networking is up
✅ [Makefile] k8s cluster deployed
```

Check on hetzner:

```
1350
1300
PING 10.42.3.0 (10.42.3.0) 1272(1300) bytes of data.

--- 10.42.3.0 ping statistics ---
3 packets transmitted, 0 received, 100% packet loss, time 2055ms

NAME           STATUS   ROLES           AGE    VERSION
firstvds       Ready    <none>          117d   v1.35.2+k3s1
hetzner        Ready    control-plane   150d   v1.35.2+k3s1
proxmox        Ready    <none>          150d   v1.35.2+k3s1
senaev-media   Ready    <none>          150d   v1.35.2+k3s1
```

hetzner is at 1350 / 1300 and all nodes are `Ready` (kubelet ↔ API uses plain tailnet, not
flannel). But the full-size flannel ping hetzner → senaev-media is **silently lost** — not a
local `Message too long`, so the packet left hetzner.

Hypotheses:

**(M) The hetzner ↔ home internet path drops the larger WireGuard packets.** Outer packet =
1350 + 80 (WireGuard/UDP/IPv6 or IPv4 overhead) ≈ 1410–1430 bytes; a tunnel or PPPoE link on
this path may have a lower MTU, while the home → firstvds path did not.
- `Signal:` small flannel ping works; tailnet ping at 1350 to senaev-media fails, at 1280
  works; flannel ping hetzner → firstvds at 1300 works.
- `Fix:` lower `TAILSCALE_MTU` to the largest value that passes on every pair (must stay
  ≥ 1350 for IPv6 pods: 1280 + 70 VXLAN-over-IPv6 overhead) — or, if the path cannot carry
  it, rethink (for example flannel `wireguard-native` instead of VXLAN-over-Tailscale).

**(N) Overlay to senaev-media broken after the k3s restart** (stale FDB/neighbour, like the
2026-08-15 incident).
- `Signal:` small flannel ping (`-s 56`) to `10.42.3.0` also fails.
- `Fix:` restart k3s on hetzner; investigate the FDB.

**(O) Traffic is relayed through DERP**, and DERP has a different size limit.
- `Signal:` `tailscale ping` shows `via DERP(...)`, not a direct address.

Round 5 (read-only), on hetzner:

```bash
ping -c 3 10.42.3.0                                # (N) small, flannel to senaev-media
ping -M do -s 1272 -c 3 10.42.2.0                  # flannel to firstvds, full size
ping -M do -s 1272 -c 3 10.42.1.0                  # flannel to proxmox, full size
ping -M do -s 1322 -c 3 100.103.254.98             # tailnet to senaev-media, 1350
ping -M do -s 1252 -c 3 100.103.254.98             # tailnet to senaev-media, 1280
tailscale ping -c 3 senaev-media                   # (O) direct or DERP
tailscale ping -c 3 proxmox
```

### 2026-10-05 — Round 5 results: hetzner lost the tailnet to BOTH home nodes ⚠️

```
PING 10.42.3.0 (10.42.3.0) 56(84) bytes of data.
3 packets transmitted, 0 received, 100% packet loss, time 2041ms

PING 10.42.2.0 (10.42.2.0) 1272(1300) bytes of data.
1280 bytes from 10.42.2.0: icmp_seq=2 ttl=64 time=18.9 ms
1280 bytes from 10.42.2.0: icmp_seq=3 ttl=64 time=19.4 ms
3 packets transmitted, 2 received, 33.3333% packet loss, time 2002ms

PING 10.42.1.0 (10.42.1.0) 1272(1300) bytes of data.
3 packets transmitted, 0 received, 100% packet loss, time 2056ms

PING 100.103.254.98 (100.103.254.98) 1322(1350) bytes of data.
3 packets transmitted, 0 received, 100% packet loss, time 2027ms

PING 100.103.254.98 (100.103.254.98) 1252(1280) bytes of data.
3 packets transmitted, 0 received, 100% packet loss, time 2039ms

ping "100.103.254.98" timed out
ping "100.103.254.98" timed out
ping "100.103.254.98" timed out
no reply
ping "100.87.199.13" timed out
ping "100.87.199.13" timed out
ping "100.87.199.13" timed out
no reply
```

- hetzner ↔ firstvds: works, even at full size 1300 (first packet lost = neighbour warm-up).
- hetzner ↔ senaev-media and hetzner ↔ proxmox: **nothing passes** — small flannel ping,
  tailnet ping at 1280 (the old MTU), and `tailscale ping` (disco, tiny packets, can fall back
  to DERP) all fail.
- **(M) refuted:** a packet-size problem would not break small packets and disco pings.
- **(N) refuted as the root cause:** the tailnet itself is broken below flannel.
- This is an **outage** of hetzner ↔ home: home pods cannot reach the API/hetzner pods, and
  the nodes will turn `NotReady` (the earlier `Ready` was within the grace period).

Timeline: the second `make workers` reached proxmox and senaev-media **through** hetzner
(`ssh -J` hetzner → MagicDNS name) after both had restarted tailscaled, so hetzner ↔ home
worked then. It broke when hetzner's own `tailscaled` restarted (`make control-plane`).

New hypotheses:

**(P) Home nodes did not learn hetzner's new disco key / endpoints.** Each tailscaled restart
creates a new disco key; peers get it from the coordination server. If the home nodes keep
a stale view, every path to hetzner (direct and DERP) fails, while firstvds updated fine.
- `Signal:` on senaev-media, `tailscale status` shows hetzner as `offline` / idle, or
  `tailscale ping hetzner` also fails; hetzner's `tailscale status` shows the home peers with
  no `direct`/`relay` path.
- `Fix:` restart tailscaled on one home node (it fetches a fresh netmap) and re-test.

**(Q) Something in the hetzner change breaks the path to home only** (TS_DEBUG_MTU, or
`accept_ra=2` adding an IPv6 route that tailscale now prefers for the home endpoints).
- `Signal:` `ip -6 route` on hetzner has a new `proto ra` route; tailscaled log shows
  endpoint/DERP errors for the home peers.
- `Fix:` revert that change on hetzner.

Round 6 (read-only):

```bash
# --- on hetzner ---
kubectl get nodes
tailscale status | grep -E "senaev-media|proxmox|firstvds"
tailscale netcheck
ip -6 route
journalctl -u tailscaled --since "-30min" --no-pager | grep -iE "derp|magicsock|disco|endpoint|error|fail" | tail -30

# --- on senaev-media (from the Mac or the home LAN) ---
tailscale status | grep -E "hetzner|firstvds"
tailscale ping -c 3 hetzner
```

Emergency rollback (only if service must come back before diagnosis; it also restarts
tailscaled, so it does not cleanly test (Q)) — on hetzner:

```bash
sed -i '/^TS_DEBUG_MTU=/d' /etc/default/tailscaled && systemctl restart tailscaled
```

### 2026-10-05 — Round 6 results (hetzner): proxmox recovered, senaev-media is OFFLINE

```
NAME           STATUS     ROLES           AGE    VERSION
firstvds       Ready      <none>          117d   v1.35.2+k3s1
hetzner        Ready      control-plane   150d   v1.35.2+k3s1
proxmox        Ready      <none>          150d   v1.35.2+k3s1
senaev-media   NotReady   <none>          150d   v1.35.2+k3s1
100.90.217.37    firstvds      andrei.senaev@  linux  active; direct 157.22.197.112:41641, tx 3967028 rx 2113290
100.87.199.13    proxmox       andrei.senaev@  linux  active; direct 46.48.65.87:1039, tx 1789254 rx 922930
100.103.254.98   senaev-media  andrei.senaev@  linux  active; relay "waw"; offline, last seen 14m ago, tx 128052 rx 10860

Report:
	* UDP: true
	* IPv4: yes, 77.42.120.71:52933
	* IPv6: yes, [2a01:4f9:c013:5425::1]:52690
	* MappingVariesByDestIP: false
	* Nearest DERP: Warsaw
	...
2a01:4f9:c013:5425::/64 dev eth0 proto kernel metric 256 pref medium
fd7a:115c:a1e0::6936:4c73 dev tailscale0 proto kernel metric 256 pref medium
fe80::/64 dev eth0 proto kernel metric 256 pref medium
fe80::/64 dev tailscale0 proto kernel metric 256 pref medium
fe80::/64 dev flannel.1 proto kernel metric 256 pref medium
default via fe80::1 dev eth0 metric 1024 onlink pref medium

Oct 05 19:44:22 hetzner tailscaled[2749091]: magicsock: endpoints changed: 77.42.120.71:41641 (stun), [2a01:4f9:c013:5425::1]:41641 (stun), 10.42.0.0:41641 (local), 10.42.0.1:41641 (local)
Oct 05 19:44:23 hetzner tailscaled[2749091]: magicsock: disco: node [ZTFNe] d:41c5060a55b2168f now using 157.22.197.112:41641 mtu=1360 tx=3cc1615df96c
Oct 05 19:47:16 hetzner tailscaled[2749091]: ping(100.103.254.98): sending disco ping to [IDGWw] senaev-media ...
Oct 05 19:47:31 hetzner tailscaled[2749091]: ping(100.87.199.13): sending disco ping to [QP0HL] proxmox ...
Oct 05 19:49:09 hetzner tailscaled[2749091]: magicsock: disco: node [QP0HL] d:96ced08b4f17e497 now using 46.48.65.87:1039 mtu=1360 tx=d09f1221f667
Oct 05 19:49:09 hetzner tailscaled[2749091]: magicsock: new contact: peer=[QP0HL] usec=300956304 cached=false via=direct
...
```

Interpretation:

- **hetzner is healthy:** UDP, IPv4 and IPv6 work; direct path to firstvds; **direct path to
  proxmox again since 19:49:09** (the 19:47 `tailscale ping` failure was before that), and
  proxmox is `Ready`. The disco path MTU to both peers is `mtu=1360`, so the new MTU is
  negotiated fine.
- No `proto ra` route on hetzner → `accept_ra=2` changed nothing there. **(Q) refuted.**
- **senaev-media is `offline, last seen 14m ago`** — "offline" is the coordination server's
  view, so senaev-media's `tailscaled` has no control connection at all. The fault is on
  senaev-media itself, not on hetzner. **(P) refuted** (hetzner has its keys; the peer is
  simply gone). senaev-media is `NotReady`.
- Last seen ≈ 19:38, which is near its own Deploy A run (tailscaled + k3s-agent restart) and
  the Round 4 ping, i.e. **before** hetzner was changed.

New hypotheses for senaev-media:

**(R) The VM hangs or is out of memory** after the k3s-agent restart (all pods restarted at
once on the media node).
- `Signal:` `qm status` running but no ping/SSH on the LAN; console shows OOM / hung tasks.

**(S) senaev-media lost its uplink** (eth0 / DHCP / default route), so tailscaled cannot reach
the coordination server. `accept_ra=2` on eth0 is the only network change on the host.
- `Signal:` LAN ping works, but `ping 1.1.1.1` fails or the routes are wrong; or an RA from the
  home router created an IPv6 default route with no global address.

**(T) tailscaled on senaev-media crashed or is in a restart loop.**
- `Signal:` `systemctl status tailscaled` not active; errors in its journal.

Round 7 — senaev-media is reachable only over the home LAN, so go through proxmox:

```bash
# --- on proxmox ---
qm list
ip neigh show dev vmbr0
# find the senaev-media VM id and LAN IP, then:
qm status <vmid>
ping -c 3 <senaev-media-lan-ip>

# --- on senaev-media, via:  ssh -J root@proxmox root@<senaev-media-lan-ip> ---
#     (if SSH fails: qm terminal <vmid>  or the Proxmox web console)
uptime; free -m
systemctl status tailscaled --no-pager | head -12
journalctl -u tailscaled --since "-40min" --no-pager | tail -40
ip -4 route; ip -6 route
ping -c 3 1.1.1.1
curl -sS -m 5 -o /dev/null -w "%{http_code}\n" https://controlplane.tailscale.com/
journalctl -k --since "-40min" --no-pager | grep -iE "oom|killed process|hung" | tail -10
```

### 2026-10-05 — Round 7 results: senaev-media tailscaled had no control connection for 16 min

proxmox:

```
      VMID NAME                 STATUS     MEM(MB)    BOOTDISK(GB) PID
       100 senaev-media         running    4096              35.00 1454
192.168.8.136 lladdr bc:24:11:bf:88:aa REACHABLE
status: running
64 bytes from 192.168.8.136: icmp_seq=1 ttl=64 time=0.179 ms   (3/3 received)
```

senaev-media:

```
 19:54:29 up 49 days,  5:50,  1 user,  load average: 2.03, 0.57, 0.27
Mem:            3917        1535         133          70        2594        2381
● tailscaled.service - Tailscale node agent
    Drop-In: /etc/systemd/system/tailscaled.service.d
             └─override.conf
     Active: active (running) since Mon 2026-10-05 19:37:33 UTC; 16min ago
     Status: "Connected; andrei.senaev@gmail.com; 100.103.254.98 fd7a:115c:a1e0::3f36:fe63"
Oct 05 19:53:56 senaev-media tailscaled[370835]: derphttp.Client.Recv: connecting to derp-26 (nue)
Oct 05 19:53:59 senaev-media tailscaled[370835]: open-conn-track: timeout opening (TCP 100.103.254.98:39026 => 100.120.76.115:6443) to node [QjnZr]; online=yes, lastRecv=4s
Oct 05 19:54:01 senaev-media tailscaled[370835]: magicsock: [0xf3d45914b00] derp.Recv(derp-26): derphttp.Client.Recv connect to region 26 (nue): context deadline exceeded
Oct 05 19:54:06 senaev-media tailscaled[370835]: control: lite map update error after 28.356s: Post "https://controlplane.tailscale.com/machine/map": read tcp 192.168.8.136:55976->192.200.0.112:80: read: connection timed out
Oct 05 19:54:07 senaev-media tailscaled[370835]: Received error: PollNetMap: Post "https://controlplane.tailscale.com/machine/map": read tcp 192.168.8.136:55976->192.200.0.112:80: read: connection timed out
Oct 05 19:54:07 senaev-media tailscaled[370835]: control: controlhttp: forcing port 443 dial due to recent noise dial
Oct 05 19:54:07 senaev-media tailscaled[370835]: control: netmap: got new dial plan from control
Oct 05 19:54:07 senaev-media tailscaled[370835]: nodeBackend: peer [ZTFNe] disco key changed from "discokey:38611d3a…" to "discokey:41c5060a…"
Oct 05 19:54:07 senaev-media tailscaled[370835]: nodeBackend: peer [QjnZr] disco key changed from "discokey:fc099d87…" to "discokey:6b13fd9b…"
Oct 05 19:54:07 senaev-media tailscaled[370835]: health(warnable=mapresponse-timeout): ok
Oct 05 19:54:07 senaev-media tailscaled[370835]: magicsock: disco: node [QP0HL] d:96ced08b4f17e497 now using 192.168.8.157:41641 mtu=1360 tx=a910965c0f10
Oct 05 19:54:08 senaev-media tailscaled[370835]: magicsock: disco: node [ZTFNe] d:41c5060a55b2168f now using 157.22.197.112:41641 mtu=1360 tx=167f89e61710
Oct 05 19:54:09 senaev-media tailscaled[370835]: magicsock: disco: node [QjnZr] d:6b13fd9b99e8999f now using 77.42.120.71:41641 mtu=1360 tx=c9ed77e9dd97
Oct 05 19:54:09 senaev-media tailscaled[370835]: magicsock: new contact: peer=[QjnZr] usec=995801948 cached=false via=direct
Oct 05 19:54:23 senaev-media tailscaled[370835]: magicsock: derp.Send(127.3.3.40:26): derphttp.Client.Send connect to region 26 (nue): dial tcp6 [2a01:4f8:1c1c:47b6::1]:443: connect: network is unreachable
default via 192.168.8.1 dev eth0 proto dhcp src 192.168.8.136 metric 100
...
fd7a:115c:a1e0::3f36:fe63 dev tailscale0 proto kernel metric 256 pref medium
fe80::/64 dev eth0 proto kernel metric 256 pref medium
...
64 bytes from 1.1.1.1: icmp_seq=1 ttl=55 time=24.8 ms   (3/3 received)
302
(no OOM / hung-task lines)
```

Interpretation:

- **(R) refuted:** the VM runs, up 49 days, no OOM, memory available 2.4 GB.
- **(S) refuted:** IPv4 uplink works (`ping 1.1.1.1`, `curl` → 302). No IPv6 default route —
  `accept_ra=2` changed nothing (the home router sends no usable RA).
- **(T) refuted:** tailscaled runs since 19:37:33 (its Deploy A restart) and did not crash.
- **Root cause: after its restart, senaev-media's tailscaled could not keep a control
  connection.** The long-poll to `controlplane.tailscale.com` stalled (`read: connection
  timed out` on port 80), and DERP `nue` TLS connects hit `context deadline exceeded`, while
  short requests (ping, `curl` 302) pass. So it ran with its old netmap. When hetzner
  restarted at 19:44 with a **new disco key**, senaev-media did not learn it, and every path
  to hetzner failed. At 19:54:07 a dial on port 443 succeeded, the netmap arrived (disco keys
  for hetzner `[QjnZr]` and firstvds `[ZTFNe]` updated), and at 19:54:09 senaev-media had a
  **direct path to hetzner** (`77.42.120.71:41641 mtu=1360`).
- The pattern — short TCP flows work, long-lived/large TCP flows to foreign hosting (Tailscale
  control, Hetzner-hosted DERP) freeze — matches the home ISP's DPI behaviour already seen in
  `issues/2026-06-10-debug-vpn-connection.md`. This is a hypothesis; it is not proved here.
- proxmox (same home network) had the same short gap (no reply at 19:47, direct at 19:49).
- **Not caused by the MTU or accept_ra settings** — the data path uses `mtu=1360` on all
  peers once the keys are known. The trigger is the **tailscaled restart** on a node whose
  control connection is unreliable, followed by a peer restart before it re-synced.

Lesson for the scripts: after a tailscaled restart, verify that the node can actually reach
the control plane peer over the tailnet (`tailscale ping` the control plane), and before
restarting the next node, verify that every peer sees the restarted node with a path. The
rebuild itself does not restart tailscaled, so it is not affected.

Round 8 — confirm recovery, on hetzner:

```bash
kubectl get nodes
tailscale status | grep -E "senaev-media|proxmox|firstvds"
tailscale ping -c 3 senaev-media
ping -M do -s 1272 -c 3 10.42.3.0
ping -M do -s 1272 -c 3 10.42.1.0
kubectl get pods -A | grep -vE "Running|Completed"
```

### 2026-10-05 — Round 8 results: cluster recovered, Deploy A complete

```
NAME           STATUS   ROLES           AGE    VERSION
firstvds       Ready    <none>          117d   v1.35.2+k3s1
hetzner        Ready    control-plane   150d   v1.35.2+k3s1
proxmox        Ready    <none>          150d   v1.35.2+k3s1
senaev-media   Ready    <none>          150d   v1.35.2+k3s1
100.90.217.37    firstvds      andrei.senaev@  linux  active; direct 157.22.197.112:41641, tx 11372156 rx 3440658
100.87.199.13    proxmox       andrei.senaev@  linux  active; direct 46.48.65.87:1039, tx 3293810 rx 2390008
100.103.254.98   senaev-media  andrei.senaev@  linux  active; direct 46.48.65.87:41641, tx 4382318 rx 1894590
pong from senaev-media (100.103.254.98) via 46.48.65.87:41641 in 65ms
PING 10.42.3.0 (10.42.3.0) 1272(1300) bytes of data.
1280 bytes from 10.42.3.0: icmp_seq=1 ttl=64 time=66.3 ms
ping: sendmsg: Message too long
ping: sendmsg: Message too long
3 packets transmitted, 1 received, +2 errors, 66.6667% packet loss, time 2030ms
PING 10.42.1.0 (10.42.1.0) 1272(1300) bytes of data.
1280 bytes from 10.42.1.0: icmp_seq=1 ttl=64 time=67.1 ms
... 3 packets transmitted, 3 received, 0% packet loss
NAMESPACE     NAME   READY   STATUS    RESTARTS        AGE
```

- All nodes `Ready`, all peers `direct`, all pods healthy. **The outage is over.**
- Full-size flannel to proxmox: 3/3. To senaev-media: the **first 1300-byte packet passed**,
  then the kernel refused the next two locally (`Message too long`). That means hetzner
  lowered its cached path MTU for `10.42.3.0` right after the first packet — most likely a
  path-MTU exception learned during the outage (traffic via DERP / stale path). It expires
  after 10 min (`net.ipv4.route.mtu_expires` = 600 s). Not a blocker: the first packet
  proves the 1300 path works.
- Check later: `ip route get 10.42.3.0` (look for `mtu` / `expires`), then repeat the ping.

**Deploy A result:** `tailscale0` 1350 / `flannel.1` 1300 / `accept_ra=2` on all 4 nodes.

### 2026-10-05 — Cached path MTU 1180 to senaev-media is refreshed, not expiring

On hetzner, ~12 min after Round 8:

```
ip route get 10.42.3.0
10.42.3.0 via 10.42.3.0 dev flannel.1 src 10.42.0.0 uid 0
    cache expires 288sec mtu 1180
ping -M do -s 1272 -c 3 10.42.3.0
ping: sendmsg: Message too long   (x3)
3 packets transmitted, 0 received, +3 errors, 100% packet loss
```

- `expires 288sec` < 600 s, so the exception was **renewed** recently — a live source keeps
  reporting a smaller path MTU. My "stale entry from the outage" guess is wrong.
- `1180 = 1230 − 50` (VXLAN overhead). The kernel propagates the outer path MTU of the VXLAN
  tunnel into the inner route, so hetzner probably believes the **outer** path to
  `100.103.254.98` over `tailscale0` is only **1230**, although `tailscale0` is 1350 and the
  first 1300-byte flannel ping (outer 1350) did pass in Round 8.
- Only senaev-media is affected; proxmox (same home uplink) passed 3/3 at 1300.

Why it matters: IPv4 TCP adapts to 1180, so traffic works. But for dual-stack, IPv6 over
this path needs outer 1350 (1280 + 70); IPv6 cannot go below 1280, so a real 1230 limit
would break IPv6 pod traffic to senaev-media.

Hypotheses:

**(U) Something on senaev-media / its path returns ICMP "fragmentation needed" with MTU 1230.**
For example a stale MTU on a senaev-media interface or VM NIC, or tailscaled on one side
generating "packet too big" from an old per-peer MTU.
- `Signal:` `ip route get 100.103.254.98` on hetzner shows `mtu 1230`; tailscaled log shows
  MTU/PMTU lines; the reverse ping from senaev-media also fails.

**(V) The real hetzner → home path carries less than 1350 inside WireGuard for this peer.**
- `Signal:` tailnet ping at 1350 fails, at 1252 passes, also after the cache expires.

Round 9 (read-only):

```bash
# --- on hetzner ---
ip route get 100.103.254.98
ping -M do -s 1322 -c 3 100.103.254.98
ping -M do -s 1202 -c 3 100.103.254.98
tracepath -n 10.42.3.0
journalctl -u tailscaled --since "-20min" --no-pager | grep -iE "mtu|too big|frag" | tail -20

# --- on senaev-media (via proxmox) ---
cat /sys/class/net/eth0/mtu /sys/class/net/tailscale0/mtu /sys/class/net/flannel.1/mtu /sys/class/net/cni0/mtu
ip route get 10.42.0.0; ip route get 100.120.76.115
ping -M do -s 1272 -c 3 10.42.0.0
ping -M do -s 1322 -c 3 100.120.76.115
```

### 2026-10-05 — Round 9 results: the path is fine; stale `cni0` MTU 1230 on senaev-media

hetzner:

```
100.103.254.98 dev tailscale0 table 52 src 100.120.76.115 uid 0
    cache
PING 100.103.254.98 (100.103.254.98) 1322(1350) bytes of data.
1330 bytes from 100.103.254.98: icmp_seq=1 ttl=64 time=66.7 ms   (3/3 received)
PING 100.103.254.98 (100.103.254.98) 1202(1230) bytes of data.
1210 bytes from 100.103.254.98: icmp_seq=1 ttl=64 time=66.4 ms   (3/3 received)
zsh: command not found: tracepath
Oct 05 19:54:09 hetzner tailscaled[2749091]: magicsock: disco: node [IDGWw] d:fabb30ab9f3c1181 now using 46.48.65.87:41641 mtu=1360 tx=f953a0726dfc
```

senaev-media:

```
1500      (eth0)
1350      (tailscale0)
1300      (flannel.1)
1230      (cni0)
10.42.0.0 via 10.42.0.0 dev flannel.1 src 10.42.3.0 uid 0
    cache
100.120.76.115 dev tailscale0 table 52 src 100.103.254.98 uid 0
    cache
PING 10.42.0.0 (10.42.0.0) 1272(1300) bytes of data.
1280 bytes from 10.42.0.0: icmp_seq=1 ttl=64 time=67.1 ms   (3/3 received)
PING 100.120.76.115 (100.120.76.115) 1322(1350) bytes of data.
1330 bytes from 100.120.76.115: icmp_seq=1 ttl=64 time=68.8 ms   (3/3 received)
```

- **(V) refuted:** the tailnet carries 1350 in **both** directions between hetzner and
  senaev-media, and the flannel overlay carries 1300 from senaev-media to hetzner. No outer
  PMTU exception for `100.103.254.98`. tailscale path `mtu=1360`.
- **New finding: `cni0` on senaev-media is still 1230** — the old flannel MTU. Pods that were
  created before Deploy A keep their veth MTU (1230) until they are recreated, and the
  bridge takes the smallest port MTU. Traffic from hetzner to those pods that is larger than
  1230 is refused on senaev-media with ICMP "fragmentation needed", which is the most likely
  live source of the renewed PMTU exception on hetzner. (The exact value 1180 on the
  `10.42.3.0` entry is not fully explained.) The other nodes most probably have the same
  stale `cni0` MTU.
- **(U) partly confirmed** (the source is on senaev-media), but it is a consequence of
  changing the MTU on a running cluster, not a path or config problem.

Impact: none for IPv4 now (TCP adapts). The rebuild recreates every pod with the new flannel
MTU (IPv4 1300, IPv6 1280), so this goes away by itself. To fix it without the rebuild,
restart the pods on each node.

Optional check: on senaev-media `ip -o link show | grep -oE "(cni0|veth[^:@]*).*mtu [0-9]+" | grep -oE "^[^:@ ]+|mtu [0-9]+"`; on hetzner
`ip route flush cache; ping -M do -s 1272 -c 3 10.42.3.0`.

### 2026-10-06 — Rebuild code prepared (not committed)

Target version: **k3s `v1.36.5+k3s1`** (current `stable` channel; `latest` is v1.37.1).
Release notes v1.36.0–v1.36.5 checked: no removed or renamed flag that we use. The Traefik
chart warning does not apply (bundled Traefik is disabled). v1.36.0 includes "Fix SANs added
from comma-separated node-external-ip list" — not relevant any more, see below.

Decision with the user: **no node IP is hard-coded.** The proxmox journal (Round 2) showed
`provided-node-ip: "100.87.199.13,fd7a:115c:a1e0::6136:c70d"` without `--node-ip`, so k3s
already takes both node IPs from `--flannel-iface=tailscale0` on every start. Removed:
`--advertise-address`, `--node-external-ip`, `--flannel-external-ip` (flannel uses the
`tailscale0` address anyway; nothing in the repo reads the node `ExternalIP`). A changed
tailnet IP now needs only a k3s restart, except on hetzner, whose IPv4 is the workers'
`K3S_URL`.

Changes:

| File | Change |
|---|---|
| `provisioning/common/.env` | `K3S_VERSION=v1.36.5+k3s1`, new `K3S_CLUSTER_CIDR`, `K3S_SERVICE_CIDR` |
| `provisioning/common/check-tailscale-dual-stack.sh` (new) | Fail before install when `tailscale0` lacks IPv4 or global IPv6 |
| `provisioning/control-plane/bootstrap-control-plane.sh` | `--cluster-cidr`, `--service-cidr`, `--flannel-ipv6-masq`; removed fixed IPs; on an installed server: **fail** if its cluster-cidr differs (needs rebuild), warn on version mismatch |
| `provisioning/worker/bootstrap-worker.sh` | Removed fixed IPs; dual-stack precondition before install |
| `provisioning/worker/check-worker.sh` | Fail on k3s version mismatch → reinstall. (Dual-stack is server-side; after the rebuild the new token makes every old worker fail `NODE_TOKEN` anyway.) |
| `provisioning/common/bootstrap-node-networking.sh` | Report `flannel-v6.1` |
| `AGENTS.md` | One line about dual-stack and the CIDRs |

Consequence: until the rebuild, `make control-plane` (and `make` / `make cluster`) stops with
the cluster-cidr error. This is intended.

## Rebuild runbook

Expected downtime: about 1–2 h. Data loss accepted: Vault, all local-path PVCs.

1. **Before:** commit and push the changes. Save anything you want from Vault. Note the
   current Grafana/alert setup if needed.
2. **Uninstall workers** (each, from the Mac):
   `ssh -J root@77.42.120.71 root@<worker> '/usr/local/bin/k3s-agent-uninstall.sh'`
   for proxmox, senaev-media, firstvds. Order does not matter much, because the server and
   all its state are deleted in the next step.
3. **Uninstall the server:** `ssh root@77.42.120.71 '/usr/local/bin/k3s-uninstall.sh'`
   — this deletes `/var/lib/rancher/k3s` including all PVCs.
4. **Recreate the cluster:** `make cluster` (control plane, then all workers; workers fail
   `NODE_TOKEN`/version and reinstall).
5. **Verify dual-stack before services:**

   ```bash
   kubectl get nodes -o wide
   kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name} {.spec.podCIDRs} {.status.addresses}{"\n"}{end}'
   kubectl get endpoints kubernetes          # must be 100.120.76.115:6443 (tailnet IPv4)
   # on every node:
   ip -d link show flannel-v6.1 | head -3    # mtu 1280, parent tailscale0
   cat /sys/class/net/flannel.1/mtu          # 1300
   ```

6. **Services:** `make services` (Traefik, secrets, telemetry, Datadog, senaev-com, test).
   `bootstrap-vault.sh` initializes a new Vault and sends the new root token to Telegram;
   re-enter the secrets in `senaev-com-kv`, then restart/resync External Secrets.
7. **Verify** (see `## Verification`), plus: a test pod on each node has both addresses;
   `ping6` between pods on different nodes; from a hetzner pod `curl -6 https://ifconfig.co`
   returns `2a01:4f9:c013:5425::1`; from a firstvds pod an IPv6 connection fails fast.
8. **Deploy B** (separate change): xray `UseIPv4v6` + remove the `::/0` blackhole after the
   fast-fail test; `vpn-subscription` IPv6 entry for hetzner.

Follow-ups before the rebuild:
1. ~~Commit the script fix (address wait + tolerant k3s restart).~~ Done in `01a4f3a`.
2. Optional hardening: after a tailscaled restart, wait until `tailscale ping` to the control
   plane (or, on the control plane, to every worker) succeeds before restarting k3s.

### 2026-10-06 — Safer worker rollout (replaces "Rebuild runbook" steps 2 and 4)

After the 2026-10-05 outage, `AGENTS.md` got a "Sensitive nodes" section: proxmox and
senaev-media cannot be recovered without the tailnet. Changes:

- `a4ff37b` — `bootstrap-worker.sh` never restarts `tailscaled`; it waits up to 5 min for the
  control plane, and both this check and the tailnet dual-stack check run **before** the old
  agent is uninstalled, so a failure leaves the node unchanged.
- `scripts/connect-all-workers.sh` removed. `scripts/connect-worker.sh <address> <vps>` now
  fetches the token and API URL itself, and at the end verifies that the node is still
  reachable over SSH through hetzner.
- `Makefile`: `make worker-firstvds`, `make worker-proxmox`, `make worker-senaev-media`;
  `make workers` runs them in that order (non-sensitive node first).

Old agents do not need a manual uninstall: after the rebuild, `check-worker.sh` fails on the
old token / version, and `bootstrap-worker.sh` reinstalls the agent. Old agents cannot join the
new cluster by mistake (old token).

## Rebuild runbook v2

1. **Before:** optional Vault KV backup to `~/tmp` (delete after restoring). Read-only check
   that all nodes are `Ready` and all peers `direct`.
2. **Uninstall the server:** `ssh root@77.42.120.71 '/usr/local/bin/k3s-uninstall.sh'`.
   From here there is no rollback to the old cluster. Old agents keep running, disconnected.
3. **New server:** `make control-plane`. Check `kubectl get nodes`, `ip link show flannel-v6.1`.
4. **firstvds:** `make worker-firstvds`. Check the node `Ready` and its pod CIDRs.
5. **proxmox** (sensitive — explicit go from the user): `make worker-proxmox`. Check
   `tailscale status` on hetzner shows proxmox `direct`, node `Ready`.
6. **senaev-media** (sensitive — explicit go from the user): `make worker-senaev-media`. Same
   checks.
7. Dual-stack verification (Rebuild runbook step 5), then `make services`, Vault init,
   re-enter secrets, verification (step 7), then Deploy B.

### 2026-10-06 — Rebuild step 1: pre-check passed

```
NAME           STATUS   ROLES           AGE    VERSION
firstvds       Ready    <none>          117d   v1.35.2+k3s1
hetzner        Ready    control-plane   150d   v1.35.2+k3s1
proxmox        Ready    <none>          150d   v1.35.2+k3s1
senaev-media   Ready    <none>          150d   v1.35.2+k3s1
NAMESPACE     NAME   READY   STATUS    RESTARTS        AGE
100.90.217.37    firstvds      andrei.senaev@  linux  active; direct 157.22.197.112:41641, tx 1539414290 rx 1379798860
100.87.199.13    proxmox       andrei.senaev@  linux  active; direct 46.48.65.87:1039, tx 67306840 rx 189923896
100.103.254.98   senaev-media  andrei.senaev@  linux  active; direct 46.48.65.87:41641, tx 151832132 rx 1772092260
```

All nodes `Ready`, no unhealthy pods, all peers `direct`. Ready for the server uninstall.

Vault facts for the backup: one KV v2 mount `kv`, one secret `senaev-com-kv` (the only
`remoteRef.key` in the charts). The old root token is in `/k3s-cluster/vault_unseal_key.json`
on hetzner — outside `/var/lib/rancher`, so it survives the uninstall, but
`bootstrap-vault.sh` **overwrites** it when it initializes the new Vault.

### 2026-10-06 — Vault KV backed up

The user backed up `kv/senaev-com-kv` to `/root/vault-senaev-com-kv.json` on hetzner (mode
600; `/root` is not touched by `k3s-uninstall.sh`). Restore after `make services`:

```bash
NEW_TOKEN=$(jq -r .root_token /k3s-cluster/vault_unseal_key.json)
kubectl exec -i -n vault vault-0 -- env VAULT_TOKEN="$NEW_TOKEN" \
  vault kv put kv/senaev-com-kv - < /root/vault-senaev-com-kv.json
rm /root/vault-senaev-com-kv.json
```

### 2026-10-06 — Rebuild steps 2–3: server uninstalled, new dual-stack server up

(The output of `k3s-uninstall.sh` and `make control-plane` was not pasted.)

```
NAME      STATUS   ROLES           AGE    VERSION        INTERNAL-IP      EXTERNAL-IP   OS-IMAGE                       KERNEL-VERSION                        CONTAINER-RUNTIME
hetzner   Ready    control-plane   114s   v1.36.5+k3s1   100.120.76.115   <none>        Debian GNU/Linux 13 (trixie)   6.12.74+deb13+1-cloud-amd64 (amd64)   containerd://2.3.4-k3s1.36
hetzner ["10.42.0.0/24","fd42::/64"]
601: flannel-v6.1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1280 qdisc noqueue state UNKNOWN mode DEFAULT group default
    vxlan id 1 local fd7a:115c:a1e0::6936:4c73 dev tailscale0 srcport 0 0 dstport 8472 ttl auto ageing 300 nolearning ...
1300
1280
NAME         ENDPOINTS             AGE
kubernetes   100.120.76.115:6443   117s
```

- k3s `v1.36.5+k3s1`, node `Ready`.
- **Dual-stack confirmed:** pod CIDRs `10.42.0.0/24` + `fd42::/64`.
- `flannel-v6.1` exists, MTU **1280** (the IPv6 minimum — exactly as designed with
  `tailscale0` 1350), VXLAN over `tailscale0` from the Tailscale IPv6 address.
- `flannel.1` MTU 1300.
- API endpoint stays the tailnet IPv4 without `--advertise-address`. `EXTERNAL-IP` is
  `<none>` as expected (no `--node-external-ip`).

### 2026-10-06 — Rebuild step 4: firstvds joined

```
NAME       STATUS   ROLES           AGE     VERSION        INTERNAL-IP      EXTERNAL-IP   ...
firstvds   Ready    <none>          25s     v1.36.5+k3s1   100.90.217.37    <none>        ...
hetzner    Ready    control-plane   4m47s   v1.36.5+k3s1   100.120.76.115   <none>        ...
firstvds ["10.42.1.0/24","fd42:0:0:1::/64"]
hetzner ["10.42.0.0/24","fd42::/64"]
PING 10.42.1.0 (10.42.1.0) 56(84) bytes of data.
64 bytes from 10.42.1.0: icmp_seq=1 ttl=64 time=22.8 ms   (3/3 received)
PING fd42:0:0:1:: (fd42:0:0:1::) 56 data bytes
64 bytes from fd42:0:0:1::: icmp_seq=1 ttl=64 time=18.9 ms   (3/3 received)
```

firstvds `Ready` on v1.36.5 with both pod CIDRs. **First cross-node IPv6 pod-network traffic
works** (hetzner → firstvds over `flannel-v6.1`), IPv4 overlay too. The new bootstrap
(no tailscaled restart, checks before uninstall) worked on its first real run.

### 2026-10-06 — Rebuild step 5: proxmox joined, tailnet intact

```
100.87.199.13    proxmox       andrei.senaev@  linux  active; direct 46.48.65.87:1039, tx 70635032 rx 192843160
100.103.254.98   senaev-media  andrei.senaev@  linux  active; direct 46.48.65.87:41641, tx 156899840 rx 1776997044
firstvds ["10.42.1.0/24","fd42:0:0:1::/64"]
hetzner ["10.42.0.0/24","fd42::/64"]
proxmox ["10.42.2.0/24","fd42:0:0:2::/64"]
PING 100.87.199.13 (100.87.199.13) 56(84) bytes of data.
64 bytes from 100.87.199.13: icmp_seq=1 ttl=64 time=66.0 ms   (3/3 received)
```

proxmox joined with both pod CIDRs; its tailnet path is still `direct` and the tailnet IP
answers. senaev-media is untouched and still `direct`.

Pod network hetzner → proxmox:

```
PING 10.42.2.0 (10.42.2.0) 56(84) bytes of data.
64 bytes from 10.42.2.0: icmp_seq=1 ttl=64 time=66.1 ms   (3/3 received)
PING fd42:0:0:2:: (fd42:0:0:2::) 56 data bytes
64 bytes from fd42:0:0:2::: icmp_seq=1 ttl=64 time=66.1 ms   (3/3 received)
PING fd42:0:0:2:: (fd42:0:0:2::) 1232 data bytes
1240 bytes from fd42:0:0:2::: icmp_seq=1 ttl=64 time=67.6 ms   (3/3 received)
```

**Full-size 1280-byte IPv6 packets with DF cross hetzner → home over the overlay.** This
confirms the whole MTU design (tailscale0 1350 → flannel-v6.1 1280) on the most difficult
path. proxmox is done.

### 2026-10-06 — Rebuild step 6: senaev-media joined — all 4 nodes dual-stack

```
100.103.254.98   senaev-media  andrei.senaev@  linux  active; direct 46.48.65.87:41641, tx 158697916 rx 1778218786
firstvds ["10.42.1.0/24","fd42:0:0:1::/64"]
hetzner ["10.42.0.0/24","fd42::/64"]
proxmox ["10.42.2.0/24","fd42:0:0:2::/64"]
senaev-media ["10.42.3.0/24","fd42:0:0:3::/64"]
PING 10.42.3.0 (10.42.3.0) 56(84) bytes of data.
64 bytes from 10.42.3.0: icmp_seq=1 ttl=64 time=69.4 ms   (3/3 received)
PING fd42:0:0:3:: (fd42:0:0:3::) 56 data bytes
64 bytes from fd42:0:0:3::: icmp_seq=1 ttl=64 time=69.3 ms   (3/3 received)
PING fd42:0:0:3:: (fd42:0:0:3::) 1232 data bytes
1240 bytes from fd42:0:0:3::: icmp_seq=1 ttl=64 time=69.9 ms   (3/3 received)
```

senaev-media joined, tailnet `direct`, IPv4 and IPv6 overlay including full-size IPv6
packets. **The cluster part of the rebuild is complete:** 4 nodes, v1.36.5, dual-stack, no
tailscaled restart, no loss of access to the home nodes.

Next: services. Run them in steps so that the Vault restore happens before any workload that
reads `senaev-com-kv` starts (`bootstrap-vault.sh` creates `senaev-com-kv` with only
`TG_TOKEN_SENAEV_COM_BOT`; `kv put` from the backup replaces it with the full set):
`make traefik` → `make secrets` → Vault restore → `make telemetry` → `make datadog` →
`make senaev-com` → `make test`.

### 2026-10-06 — Rebuild step 7: services deployed; only test/minio fails

```
NAME           STATUS   ROLES           AGE   VERSION
firstvds       Ready    <none>          17m   v1.36.5+k3s1
hetzner        Ready    control-plane   22m   v1.36.5+k3s1
proxmox        Ready    <none>          16m   v1.36.5+k3s1
senaev-media   Ready    <none>          11m   v1.36.5+k3s1
NAMESPACE     NAME                     READY   STATUS             RESTARTS   AGE
test          minio-86bb8d98c5-cd647   0/1     ImagePullBackOff   0          47s
NAMESPACE    NAME                        STORETYPE            STORE                        REFRESH INTERVAL   STATUS         READY
datadog      senaev-com-kv-secrets       ClusterSecretStore   vault-cluster-secret-store   30s                SecretSynced   True
senaev-com   prowlarr-basicauth          ClusterSecretStore   vault-cluster-secret-store   30s                SecretSynced   True
senaev-com   senaev-com-kv-secrets       ClusterSecretStore   vault-cluster-secret-store   30s                SecretSynced   True
senaev-com   unmanic-basicauth           ClusterSecretStore   vault-cluster-secret-store   30s                SecretSynced   True
telemetry    alertmanager-basicauth      ClusterSecretStore   vault-cluster-secret-store   30s                SecretSynced   True
telemetry    senaev-com-kv-secrets       ClusterSecretStore   vault-cluster-secret-store   30s                SecretSynced   True
telemetry    victoriametrics-basicauth   ClusterSecretStore   vault-cluster-secret-store   30s                SecretSynced   True
telemetry    vmalert-basicauth           ClusterSecretStore   vault-cluster-secret-store   30s                SecretSynced   True
test         test-kv-secrets             ClusterSecretStore   vault-cluster-secret-store   30s                SecretSynced   True
```

minio pod events:

```
Failed to pull image "minio/minio:RELEASE.2025-01-20T14-49-07Z": failed to pull and unpack image
"docker.io/minio/minio:RELEASE.2025-01-20T14-49-07Z": failed to resolve reference ...: pull access
denied, repository does not exist or may require authorization: server message: insufficient_scope:
authorization failed
```

- All nodes `Ready`; every pod except one runs; **all 9 ExternalSecrets `SecretSynced`** —
  the Vault restore worked (the services read their full secret set).
- **minio is not caused by the rebuild.** `docker.io/minio/minio` no longer serves this image
  (MinIO stopped publishing public images on Docker Hub in 2025). The node had the image
  cached before; the agent uninstall deleted the containerd image store, so the pull is now
  required and fails.
- minio is a test service (`provisioning/helm/test/`, commit `b3beea2`): an S3-compatible
  store at `test-s3-bucket.senaev.com`, nothing in the repo uses it.
- `Fix:` set `minio.enabled: false` in `provisioning/helm/test/values.yaml` (data on
  `/mnt/sdb1/volumes/minio` stays), or move to another image source if it is needed.

**Decision: minio disabled.** `minio.enabled: false`, and the two ingress entries
`test-minio` / `test-minio-console` removed (they are in the generic `ingress.entries` list
and do not follow `minio.enabled`). `helm template` renders no minio object. The
`MINIO_ROOT_PASSWORD` key stays in Vault, unused.
