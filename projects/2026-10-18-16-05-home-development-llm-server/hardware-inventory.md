# Dell hardware inventory — 14 November 2026

Source: user-provided photos of the delivered unit's BIOS Overview. These are
observed values, not seller specifications or passed diagnostic tests.

| Parameter | BIOS value |
| --- | --- |
| Model | Dell OptiPlex Micro 7010 |
| Service Tag | DSYPLY3 |
| Express Service Code | 30049525083 |
| BIOS version | 1.3.1 |
| Manufacture date (as displayed) | 07/06/2023; numeric format retained without interpretation |
| Ownership date (as displayed) | 09/22/2023 |
| Asset / ownership tags | None / None |
| Signed Firmware Update | Enabled |
| CPU | 13th Gen Intel Core i5-13500T |
| Core count | 6 + 8 (14 total) |
| Maximum / minimum clock | 4.60 GHz / 0.80 GHz |
| Current clock at capture | 2.67 GHz; transient reading |
| Processor ID | B06F2 |
| Microcode version | 2C |
| L2 cache | 6 x 1280 kB + 2 x 2048 kB |
| L3 cache | 24576 kB |
| Hyper-Threading capable | Yes; capability does not establish current enablement |
| 64-bit technology | Yes |
| Installed RAM | 32768 MB (32 GB) |
| Available RAM | 32532 MB |
| Memory technology | DDR4 SDRAM |
| Memory speed (BIOS label) | 3200 MHz |
| Channel mode | Dual |
| DIMM 1 | 16384 MB SO-DIMM |
| DIMM 2 | 16384 MB SO-DIMM |
| Video controller | Intel UHD Graphics; BIOS does not specify the numeric model |
| Video BIOS | GOP 1079 |
| Video memory reported | 8128 MB; shared iGPU memory, not evidence of dedicated VRAM |
| Wi-Fi device | None |
| Bluetooth device | None |
| Audio controller | Realtek ALC3246 |
| Native display resolution | 3840 x 2160; attached display value |
| LOM MAC address | 20-88-10-66-47-65 |

Both RAM slots are occupied (2 x 16 GB); there is no vacant RAM slot. Dell's
previously researched supported maximum is 64 GB, requiring module replacement.

Storage from the earlier PowerShell screenshot: NVMe device identifier includes
WDC WDS100T2B0C; Windows partition 930.42 GB, EFI 200 MB, Microsoft Reserved 16 MB,
recovery 905 MB. These BIOS Overview photos do not show SSD model/SMART health.

Still pending: extended hardware diagnostics, SSD health, BIOS VT-d/virtualization
settings, AC Recovery configuration/test, noise/network stability and GPU passthrough.
Previously reported keyboard/mouse input failure in BIOS is not confirmed resolved.
