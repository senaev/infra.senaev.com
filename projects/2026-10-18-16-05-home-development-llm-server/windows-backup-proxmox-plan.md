# Preserve Windows and install Proxmox

## Goal and current state

Dell OptiPlex Micro 7010 has arrived. Preserve the supplied Windows installation,
install Proxmox on the internal SSD, and attempt to run the existing Windows in a VM.
No backup, disk erasure or installation has been performed. Purchase project remains closed.

## Equipment

- One USB stick for the Proxmox installer; no second USB drive is required.
- Enough free space on the Windows SSD to create the VHDX locally, and enough private
  cloud storage to hold it. Check available space and cloud file-size limits first.
- A monitor, keyboard and wired Ethernet connection for initial setup.

Disk2vhd can write its image to the same filesystem it is capturing. The local image
is temporary: installing Proxmox erases the selected internal SSD, including that file.
A verified cloud copy must exist before proceeding. The Proxmox installer is not a
Windows backup tool; writing it to USB normally erases the USB stick.

## Plan

1. Boot existing Windows. Confirm CPU, RAM amount/layout, SSD model/SMART health,
   power adapter, Ethernet and fan noise; run Dell diagnostics. Record Service Tag,
   Windows edition and activation/licence channel. Check unlocked BIOS and VT-d.
2. Check BitLocker/device encryption and securely save its recovery key outside the
   Dell. Keep keys and any licence secrets out of git. For Disk2vhd, turn encryption
   off and wait for full decryption; suspending protection alone is insufficient.
3. Run Microsoft Disk2vhd in Windows with VSS enabled. Capture Windows and all required
   system/boot volumes, plus recovery volumes where available, into a VHDX on the
   internal SSD. Do not capture only C: while omitting its boot partition. This step
   needs no bootable USB. Check completion and record the file size and SHA-256 hash.
4. Upload the completed image to private cloud storage, together with its checksum
   and non-secret disk-layout/boot-mode notes. Confirm upload is complete and the file
   can be retrieved. Download it to another computer or storage location and compare
   SHA-256 hashes; record a successful match before erasing the Dell. Keep cloud
   credentials/recovery methods accessible independently of the Windows installation.
5. Ideally test that a working copy boots in a VM on another host. A checksum match
   verifies transfer integrity, not Windows bootability. If no other host is available,
   record that the image has not been boot-tested before proceeding.
6. Create the Proxmox installer on the single USB stick. Only after the cloud copy is
   verified, boot the installer and install Proxmox on the internal SSD. This erases
   Windows and the local VHDX. Download the verified image from cloud storage to
   Proxmox storage for import, allowing space for both the download and imported VM disk.
7. Import a working copy of the VHDX into a Proxmox Windows VM. Match the original
   boot mode (normally OVMF/UEFI); configure Windows 11 TPM 2.0/Secure Boot as needed.
   Use a Windows-supported disk controller initially, then install VirtIO drivers
   before switching to VirtIO storage/network devices. Boot repair may be required.
8. Confirm Windows boots, files/apps are present and activation status is understood.
   The virtual hardware change may require reactivation. Supplied OEM/refurbished
   licence rights must be checked; do not assume a VM licence is included or that
   successful activation proves licence entitlement. Keep the original cloud image unchanged and import a working copy.
9. Enable BIOS AC Recovery Power On and Proxmox VM autostart. Test headless AC
   restoration, sustained Ethernet traffic, temperatures and living-room noise.
10. Set up the Linux Jellyfin VM with full iGPU passthrough. Verify real hardware
    transcodes and at least ten guest reboot/shutdown/start cycles without host reboot.
    Do not assign the same full-passthrough GPU to Windows and Jellyfin simultaneously.
    Migrate services only after acceptance checks pass.

## Verification and recovery

Before erasing: cloud upload is complete, a downloaded copy matches the original
SHA-256, required partitions were captured, recovery key is saved if applicable,
cloud access works independently, and the intended installation disk is confirmed.
After installation: Windows VM boots; Jellyfin transcodes in hardware; power recovery,
network stability and noise meet requirements. Record actual results, not assumptions.

The chosen plan uses Disk2vhd plus cloud storage and does not require Clonezilla or
an external backup disk. It preserves Windows for VM migration; it is not a tested
one-click restoration of the factory SSD. If physical Windows restoration is needed,
plan a compatible image-restore process or reinstall Windows and recover data from
the saved image. Do not promise the previous Clonezilla rollback without its backup.

## Reference

- Microsoft Disk2vhd (same-volume destination, VSS and BitLocker restrictions):
  https://learn.microsoft.com/en-us/sysinternals/downloads/disk2vhd

Exact import commands and current installer settings will be checked when executing
this plan against the actual disk layout and installed Proxmox version.
