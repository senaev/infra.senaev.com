# Preserve Windows and install Proxmox

## Goal and current state

Dell OptiPlex Micro 7010 has arrived. Preserve the supplied Windows installation,
install Proxmox on the internal SSD, and attempt to run the existing Windows in a VM.
No backup, disk erasure or installation has been performed. Purchase project remains closed.

## Equipment

- A small USB stick for bootable installers (Clonezilla, then Proxmox).
- A separate external USB disk or accessible NAS for backups, with enough free space
  for both the full-disk backup and Windows virtual disk. Check actual usage first;
  encrypted imaging may require space approaching the full source disk capacity.
- A monitor, keyboard and wired Ethernet connection for initial setup.

Do not store the only backup on the internal SSD or on the USB being rewritten as an
installer: Proxmox installation erases its selected target; writing a bootable USB
normally erases that USB. The Proxmox installer is not a Windows backup tool.

## Plan

1. Boot existing Windows. Confirm CPU, RAM amount/layout, SSD model/SMART health,
   power adapter, Ethernet and fan noise; run Dell diagnostics. Record Service Tag,
   Windows edition and activation/licence channel. Check unlocked BIOS and VT-d.
2. Check BitLocker/device encryption and securely save its recovery key outside the
   Dell. Keep keys and any licence secrets out of git. For Disk2vhd, turn encryption
   off and wait for full decryption; suspending protection alone is insufficient.
3. Boot Clonezilla from the small USB and save the entire internal disk to the external
   disk/NAS, including EFI boot and recovery partitions. Run image integrity checking.
   Retain this original backup untouched for restoration to the physical Dell.
4. Boot Windows again and run Microsoft Disk2vhd, selecting Windows and the required
   system/boot volumes, writing the VM-ready VHDX to the external disk/NAS. Do not
   capture only C: while omitting its boot partition. This step needs no bootable USB.
5. Verify both backups are readable and complete, record checksums, and retain a
   second copy where practical. Ideally test Windows VM boot on another host before
   wiping the Dell. Integrity checks alone do not prove bootability; if no other host
   is available, record that limitation and retain the verified full-disk restore path.
6. Only after backup verification, rewrite the small USB with the Proxmox installer.
   Disconnect external backup disks before installation to avoid selecting one by
   mistake. Boot installer; install Proxmox onto the internal SSD, erasing Windows.
7. Import a working copy of the VHDX into a Proxmox Windows VM. Match the original
   boot mode (normally OVMF/UEFI); configure Windows 11 TPM 2.0/Secure Boot as needed.
   Use a Windows-supported disk controller initially, then install VirtIO drivers
   before switching to VirtIO storage/network devices. Boot repair may be required.
8. Confirm Windows boots, files/apps are present and activation status is understood.
   The virtual hardware change may require reactivation. Supplied OEM/refurbished
   licence rights must be checked; do not assume a VM licence is included or that
   successful activation proves licence entitlement. Keep the original backups.
9. Enable BIOS AC Recovery Power On and Proxmox VM autostart. Test headless AC
   restoration, sustained Ethernet traffic, temperatures and living-room noise.
10. Set up the Linux Jellyfin VM with full iGPU passthrough. Verify real hardware
    transcodes and at least ten guest reboot/shutdown/start cycles without host reboot.
    Do not assign the same full-passthrough GPU to Windows and Jellyfin simultaneously.
    Migrate services only after acceptance checks pass.

## Verification and rollback

Before erasing: full-disk backup integrity passes, VM image exists outside the Dell,
recovery key is saved if applicable, and the intended installation disk is confirmed.
After installation: Windows VM boots; Jellyfin transcodes in hardware; power recovery,
network stability and noise meet requirements. Record actual results, not assumptions.
If necessary, boot Clonezilla and restore the original disk image to the internal SSD;
this overwrites the Proxmox installation, so preserve any new VM data separately first.

## References

- Microsoft Disk2vhd (capture and BitLocker restrictions):
  https://learn.microsoft.com/en-us/sysinternals/downloads/disk2vhd
- Clonezilla disk-image restoration and integrity checking:
  https://clonezilla.org/show-live-doc-content.php?topic=clonezilla-live/doc/02_Restore_disk_image

Exact import commands and current installer settings will be checked when executing
this plan against the actual disk layout and installed Proxmox version.
