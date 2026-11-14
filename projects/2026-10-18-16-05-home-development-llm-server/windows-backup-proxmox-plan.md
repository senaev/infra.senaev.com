# Preserve Windows and install Proxmox

## Goal and current state

Dell OptiPlex Micro 7010 has arrived. Preserve the supplied Windows installation,
install Proxmox on the internal SSD, and attempt to run the existing Windows in a VM.
Installer USB is prepared: Proxmox VE 9.2-1 Intel/AMD, written on Mac with dd.
Windows image creation is user-confirmed complete; cloud upload is in progress.
File: `C:\Users\user\Downloads\dell-windows.vhdx`. C: is fully decrypted, BitLocker off.
Captured EFI (~200 MB; Disk2vhd shows 196 MB), C: and 905 MB recovery with VHDX/VSS;
USB volumes excluded. User chose to skip cloud checksum comparison; upload completion
and VM boot remain unconfirmed. BIOS configuration, diagnostic passes and successful
AC Recovery test are recorded in [hardware inventory](hardware-inventory.md).
User is proceeding to Proxmox installation; completion is not confirmed. Purchase remains closed.

Windows remote access will be configured after import through the Proxmox noVNC
console. No replacement image is needed solely for this setup.

## Installer decisions and observed progress — 14 November 2026

### USB replacement and successful installer boot

The original approximately 8.1 GB USB booted the Proxmox menu but stalled at
`searching for block device containing the ISO`, followed by repeated retries.
User reported the Dell detected it only in the front USB port. This does not prove
a rear-port hardware fault or identify the original failure's exact cause.

Replaced it with a KINGSTON 123.7 GB USB. macOS identified the replacement as
`/dev/disk4`; this identifier was checked for this session and must not be reused
without checking again. No pre-formatting was needed. The image was written to
the whole raw disk, not copied as an ordinary file:

```bash
diskutil unmountDisk /dev/disk4
sudo dd if="$HOME/Downloads/proxmox-ve_9.2-1 (1).iso" of=/dev/rdisk4 bs=4m
sync
diskutil eject /dev/disk4
```

User supplied final dd output:

```text
406+1 records in
406+1 records out
1706178560 bytes transferred in 399.541885 secs (4270337 bytes/sec)
```

No write error was shown. Booted in EFI mode; selected **Install Proxmox VE
(Graphical)**. With the replacement USB, the graphical installer reached disk,
locale, network and final summary screens successfully. This confirms installer
boot, not completion of installation or integrity of every ISO byte.

### Final installer configuration

| Parameter | Selected value |
| --- | --- |
| Installer | Proxmox VE 9.2, ISO release 1; Intel/AMD x86-64 |
| Installation mode | Graphical, EFI boot |
| Target disk | /dev/nvme0n1; 931.51 GiB; WDC WDS100T2B0C-00PXH0 |
| Filesystem | ext4, standard LVM/LVM-thin layout |
| hdsize | 931.0, as displayed in disk options |
| swapsize / maxroot / minfree / maxvz | Left blank for installer defaults; actual resulting sizes not yet measured |
| Country | Spain |
| Time zone | Europe/Madrid |
| Keyboard | en-us (U.S. English) |
| Administrator | root; password entered privately, not recorded |
| Notification email | andrei.senaev@gmail.com |
| Management interface | nic0, e1000e; connected (green indicator) |
| Interface MAC | 20:88:10:66:47:65 |
| Pin network interface names | Enabled |
| Full hostname | proxmox-madrid.home.arpa |
| Short node name shown in summary | proxmox-madrid |
| Initial IPv4 | 192.168.0.23/24, static installer configuration |
| Gateway | 192.168.0.1 |
| DNS | 192.168.0.1 |
| Automatically reboot after successful installation | Enabled |

The user selected **proxmox-madrid** instead of the suggested pve-dell name.
`home.arpa` is the private home-network suffix; it requires no domain purchase.
Using this hostname does not configure DNS on other devices automatically.

### Networking decision: DHCP after installation

User explicitly wants the Proxmox management address assigned by **DHCP**, rather
than retaining a host-configured static address. The installer screen was left with
the temporary static settings above. A router reservation was suggested, but was
not confirmed configured and is not recorded as the user's final choice.

After the first installed-system boot, inspect the actual network configuration
and available DHCP client support before preparing commands. Configure DHCP on
management bridge vmbr0 while retaining the physical NIC as a bridge port; maintain
correct hostname resolution for Proxmox, and verify routes and DNS. Keep the local
monitor/keyboard available because the management address and web connection may
change. Do not claim the DHCP conversion has already occurred. Any future cluster
setup must account for stable node addressing and name resolution.

### Immediate next steps and unconfirmed results

The latest evidence is the **final installer summary before Install**. Installation
completion, first SSD boot, web login and DHCP conversion are not yet confirmed.
Before erasing the SSD, finish the Windows cloud upload and confirm independent
access; upload completion has not been explicitly reported. The user chose to skip
transfer checksum comparison, while preserving the recorded local image hash.

Proceed with Install after the backup prerequisite. At restart, remove the USB and
boot the internal SSD. From the same LAN, initially open
https://192.168.0.23:8006 and sign in as root using Linux PAM authentication.
Then inspect/configure DHCP and verify access at the assigned address before
proceeding with Windows VM import and Jellyfin passthrough acceptance tests.

## Equipment

- One USB stick for the Proxmox installer; no second USB drive is required.
- Enough free space on the Windows SSD to create the VHDX locally, and enough private
  cloud storage to hold it. Check available space and cloud file-size limits first.
- A monitor, keyboard and wired Ethernet connection for initial setup.

Disk2vhd can write its image to the same filesystem it is capturing. The local image
is temporary: installing Proxmox erases the selected internal SSD, including that file.
A completed, accessible cloud copy must exist before proceeding. The Proxmox installer is not a
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
   can be retrieved. User chose to skip downloaded-copy checksum comparison; do not
   record a transfer-integrity pass. Keep cloud
   credentials/recovery methods accessible independently of the Windows installation.
5. Ideally test that a working copy boots in a VM on another host. A checksum match
   verifies transfer integrity, not Windows bootability. If no other host is available,
   record that the image has not been boot-tested before proceeding.
6. Create the Proxmox installer on the single USB stick. Only after the cloud copy is
   confirmed complete and accessible, boot the installer and install Proxmox on the internal SSD. This erases
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
   Open the VM's Console (noVNC) in the Proxmox web UI and sign into Windows.
   Keep a virtual display enabled for this console; guest networking, RDP and the
   QEMU guest agent are not prerequisites. Proxmox itself must be reachable and
   Windows must boot; the console does not bypass Windows authentication. Know the
   account password because a Windows Hello PIN may need reconfiguration after import.
   Configure and test Windows remote access here if desired: RDP on supported
   editions, another app for Home. Keep access private through LAN/Tailscale.
9. Enable BIOS AC Recovery Power On and Proxmox VM autostart. Test headless AC
   restoration, sustained Ethernet traffic, temperatures and living-room noise.
10. Set up the Linux Jellyfin VM with full iGPU passthrough. Verify real hardware
    transcodes and at least ten guest reboot/shutdown/start cycles without host reboot.
    Do not assign the same full-passthrough GPU to Windows and Jellyfin simultaneously.
    Migrate services only after acceptance checks pass.

## Verification and recovery

Before erasing: cloud upload is complete and accessible, required partitions were
captured, recovery key is saved if applicable,
cloud access works independently, and the intended installation disk is confirmed.
After installation: Windows VM boots; Jellyfin transcodes in hardware; power recovery,
network stability and noise meet requirements. Record actual results, not assumptions.

The chosen plan uses Disk2vhd plus cloud storage and does not require Clonezilla or
an external backup disk. It preserves Windows for VM migration; it is not a tested
one-click restoration of the factory SSD. If physical Windows restoration is needed,
plan a compatible image-restore process or reinstall Windows and recover data from
the saved image. Do not promise the previous Clonezilla rollback without its backup.

## Reference

- Proxmox web interface and built-in guest console:
  https://github.com/proxmox/pve-docs/blob/master/pve-gui.adoc

- Microsoft Disk2vhd (same-volume destination, VSS and BitLocker restrictions):
  https://learn.microsoft.com/en-us/sysinternals/downloads/disk2vhd

Exact import commands and current installer settings will be checked when executing
this plan against the actual disk layout and installed Proxmox version.

## Recorded local image SHA-256 — 2026-11-14

File: `C:\Users\user\Downloads\dell-windows.vhdx`

```text
E05509082E46209F48F71BFB5B55BD74D718A5CD89995C9ACF01E7C2177CC758
```

Transcribed from the successful SHA256 Get-FileHash output in the user's screenshot.
The later SHA2521 command failed and produced no additional hash. This is the local
image reference only; no cloud/downloaded-copy hash comparison is confirmed.
