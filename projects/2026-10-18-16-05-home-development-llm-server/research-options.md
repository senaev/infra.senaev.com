# Home server options for Spain — 8 November 2026

## Recommendation

For the stated media/general-server use, start with Intel integrated graphics and Quick Sync.
A discrete gaming GPU is not currently justified by the workload. The two practical directions
are a complete GMKtec M3 for about €609 delivered, or a self-assembled ASRock DeskMini B760
for about €885–940 delivered. Neither takes internal 3.5-inch hard drives or a conventional GPU card.

The user confirmed: new hardware only; up to roughly 10–15 litres; Proxmox; at least
32 GB RAM and 1 TB SSD; €1,000 including delivery to Spain. Assembly preference,
noise constraints, internal HDD requirements and exact concurrent workloads remain unanswered.
These are shortlisted candidates, not a purchase decision.

## Research coverage and limits

See [the source register](research-sources.md): 118 distinct pages and threads screened.
This is not 118 independent websites or laboratory tests. It includes Reddit owner reports,
47 Proxmox forum pages, hands-on hardware reviews, specifications, retailer listings and shipping
terms. Screening used search excerpts and extracted page sections; the shortlist received
additional checks of exact configuration, current price, stock, compatibility and shipping.
Forum reports reveal possible failure modes, not failure rates. Some modern retailer pages
contain inconsistent specifications or dynamically selected variants.

Prices below are public page observations for mainland Spain, not completed checkout quotes.
Recheck condition, stock, seller, VAT and delivered total before paying. Earlier search snippets
often showed different prices from the current product page; current page observations take precedence.

## What people buy and where

Four recurring approaches appeared:
- Used Lenovo ThinkCentre Tiny, Dell OptiPlex Micro and HP EliteDesk/ProDesk machines,
  often through eBay/local refurbishers. Popular value choices, but excluded by the new-only requirement.
- Beelink/GMKtec/Minisforum mini PCs, commonly via Amazon or manufacturer stores.
  Low-power N100/N150 machines are common for modest services; they would not be a meaningful
  CPU upgrade from the user's existing N150.
- Minisforum MS-01/MS-A2 for networking and expansion: more ports and storage options, with
  higher cost and mixed thermal/stability reports. Several successful owners and several
  problem reports exist; neither establishes a population reliability rate.
- ASRock DeskMini/DeskMeet or custom small desktops for socketed CPUs and chosen components.
  DeskMini emphasises size; DeskMeet provides more physical expansion.

Examples: [MS-01 owners](https://www.reddit.com/r/Proxmox/comments/1gqt9a1/state_of_proxmox_on_the_minisforum_ms01_in_late/),
[MS-01 reliability reports](https://www.reddit.com/r/homelab/comments/1sn5w0h/ms01_reliability/),
[DeskMeet build](https://www.reddit.com/r/sffpc/comments/1f3tccn/asrock_deskmeet_x600_easiest_iyx_build_for/),
and [first-hand Beelink setup](https://www.derekseaman.com/2023/04/hands-on-beelink-mini-pcs-for-proxmox-home-assistant-and-plex.html).
Historic overseas purchase prices are not Spanish offers.

## Option 1: GMKtec M3 — complete machine

[PcComponentes listing](https://www.pccomponentes.com/mini-pc-gmktec-m3-intel-core-i5-12450h-32gb-1tb-ssd-uhd-windows-11-pro-wifi-6)

- Intel i5-12450H: 4 performance + 4 efficiency cores, 12 threads.
- Intel UHD integrated GPU; suitable starting point for hardware media transcoding.
- 32 GB DDR4, 1 TB NVMe SSD, 2.5 GbE.
- Approximately 114 × 106 × 42.5 mm (0.51 litres, excluding adapter).
- Current observed new listing: **€609.01, free shipping**, sold and shipped by PcComponentes.
  The displayed delivery window was 20–23 November.
- Manufacturer: replaceable RAM up to 64 GB, one M.2 2280 NVMe position plus an M.2 2242 SATA position.
  USB-C is data/display only; it does not provide an external-GPU connection.

Best for: a compact complete host, fewer assembly steps, and substantial budget headroom.
Limitations: soldered CPU, small cooling system, restricted expansion, no verified
exact-model Proxmox acceptance test in this research. Linux support is not a Proxmox certification.
Test headless operation, Ethernet, reboots and GPU access during the return period.

The M3 Pro i5-13500H is a different model. Its Spanish store displayed €319.99 for
the selected barebones variant, not the 32 GB/1 TB complete machine. With the DDR4
kit and SSD below, hardware alone is €785.50; delivery/tax terms still need confirmation.
Do not compare its barebones price with the complete M3 price.

## Option 2: ASRock DeskMini B760 — chosen components

[Official specifications](https://www.asrock.com/nettop/Intel/DeskMini%20B760%20Series/index.es.asp)

1.92-litre barebones with a socketed Intel CPU, two DDR4 SO-DIMM slots (64 GB maximum),
two M.2 SSD positions, two 2.5-inch SATA positions and 2.5 GbE. The 120 W external
power adapter is included. There is no conventional PCIe graphics-card slot.
Supports 12th–14th generation CPUs up to 65 W; maximum CPU cooler height is 47 mm.

| Part | Seller / exact model | Observed price |
| --- | --- | ---: |
| Chassis, motherboard and adapter | Reichelt DeskMini B760 | €208.39 |
| CPU, baseline | PcComponentes i5-12400, non-F | €149.90 |
| RAM | Silicon Power SP032GBSFU320X22, 2 × 16 GB DDR4-3200 SO-DIMM, via PcComponentes | €266.99 |
| SSD | PcComponentes WD Black SN7100 1 TB, WDS100T4X0E | €198.52 |
| Cooler | PcComponentes Noctua NH-L9i-17xx, 37 mm high | €50.99 |
| Shipping | Reichelt DHL to Spain, up to 10 kg; other listed items free shipping | €9.95 |
| **Total with i5-12400** | **6 performance cores / 12 threads** | **€884.74** |
| CPU alternative | i5-14400, non-F, €205.43 via OCASIONIA on PcComponentes | +€55.53 |
| **Total with i5-14400** | **6 performance + 4 efficiency cores / 16 threads** | **€940.27** |

These are assembled price sums, not a single basket or assembly-service quote.
Marketplace seller and new condition must be reconfirmed for the i5-14400.
The RAM quote is expensive; it proves a budget path exists, not that this is the cheapest kit.

For the i5-14400, confirm that the shipped BIOS supports the exact CPU stepping before ordering;
do not assume a new barebones has recent firmware. Use sensible CPU power limits: a 65 W CPU
rating is not its unrestricted turbo draw. Noctua lists the cooler as compatible, but that does
not establish silent sustained performance in this chassis. A 12th-gen i5-12400 simplifies
initial BIOS compatibility at a lower price. Both use UHD 730 rather than gaming-class graphics.

Choose this direction for socketed CPU replacement, selected cooler and SSD, and four storage positions.
It still uses a proprietary small motherboard and provides no internal 3.5-inch bays or remote BMC.
For full standard motherboard/PSU/GPU replacement, a larger conventional ITX case is a different design.

## Attractive alternatives that are not confirmed budget buys

| Candidate | Why considered | Why not first choice today |
| --- | --- | --- |
| Minisforum MS-01 | 3 M.2 positions, 2 × 10 GbE SFP+, 2 × 2.5 GbE, limited PCIe expansion | i5 barebones currently €519; complete 32 GB/1 TB currently €1,169. Requires DDR5, unlike the DeskMini DDR4 kit. No verified in-stock full build below €1,000 established here. |
| GMKtec K11, Ryzen 9 8945HS / 780M | 8 cores/16 threads, stronger general 3D iGPU | Current PcComponentes page €1,089 and unavailable; older €833–925 snippets were stale. |
| GEEKOM XT12 Pro | Intel i9-12900H and compact format | Official page unavailable; a €0 coupon display is a placeholder, not an offer. |
| GEEKOM IT13 Max | Core Ultra 9 / Arc graphics | Variant selector offered 24 GB soldered-RAM options despite broader 32 GB specification text; cannot treat the starting price as a qualifying 32 GB offer. |
| Beelink SEi13/SEi14 AI variants | Fast CPUs and advertised AI extras | Retrieved current pages exceeded budget; old reviews refer to different configurations. |
| ASRock DeskMeet X600 | 8 litres, AM5 socket, 4 DIMMs, PCIe slot, room for more hardware | Promising expansion platform, but needs a complete CPU/RAM/cooler quote. AMD iGPU is less attractive for the stated media priority. |
| ASRock DeskMeet B660 | 8-litre Intel option, DDR4, PCIe | Stock problems; official Spanish page reports October 2026 discontinuation. Not a dependable immediate purchase. |
| ASUS NUC 14 Pro preconfigured | Recognisable vendor, compact platform | Checked qualifying 32 GB/1 TB listings exceeded budget; cannot substitute a barebones price. |

MS-01 BIOS-level remote-management support should be confirmed for the exact SKU:
its current page has conflicting vPro descriptions. The PCIe slot also has physical
half-height/single-slot constraints; it is not room for an arbitrary desktop GPU.

## Proxmox and media implications

[Jellyfin's hardware guide](https://jellyfin.org/docs/general/administration/hardware-selection/)
favours Intel graphics for this use. It is possible for AMD acceleration to work, but gaming
GPU rankings do not predict media encoder suitability. Do not buy an Intel F-series CPU
when relying on integrated graphics. No fixed number of 4K streams is promised: codec,
HDR tone mapping, subtitles and resolution matter.

Decide the GPU ownership model before deployment. Full PCI passthrough normally assigns the
physical GPU to one VM; it is not automatically a GPU shared by every VM. Multiple media
applications can live in that VM. Render-device access in containers is a separate approach.
Do not make third-party GPU partitioning patches an assumed purchase requirement.

The [Proxmox guide](https://pve.proxmox.com/pve-docs/pve-admin-guide.pdf) recommends redundant fast
storage and SSDs with power-loss protection. The priced consumer SSD is a home-lab compromise,
not an enterprise SSD. One 1 TB SSD satisfies capacity, but provides no disk-failure redundancy.
Keep off-host backups; a second disk or mirror does not replace them. A mirrored pair of 1 TB
drives provides roughly 1 TB nominal usable capacity, not 2 TB.

For noise and temperature, prefer adjustable active cooling over insisting on passive cooling.
Measure whole-machine wall power with the intended drives/services; CPU TDP is not idle consumption.
For scale, each extra 10 W continuously is 87.6 kWh/year; apply the user's actual electricity tariff.

## Before choosing or ordering

Resolve: internal 3.5-inch drives versus existing media storage; self-assembly versus complete machine;
placement/noise; intended VM count and concurrent transcoding; whether 2.5 GbE is sufficient.
If internal media disks or future discrete GPUs matter, revisit an 8–15 litre case before buying either finalist.

After delivery, test RAM, SSD health, Ethernet throughput, repeated reboots, automatic restart after
power restoration, headless idle/load stability, temperatures, and real hardware-accelerated
playback within the return window. Keep the old host available until a restore test succeeds.
No existing host or running service was changed by this research.
