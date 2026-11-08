# 2026-10-18 — Buy a new home server within €1,000

- [ ] Select and buy a powerful home server with a capable GPU, at least 32 GB RAM and at least 1 TB SSD, for no more than €1,000 total.

## Goal

Buy a home server for development, virtual machines and containers. The maximum
budget is €1,000 for the complete usable machine, including VAT and delivery.

| Component | Requirement |
| --- | --- |
| CPU | Powerful enough for development, VMs and concurrent services; compare concrete CPUs |
| GPU | A capable graphics processor; exact workload, discrete vs integrated, and VRAM remain to be decided |
| RAM | At least 32 GB |
| Storage | At least 1 TB SSD |
| Total price | No more than €1,000 |

## Context

After the local LLM speed experiments, the user decided to stop sizing this purchase
around large local LLMs. Increasing system RAM alone, even to roughly 100 GB, does
not address the performance they need. Local LLM performance is no longer an
acceptance requirement for this purchase.

The existing server is an Intel N150 machine with 16 GB RAM and a 1 TB NVMe SSD.
The previous implementation, benchmarks and operational findings are preserved in
[LLM experiments](llm-experiments.md) as historical context. This project update does
not change the running LLM service.

Previous preferences: headless operation, wired networking, Proxmox, reliability,
low temperatures and low maintenance. Revisit passive cooling and compact size if
those conflict with the new CPU/GPU requirements and budget.

## Plan

1. Clarify the intended GPU workloads and acceptable size/noise; decide whether
   refurbished or used hardware is acceptable.
2. Compare complete machines and custom builds available in Spain, within the total
   budget. Record exact CPU, GPU/VRAM, RAM, SSD, upgrade options and warranty.
3. Check Linux/Proxmox compatibility and GPU passthrough if needed; compare cooling,
   power consumption and measured performance for the intended workloads.
4. Present a shortlist and choose a configuration with the user before purchase.

## Verification

- Confirm the exact configuration includes at least 32 GB RAM and 1 TB SSD.
- Confirm that the GPU suits the agreed workload and that the complete delivered
  price is at most €1,000.
- Check compatibility, cooling, warranty and return conditions before ordering.
- After delivery, verify installed hardware, stability, temperatures and the intended
  development/VM workloads.
