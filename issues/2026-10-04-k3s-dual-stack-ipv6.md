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
