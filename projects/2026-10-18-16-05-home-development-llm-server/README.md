# 2026-10-18 — Buy a new home server within €1,000

- [ ] Select and buy a powerful home server with a capable GPU, at least 32 GB RAM and at least 1 TB SSD, for no more than €1,000 total.

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

## Current shortlist — 2026-11-08

The earlier SER8 preference is on hold: reliable GPU passthrough to a Linux VM for
Jellyfin is now mandatory. Intel Quick Sync is preferred. New and trustworthy
refurbished/used machines are acceptable. No order has been placed.

See [Intel options and prices](research-intel-options.md). Strongest price lead:
VORPC refurbished Dell OptiPlex Micro 7010, advertised i5-13500T / 32 GB / 1 TB,
€599.89 VAT included with free shipping advertised. Confirm exact CPU (seller allows
equivalents), Service Tag, noise, return terms and Linux VM passthrough before purchase.
GMKtec M3 Pro and a DeskMini B760 build remain alternatives. No candidate is yet
verified against every requirement.

## Plan

1. Recheck the exact Intel CPU/GPU, 32 GB/1 TB configuration, seller and stock,
   return terms and final price including VAT and delivery to Madrid before ordering.
2. Confirm BIOS AC recovery and full GPU passthrough into a Linux VM for Jellyfin.
   Verify hardware decoding/encoding, required codecs and HDR tone mapping; repeat
   guest reboot and VM shutdown/start cycles without rebooting the host.
3. After delivery, install Proxmox and verify headless boot, networking, hardware,
   stability and living-room noise before migrating workloads.

## Verification

- Confirm the exact configuration includes at least 32 GB RAM and 1 TB SSD.
- Confirm that the GPU suits the agreed workload and that the complete delivered
  price is at most €1,000.
- Check compatibility, cooling, warranty and return conditions before ordering.
- After delivery, verify installed hardware, stability, temperatures and the intended
  development/VM workloads.

## Hardware research — 2026-11-08

New hardware only; compact and quiet for the living room; SSD storage only. See
[options and delivered-price comparison](research-options.md) and the
[118-page source register](research-sources.md). Intel shortlist supersedes the SER8 preference; purchase is pending.
