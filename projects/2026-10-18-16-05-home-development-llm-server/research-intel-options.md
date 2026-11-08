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
- Latest recheck: €599.89 VAT included (previous observation €533.34); free mainland delivery advertised, not a completed checkout.
- Collection at Calle Marquetería 1, second floor, Móstoles.
- Product-specific warranty: two years, extra year offered for €29. General three-year
  marketing conflicts with this; confirm invoice terms. Advertised 30-day free returns.
- Seller permits equivalent CPU substitutions. Require exact CPU, Service Tag, RAM
  layout, SSD model/SMART health, included PSU and permission to test Proxmox in writing.
- Trustpilot: 4.4/5 from approximately 4,585 reviews, including mixed support experiences; not a guarantee.
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

## Dell and VORPC investigation — 8 November 2026

Verdict: conditional candidate, not all requirements verified. Do not treat CPU
virtualization capability as proof of reliable full iGPU passthrough.

- Dell confirms two DDR4-3200 SO-DIMM slots, maximum 64 GB (2 x 32 GB).
  Seller does not identify whether supplied 32 GB is 1 x 32 or 2 x 16 GB.
- Dimensions: 182 x 36 x 178 mm. One storage M.2 socket plus 2.5-inch SATA bay;
  this is the base Micro, not the Micro Plus with different expansion. Confirm SATA
  cable/caddy before adding a SATA SSD. No mechanical disk is needed.
- The advertised i5-13500T maps to UHD 770 in Dell documentation. Seller's generic
  graphics label and equivalent-CPU substitution clause require exact-unit confirmation.
- Dell documents BIOS AC Recovery; default is Power Off. Set Power On and test
  actual AC removal/restoration, with Proxmox guests configured to start at boot.
- No exact-configuration acoustic measurement found. Refurbished fan condition and
  sustained load matter; assess noise in the actual living-room position.
- Exact-model owner reports UHD 770 passthrough to a Plex VM. This does not establish
  Linux Jellyfin compatibility or repeated GPU reset/restart reliability. The same
  thread reports e1000e network hangs; unplugging Ethernet restores access. Owner
  applied a NIC-offloading workaround but no long-term outcome is posted.
  https://forum.proxmox.com/threads/optiplex-7010-proxmox-and-vms-unresponsive-and-inaccessible-tips-to-troubleshoot.168610/

Retailer assessment: identifiable Spanish business, mixed independent reputation.
VORPC legal notice names Eco Sistemas Informáticos España SL, CIF B09982273,
Calle Marquetería 1, Móstoles; independent company directories and PcComponentes
seller identity match. Trustpilot is 4.4/5 from about 4,585 reviews. PcComponentes is
3.8/5 from 83 reviews and says the shop is currently deactivated; reason unknown.
- https://vorpc.es/aviso-legal/
- https://www.iberinform.es/empresa/9987455/eco-sistemas-informaticos-espana
- https://www.pccomponentes.com/tiendas/vorpc-store

Published terms: refurbished hardware two-year warranty. Thirty-day returns allow
reasonable testing but require factory restoration. General policy makes buyer pay
change-of-mind return shipping unless an offer says otherwise, whereas this product
advertises free returns. Custom RAM/SSD configurations are excluded in published
policy. Obtain written confirmation that this listed 32 GB/1 TB SKU is returnable
after installing/testing Proxmox, and who pays shipping. Software/passthrough failure
is not automatically a hardware warranty claim. Merely opening the case does not
automatically void warranty, but intervention-caused damage is excluded.
https://vorpc.es/reembolso_devoluciones/

Before purchase: exact i5-13500T with no substitution; Service Tag and unlocked BIOS;
RAM layout; SSD model/SMART health; correct included PSU; return/testing agreement.
Acceptance: AC restoration, headless boot, hardware Jellyfin transcodes, ten guest
reboots and shutdown/start cycles, sustained Ethernet traffic and acceptable noise.
No seller contacted and no purchase made.

Dell primary references:
- https://www.dell.com/support/manuals/en-us/optiplex-7010-micro/optiplex-micro-7010-owners-manual/memory?guid=guid-e9d2ea83-38a4-431d-803c-96d63c1dbc34&lang=en-us
- https://www.dell.com/support/manuals/en-us/optiplex-7010-micro/optiplex-micro-7010-owners-manual/storage?guid=guid-0e172724-3ca9-42d4-ad08-97cc95069e8f&lang=en-us
- https://www.dell.com/support/manuals/en-us/optiplex-7010-micro/optiplex-micro-7010-owners-manual/gpuintegrated?guid=guid-0f264593-4edf-4b32-99db-62322993f7af&lang=en-us
