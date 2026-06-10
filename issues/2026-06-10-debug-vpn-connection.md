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

_(Append dated sub-sections here as the investigation proceeds. Format suggestion:)_

### YYYY-MM-DD HH:MM — Round 1 results

**Command A — firstvds xray logs:**

```
(paste output)
```

Interpretation: …

**Command B — hetzner xray logs:**

```
(paste output)
```

Interpretation: …

**Conclusion of Round 1:** which hypothesis is supported / refuted, what Round 2 looks like.

---

## Resolution

_(Filled in once the root cause is identified and fixed. Include: root cause, the fix command(s) run, why this happened, and any follow-up actions to prevent recurrence — e.g. add a monitor, update a runbook.)_
