- [x] Select and buy a compact home server with at least 32 GB RAM and 1 TB SSD within €1,000 delivered.

Stage: completed and closed on 2026-11-11 at the user’s request.
Purchased refurbished Dell OptiPlex Micro 7010, advertised i5-13500T / 32 GB / 1 TB NVMe.
VORPC order 102889, €599.89 including VAT and delivery; €400.11 below budget.
User confirms the server has arrived (2026-11-13).

Hardware inspection, BIOS AC recovery, noise/network stability, Proxmox installation
and Linux VM Jellyfin GPU passthrough tests are post-delivery follow-up, not completed
verification and not blockers to closing this purchase project.

Setup: Windows VHDX creation completed; cloud upload in progress (user confirmed).
File: C:\Users\user\Downloads\dell-windows.vhdx. Internal C: is fully decrypted,
BitLocker off. Selected internal SSD volumes: EFI (~200 MB, Disk2vhd 196 MB),
Windows C: and 905 MB recovery; USB volumes excluded. VHDX and VSS enabled.
Proxmox VE 9.2-1 Intel/AMD installer USB prepared on Mac using dd.

Windows remote access is deferred until after VM import through Proxmox noVNC.
No replacement capture is required solely for this configuration.
Local image SHA-256 recorded in the setup plan from user-provided PowerShell output.
Cloud upload completion and downloaded-copy comparison remain unconfirmed; user
previously chose to skip checksum comparison. VM bootability, hardware inspection and Dell USB boot are
not yet verified. Proxmox installation and Windows VM import have not started.
See [setup plan](windows-backup-proxmox-plan.md). Purchase remains complete.
