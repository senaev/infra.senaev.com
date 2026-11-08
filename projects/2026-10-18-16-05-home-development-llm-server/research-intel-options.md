# Intel home server shortlist — 8 November 2026

## Mandatory acceptance checks

Compact, quiet living-room Proxmox host, wired networking, 32 GB RAM, 1 TB SSD,
maximum €1,000 including VAT and Madrid delivery. New or trustworthy refurbished/used;
assembly acceptable. BIOS must power on automatically when AC returns. Guests must
start at boot. Full GPU passthrough to a Linux VM for Jellyfin must work reliably.

Confirm hardware decode/encode in FFmpeg logs using real transcodes, required codecs,
HDR tone mapping and expected concurrent streams. Repeat guest reboots and full VM
shutdown/start at least ten times, transcoding after each, without host reboot, GPU
reset errors or host hangs. Verify headless cold boot too. CPU Quick Sync support
alone is not proof of exact-machine passthrough. No candidate below is fully verified.
Jellyfin guidance: https://jellyfin.org/docs/general/administration/hardware-selection/

## 1. Refurbished business mini — strongest price lead

[Dell OptiPlex Micro 7010 at VORPC](https://vorpc.es/mini-pc-dell-optiplex-micro-7010-i5-13-gen-32gb-1tb-m-2-nvme-windows-11-reacondicionado/)

- Advertised i5-13500T, 32 GB DDR4, 1 TB NVMe; refurbished.
- €533.34 VAT included; free 24/48-hour delivery advertised, not a completed checkout.
- Collection at Calle Marquetería 1, second floor, Móstoles.
- Product-specific warranty: two years, extra year offered for €29. General three-year
  marketing conflicts with this; confirm invoice terms. Advertised 30-day free returns.
- Seller permits equivalent CPU substitutions. Require exact CPU, Service Tag, RAM
  layout, SSD model/SMART health, included PSU and permission to test Proxmox in writing.
- Trustpilot: 4.4/5 from 4,583 reviews, including mixed support experiences; not a guarantee.
  https://es.trustpilot.com/review/vorpc.es
- Dell exact-model manual documents AC Recovery under AC Behavior:
  https://www.dell.com/support/manuals/en-nz/optiplex-7010-micro/optiplex-micro-7010-owners-manual/system-setup-options?guid=guid-e51b3f72-31b7-40d4-abd4-9e8d4477616d&lang=en-us
- Open: exact-unit Linux VM passthrough/restart behaviour, noise, current stock and final
  postcode-specific delivery. No seller contacted; no order placed.

## 2. GMKtec M3 Pro i5-13500H / 32 GB / 1 TB

[PCDIGA complete configuration](https://www.pcdiga.com/computadores-e-software/mini-computadores-e-barebones/computadores-mini-pc/mini-pc-gmktec-nucbox-m3-pro-intel-core-i5-13500h-32gb-ram-ssd-1tb-iris-xe-graphics-windows-11-pro-m3-pro-6972570964959):
€799.90, 36-month warranty listed. Spain shipping unconfirmed; published shipping
policy describes Portugal: https://www.pcdiga.com/envio-de-encomendas-e-portes

[Spanish-language Emegastore offer](https://www.emegastore.com/es/ciencias-de-la-computacion-y-computadoras/mini-pc-gmktec-m3-pro-i5-13500h-32gb-1tb_p28621.html?cat=0&id=5&pc=0):
€990.04, unavailable-stock notification and contradictory 32 GB title / 16 GB specs.
Exclude as a confirmed offer. Manufacturer store €319.99 refers to barebones, not
32 GB / 1 TB: https://gmktec.es/products/gmktec-nucbox-m3-pro-mini-pc-intel%C2%AE-core%E2%84%A2-i5-13500h-de-13-%C2%AA-generacion

Replaceable RAM up to 64 GB, extra M.2 2242 SSD slot. Exact-model PCWorld review
reports quiet idle at ~50 cm and audible steady noise under sustained load:
https://www.pcworld.com/article/3205153/gmktec-m3-pro-review.html
BIOS AC recovery and full Linux VM GPU passthrough remain unverified.

## 3. DeskMini B760 + i5-14400

| Part | Observed price |
| --- | ---: |
| Case/motherboard/PSU, Reichelt Spain | €208.39 |
| i5-14400 non-F, PcComponentes marketplace OCASIONIA | €205.79 |
| Crucial 32 GB 2 x 16 GB DDR4-3200 SO-DIMM, PcComponentes | €480.99 |
| Lexar NM790 1 TB NVMe, PcComponentes | €199.95 |
| Noctua NH-L9i-17xx, PcComponentes | €50.99 |
| Hardware subtotal | €1,146.11 |
| Provisional delivery allowance | €20–30 |
| Total estimate | €1,166–1,176 |

Sources:
- https://www.reichelt.com/es/es/shop/producto/pc_barebone_deskmini_b760-366031
- https://www.pccomponentes.com/procesador-intel-core-i5-14400-2-5-4-7ghz-box
- https://www.pccomponentes.com/crucial-so-dimm-ddr4-3200mhz-pc4-25600-32-gb-2x16-gb-cl22
- https://www.pccomponentes.com/disco-duro-lexar-nm790-1tb-ssd-m-2-2280-pcie-4-0-nvme-slc
- https://www.pccomponentes.com/noctua-nh-l9i-17xx-ventilador-cpu-92mm

Idealo showed the same RAM kit at €310.96 delivered via Amazon Marketplace, but
seller page was inaccessible. Substituting it gives €976.08 hardware, approximately
€996–1,006 with provisional delivery. This is a lead, not a verified orderable basket:
https://www.idealo.es/precios/200610286/crucial-32gb-kit-sodimm-ddr4-3200-cl22-ct2k16g4sfra32a.html

Before purchase confirm 14th-gen BIOS support, cooler fit/thermal limits, AC recovery,
noise and IOMMU isolation/full Linux VM passthrough. Noctua does not guarantee silence.
