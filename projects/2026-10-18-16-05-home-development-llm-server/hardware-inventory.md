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

## BIOS setup and diagnostic results — 14 November 2026

Recorded from BIOS screenshots and user confirmations. Values below distinguish
changes from settings already present; no unobserved before/after values are assumed.

| BIOS page / parameter | Recorded setting | Evidence / action |
| --- | --- | --- |
| Power / AC Behavior / AC Recovery | Power On | Configured; user tested AC restoration successfully |
| Power / Block Sleep | On | User confirmed applying recommended settings; no final screenshot |
| Power / USB Wake Support | On | Observed; retained |
| Power / Active State Power Management (ASPM) | Auto | Observed; retained |
| Power / Deep Sleep Control | Enabled in S4 and S5 | Observed; no later change reported |
| Virtualization Support / Intel Virtualization Technology (VT) | On | Final screenshot confirms |
| Virtualization Support / VT for Direct I/O | On | Final screenshot confirms |
| Virtualization Support / Intel Trusted Execution Technology (TXT) | Off | Final screenshot confirms |
| Virtualization Support / Pre-Boot DMA Support | On | Final screenshot confirms |
| Virtualization Support / OS Kernel DMA Support | On | Final screenshot confirms |
| Keyboard / Enable Keyboard Error Detection | Off | Screenshot confirms; allows operation without a keyboard |
| Keyboard / Enable Numlock LED | On | Observed; retained |
| Keyboard / Device Configuration Hotkey Access | Enabled | Observed; retained |
| Pre-boot Behavior / Enable Adapter Warnings | Off | Observed |
| Pre-boot Behavior / Warnings and Errors | Prompt on Warnings and Errors | Observed; no later change confirmed |
| Pre-boot Behavior / Fastboot | Thorough | Observed |
| Pre-boot Behavior / Extend BIOS POST Time | 0 seconds | Observed |
| Integrated Devices / Internal Speaker | Disabled | User explicitly confirmed disabling |
| Integrated Devices / Microphone | Enabled | User explicitly confirmed leaving enabled |

No storage-mode or Secure Boot change is recorded. BIOS input was initially unavailable
with the directly connected Apple keyboard/mouse; subsequent settings were changed,
but the exact input workaround was not documented.

### Completed checks

| Check | Result | Evidence / scope |
| --- | --- | --- |
| CPU / RAM inventory | Confirmed | i5-13500T, 32 GB DDR4, 2 x 16 GB; BIOS photos above |
| Windows BitLocker status on C: | Fully decrypted; protection off | manage-bde screenshot; 0.0% encrypted |
| Windows Disk2vhd capture | Complete | User confirmation; EFI, C: and recovery selected with VHDX/VSS |
| Local VHDX SHA-256 | Recorded | See installation plan; cloud comparison not performed |
| BIOS AC Recovery | Passed | User: “I tested AC recovery, it works.” |
| Dell SupportAssist Quick Test | All tests passed successfully | Result 2000-0000; validation 90116; Service Tag DSYPLY3 |
| Follow-up advanced diagnostics | All tests passed successfully | Result screenshot after instructions to select DISK 1 + MEMORY and Thorough mode; result 2000-0000, validation 90116 |

SupportAssist version shown: ED.3.2.8; BIOS 1.3.1. The follow-up result screen does
not show selected components, thorough-mode status or duration. Therefore the pass
is recorded, but exact extended-test coverage is not independently confirmed.
These diagnostic passes do not establish SSD SMART wear figures or sustained-load stability.

### Remaining setup and acceptance checks

Cloud upload completion/access is not yet confirmed. The user chose to skip transfer
checksum comparison; the local reference hash remains preserved. Proxmox installation and DHCP after reboot are now complete; Tailscale DNS access
works (see installation plan for evidence and exact networking scope). Windows VM boot, SSD SMART health,
sustained temperatures/noise/network stability, Proxmox VM autostart and Jellyfin iGPU
passthrough/transcode/repeated guest restart testing remain pending.
