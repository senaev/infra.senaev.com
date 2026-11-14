# 2026-10-18 — Buy a new home server within €1,000

- [x] Select and buy a powerful home server with a capable GPU, at least 32 GB RAM and at least 1 TB SSD, for no more than €1,000 total.

## Goal

Buy a home server for development, virtual machines and containers. The maximum
budget is €1,000 for the complete usable machine, including VAT and delivery.

| Component | Requirement |
| --- | --- |
| CPU | Powerful enough for development, VMs and concurrent services; compare concrete CPUs |
| GPU | Intel integrated graphics / Quick Sync preferred for Jellyfin in a Linux VM |
| RAM | At least 32 GB |
| Storage | At least 1 TB SSD |
| Total price | No more than €1,000 including VAT and Madrid delivery |
| Power recovery | BIOS automatic power-on when AC power returns |
| GPU virtualization | Full GPU passthrough to a Linux VM on Proxmox for Jellyfin, including reliable VM reboot and shutdown/start |

## Context

After the local LLM speed experiments, the user decided to stop sizing this purchase
around large local LLMs. Increasing system RAM alone, even to roughly 100 GB, does
not address the performance they need. Local LLM performance is no longer an
acceptance requirement for this purchase.

The existing server is an Intel N150 machine with 16 GB RAM and a 1 TB NVMe SSD.
The previous implementation, benchmarks and operational findings are preserved in
[LLM experiments](llm-experiments.md) as historical context. This project update does
not change the running LLM service.

Confirmed preferences: compact size, headless operation, wired networking, Proxmox,
reliability and low maintenance. The machine will be in the living room, so low noise
is important. Only SSD support is needed. Self-assembly is acceptable, but ready-made
machines are preferred when competitively priced.

## Ordered — 2026-11-08

User ordered the refurbished Dell OptiPlex Micro 7010 from VORPC, order **102889**.
Confirmation screenshot: 32 GB RAM, 1 TB M.2 NVMe, **€599.89 total including VAT**,
free shipping advertised in 48–72 hours, paid using Google Pay (WooPayments).
User confirmed the server has arrived on 2026-11-13. BIOS hardware inventory and Dell diagnostic passes are recorded; Proxmox is now installed.
Delivered CPU confirmed in BIOS: i5-13500T.
The Dell supersedes the earlier SER8 preference and other shortlist candidates.
See [Intel research and retailer checks](research-intel-options.md).

## Post-delivery follow-up (outside the completed purchase project)

The server has arrived. Follow the [Windows backup and Proxmox installation plan](windows-backup-proxmox-plan.md)
using Disk2vhd to the internal SSD, a verified cloud copy and one installer USB
before erasing the internal SSD. Configure Windows remote access after import using
Proxmox's noVNC console; no recapture is required solely for remote-access setup.
The purchase remains complete. Proxmox installation and initial networking are
complete: web/Shell and Tailscale DNS access work; vmbr0 uses DHCP after reboot.
The router reused 192.168.0.23; an actual different-address test is not complete.
The host joined the k3s cluster as worker `proxmox-madrid` (`make worker-proxmox-madrid`),
with smokeping and iperf3 monitoring in vm-stack. It is a sensitive node in the
repository `AGENTS.md`. See [cluster worker](windows-backup-proxmox-plan.md#k3s-cluster-worker--14-november-2026).
The Debian VM exists as `senaev-madrid` (8 vCPUs, 16 GiB RAM, ~500 GiB disk) and is
also a k3s worker and a sensitive node. See [senaev-madrid](windows-backup-proxmox-plan.md#k3s-worker-senaev-madrid-debian-vm--14-november-2026).
Current next task: verify QEMU Guest Agent root command execution from the Proxmox host. Windows
recovery and Jellyfin passthrough remain planned; reassess shared storage capacity.
See the plan for configuration, evidence and outstanding checks.

## Verification

- Confirm the exact configuration includes at least 32 GB RAM and 1 TB SSD.
- Confirm that the GPU suits the agreed workload and that the complete delivered
  price is at most €1,000.
- Check compatibility, cooling, warranty and return conditions before ordering.
- After delivery, verify installed hardware, stability, temperatures and the intended
  development/VM workloads.

## Hardware research — 2026-11-08

Compact and quiet for the living room; SSD storage only; refurbished accepted. See
[options and delivered-price comparison](research-options.md) and the
[118-page source register](research-sources.md). Dell received; Windows capture and Proxmox installation are complete. Windows VM
recovery and workload acceptance tests remain pending.

## Result

Completed and closed on 2026-11-11 at the user’s request. Purchased the refurbished
Dell OptiPlex Micro 7010, 32 GB RAM / 1 TB NVMe, from VORPC for €599.89 including
VAT and delivery (order 102889). The server has now arrived (user confirmation, 2026-11-13).
The purchase is €400.11 below the €1,000 budget. BIOS inventory, diagnostic passes and AC Recovery testing are recorded. Proxmox installation, Tailscale access and DHCP
after reboot are complete. The host is a k3s worker, `proxmox-madrid`, and its Debian VM is k3s worker
`senaev-madrid`. Windows VM
recovery and Jellyfin testing remain pending.

## Delivered hardware record

See [BIOS hardware inventory](hardware-inventory.md) for the observed CPU, RAM layout,
firmware, identifiers, BIOS settings, diagnostic results and successful AC Recovery test
recorded on 2026-11-14.
