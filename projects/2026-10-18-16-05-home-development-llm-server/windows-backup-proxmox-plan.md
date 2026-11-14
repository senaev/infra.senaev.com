# Preserve Windows and install Proxmox

## Goal and current state

Dell OptiPlex Micro 7010 has arrived. Preserve the supplied Windows installation,
install Proxmox on the internal SSD, and attempt to run the existing Windows in a VM.
Installer USB is prepared: Proxmox VE 9.2-1 Intel/AMD, written on Mac with dd.
Windows image creation is user-confirmed complete; cloud upload completion has not
been explicitly confirmed.
File: `C:\Users\user\Downloads\dell-windows.vhdx`. C: is fully decrypted, BitLocker off.
Captured EFI (~200 MB; Disk2vhd shows 196 MB), C: and 905 MB recovery with VHDX/VSS;
USB volumes excluded. User chose to skip cloud checksum comparison; upload completion
and VM boot remain unconfirmed. BIOS configuration, diagnostic passes and successful
AC Recovery test are recorded in [hardware inventory](hardware-inventory.md).
Proxmox installation, web/Shell access, Tailscale access and DHCP after reboot are
confirmed. User considers this installation/networking stage finished. Purchase remains closed.

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

### Completed installation and access

User confirmed connecting to the installed server. Shell screenshot identifies
Linux proxmox-madrid 7.0.2-6-pve, x86_64. Web UI/Shell access succeeded first at
192.168.0.23:8006 and later via https://proxmox-madrid:8006 through Tailscale DNS.
Installed package versions have not yet been captured with pveversion -v.

Tailscale was installed on the host and joined to the user's tailnet. User confirmed
access through its internal DNS; tailscale ip -4 returned **100.113.139.72**.
This observed tailnet address is an access detail, not a fixed /etc/hosts mapping.

The first Tailscale installer attempt stopped during apt update because PVE and
Ceph Enterprise repositories returned 401 Unauthorized. Guidance was to disable
both enterprise entries in Node > Updates > Repositories, add PVE No-Subscription,
retain Debian/Tailscale sources, then run apt update and apt install tailscale,
followed by interactive tailscale up. Subsequent tailnet connection is confirmed;
exact repository edits and a clean final apt update were not separately shown.
An auth key was visible in the screenshot: advised revocation and interactive login;
key is intentionally not transcribed, and revocation is not confirmed.

### Final networking decision and executed DHCP steps

User explicitly wants dynamically assigned LAN addresses, including testing an
actual address change. Rejected router reservations, fixed LAN/Tailscale IP mappings,
DHCP hostname-update hooks and adding a Proxmox dependency on Tailscale startup.
Final scope: **DHCP only on vmbr0**, retain nic0 as its physical bridge port, use
Tailscale DNS for management access. Local hostname repair was explicitly deferred.
Earlier hook, Tailscale-IP hosts mapping and libnss-myhostname proposals were not
selected; do not treat them as executed configuration.

Existing configuration was inspected with:

```bash
cat /etc/network/interfaces
cat /etc/hosts
command -v dhclient
```

Observed dhclient: /usr/sbin/dhclient. Original /etc/hosts mapped
192.168.0.23 to proxmox-madrid.home.arpa and proxmox-madrid. No later hosts-file
edit is confirmed. Backup commands were issued before network editing:

```bash
cp -a /etc/network/interfaces /root/interfaces.before-dhcp
cp -a /etc/hosts /root/hosts.before-dhcp
```

User edited with nano; screenshot before saving matches this complete configuration:

```text
auto lo
iface lo inet loopback

iface nic0 inet manual

auto vmbr0
iface vmbr0 inet dhcp
    bridge-ports nic0
    bridge-stp off
    bridge-fd 0

source /etc/network/interfaces.d/*
```

Only network changes: static -> dhcp and removal of bridge address/gateway lines.
Saved using Ctrl+O, Enter, Ctrl+X; rebooted. Hook removal was advised only if an
earlier hook had been created; neither creation nor removal is confirmed.

After reboot, user reconnected via Tailscale DNS and ran ip -4 addr show vmbr0.
Screenshot shows:

```text
inet 192.168.0.23/24 brd 192.168.0.255 scope global dynamic vmbr0
valid_lft 862999sec preferred_lft 862999sec
```

Repeated checks after changing router LAN ports still showed .23, with decreasing
lease lifetimes (862777 and 862433 seconds). DHCP is active: dynamic plus an expiring
lease establishes this. Router ports on the same LAN do not create a different
DHCP identity; reusing an existing lease is normal and does not imply static setup.
An actual different-address/network test has **not** been performed. No router
DHCP pool change or reservation is recorded. Route/DNS outputs, full service-health
checks and hostname behavior after a changed address remain unverified. Existing
local hosts mapping may become stale; user explicitly accepted deferring this.

### Next stage: Windows VM recovery

1. Inspect Proxmox package versions, service state and storage/free space; confirm
   update repositories work before updating packages or allocating VM storage.
2. Locate the cloud VHDX and retrieve a working copy. Keep cloud original unchanged.
   User chose to skip checksum comparison; do not reintroduce it as a requirement.
3. Inspect VHDX virtual size and actual allocated space, and storage capacity before
   importing: original Windows disk was about 1 TB logically even if image file is
   much smaller. Do not assume the full virtual disk fits the default local-lvm pool;
   decide on safe resizing/storage placement based on observed sizes.
4. Create/import the Windows VM with UEFI/OVMF, required Windows 11 TPM configuration
   and initially Windows-supported storage; boot via noVNC, repair boot if needed,
   verify files/apps/login and activation, then install VirtIO drivers/guest agent.
5. Configure VM autostart and backups; create Linux Jellyfin VM and validate full
   Intel iGPU passthrough, real hardware transcoding and ten guest restart cycles.
6. Finish SSD SMART and sustained temperatures/noise/network acceptance checks.

Installation/networking stage is complete at the user's request; Windows recovery,
Jellyfin validation and the different-LAN-address test are not claimed complete.

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
