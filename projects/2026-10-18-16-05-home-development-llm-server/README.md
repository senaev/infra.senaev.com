# 2026-10-18 — Buy a new home server within €1,000

- [ ] Select and buy a powerful home server with a capable GPU, at least 32 GB RAM and at least 1 TB SSD, for no more than €1,000 total.

## Goal

Buy a home server for development, virtual machines and containers. The maximum
budget is €1,000 for the complete usable machine, including VAT and delivery.

| Component | Requirement |
| --- | --- |
| CPU | Powerful enough for development, VMs and concurrent services; compare concrete CPUs |
| GPU | Capable integrated graphics; Radeon 780M in the preferred Beelink SER8 |
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

Confirmed preferences: compact size, headless operation, wired networking, Proxmox,
reliability and low maintenance. The machine will be in the living room, so low noise
is important. Only SSD support is needed. Self-assembly is acceptable, but ready-made
machines are preferred when competitively priced.

## Preferred candidate — 2026-11-08

**Beelink SER8, Ryzen 7 8745HS, 32 GB DDR5 RAM and 1 TB NVMe SSD** is the
best candidate for now. The user will most probably order it; no order has been placed.
The observed EU-store price was €929, subject to confirming VAT and delivery within
the €1,000 total budget. The listing indicated approximately 35 days preorder shipping.

- Ryzen 7 8745HS: 8 cores / 16 threads, Radeon 780M integrated graphics.
- Two replaceable DDR5 SO-DIMM slots, normally occupied by 2 × 16 GB in this configuration.
  Upgrading to 64 GB requires replacing both modules with 2 × 32 GB. Larger kits need
  exact kit/BIOS compatibility checks; the advertised 256 GB ceiling is not independently verified.
- Two M.2 2280 NVMe SSD slots; one occupied by the supplied 1 TB drive, one vacant.
- Chosen for compact size, capable CPU/graphics, replaceable RAM and storage expansion.
  Exact-unit noise and Proxmox stability remain acceptance checks after delivery.

## Plan

1. Recheck the exact SER8 8745HS 32 GB/1 TB configuration, seller, stock/preorder date,
   return terms and final price including VAT and delivery to Madrid before ordering.
2. Confirm firmware/Linux compatibility and any required GPU access for the intended services.
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
[118-page source register](research-sources.md). SER8 is the preferred candidate; purchase is still pending.
