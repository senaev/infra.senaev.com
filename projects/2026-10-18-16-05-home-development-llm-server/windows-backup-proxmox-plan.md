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

### k3s cluster worker — 14 November 2026

The Proxmox VE host runs a k3s agent, the same as the existing `proxmox` host. Changes
in `main`, commit 1ca94635 (`✨ Add proxmox-madrid worker`):

| Item | Value |
| --- | --- |
| Node label | `vps=proxmox-madrid` |
| SSH address | `root@proxmox-madrid` (Tailscale name), through the hetzner jump host |
| Variables | `VPS_PROXMOX_MADRID_HOST`, `_USERNAME`, `_LABEL` in `.env` and `terraform.tfvars` |
| Bootstrap | `make worker-proxmox-madrid`; part of `make workers`, before `proxmox` and `senaev-media` |
| vm-stack | smokeping target; iperf3 agent with tests to `hetzner` and `firstvds` |
| Datadog | not enabled, the same as `proxmox` |
| Risk level | sensitive node in `AGENTS.md`: reachable only over the tailnet |

User reported that `make worker-proxmox-madrid` succeeded.

📌 Disable Tailscale key expiry for proxmox-madrid (admin console, Machines), if not done.

📌 Revoke the auth key that was visible in the installation screenshot.

✅ Node `Ready` (kubelet v1.36.5+k3s1); after the vm-stack deploy the iperf3 tests
`proxmox-madrid → hetzner` and `→ firstvds` succeeded at about 20 Mbit/s, and all five
other nodes get smokeping replies from proxmox-madrid.

### k3s worker senaev-madrid (Debian VM) — 14 November 2026

The Debian VM from the plan below is named `senaev-madrid`, not debian-madrid. It runs a
k3s agent, the same as `senaev-media` on `proxmox`. Changes in `main`, commit 1b713dde
(`✨ Add senaev-madrid worker`):

| Item | Value |
| --- | --- |
| Node label | `vps=senaev-madrid` |
| SSH address | `root@senaev-madrid` (Tailscale name), through the hetzner jump host |
| Variables | `VPS_SENAEV_MADRID_HOST`, `_USERNAME`, `_LABEL` in `.env` and `terraform.tfvars` |
| Bootstrap | `make worker-senaev-madrid`; in `make workers` right after `proxmox-madrid` |
| vm-stack | smokeping target; iperf3 agent with tests to `hetzner` and `firstvds` |
| Datadog | not enabled |
| Risk level | sensitive node in `AGENTS.md`: tailnet, and LAN from proxmox-madrid |

Observed over SSH before the bootstrap:

```text
senaev-madrid
Debian GNU/Linux 13 (trixie)
6.12.117+deb13-amd64
8
Mem:            15Gi       488Mi        14Gi       744Ki       726Mi        15Gi
/dev/sda2       475G  3.5G  447G   1% /
...
100.102.168.102
```

The VM has 8 vCPUs (the plan proposed 4), about 16 GiB RAM and a 475 GiB root
filesystem on the planned 500 GiB disk. User reported that `make worker-senaev-madrid`
succeeded; kube-state-metrics shows the node `Ready` with kubelet v1.36.5+k3s1.

📌 Disable Tailscale key expiry for senaev-madrid (admin console, Machines), if not done.

The vm-stack deploy of 1b713dde succeeded. Right after it, senaev-madrid ran its
iperf3 agent, smokeping prober and node-exporter; it pinged all six targets, and
hetzner and galkin already got its replies, while the other probers were still in
their rolling restart.

📌 Confirm the first iperf3 results for `senaev-madrid → hetzner` and `→ firstvds`
(7th and 8th in the scheduler queue, about 35–40 minutes after the deploy).

✅ User subsequently reported that the QEMU Guest Agent checks work; raw command output and a separate post-reboot agent check were not supplied.

### Next stage: Windows VM recovery

1. Host baseline captured: Proxmox 9.2.2, kernel 7.0.2-6-pve; zero failed systemd
   units. Repository changes/updates are not independently verified here.
2. Working VHDX copied to `/var/lib/vz/dell-windows.vhdx`. At the user's later request,
   SHA-256 was checked and matches the original Windows capture (see below).
   This supersedes the earlier decision to skip comparisons. Cloud-copy verification
   remains unconfirmed; preserve the source image unchanged.
3. Image/storage inspection is complete (snapshot below). The thin pool can hold
   the current allocated data, but cannot hold both virtual disks fully populated.
   Review capacity and growth limits before import; do not truncate the VHDX.
4. Create/import the Windows VM with UEFI/OVMF, required Windows 11 TPM configuration
   and initially Windows-supported storage; boot via noVNC, repair boot if needed,
   verify files/apps/login and activation, then install VirtIO drivers/guest agent.
5. Configure VM autostart and backups; create Linux Jellyfin VM and validate full
   Intel iGPU passthrough, real hardware transcoding and ten guest restart cycles.
6. Finish SSD SMART and sustained temperatures/noise/network acceptance checks.

Installation/networking stage is complete at the user's request; Windows recovery,
Jellyfin validation and the different-LAN-address test are not claimed complete.

## Debian VM plan — QEMU Guest Agent required

Debian installation is complete: VM **100**, `senaev-madrid`, Debian 13 Trixie
(installer media 13.7), **8 vCPUs**, **16384 MiB RAM**, **500 GiB virtual disk**.
The original proposal below used 4 vCPUs; the actual guest reports 8. Other proposed
hardware settings require `qm config 100` to confirm.

The VM Options screenshot shows **Start at boot: Yes**, **QEMU Guest Agent: Enabled**,
ACPI and KVM enabled, boot order `scsi0, ide2, net0`, and Protection: No.
User reported the guest agent checks work. Root SSH/Tailscale access is recorded in
its k3s section above. The installer created the regular account `senaev-madrid`;
`root` is a separate built-in account. Authorized-key setup was discussed; no secret
keys or passwords are stored here. User tested an abrupt mains-power cut and restoration: the host recovered and
VM 100 started working automatically. The end-to-end AC recovery/autostart test
passes by user report. Protection, installer-media removal and off-host backups
remain unconfirmed.

The following installation and agent procedure is retained for reproducibility.

Host baseline supplied by user: pve-manager/9.2.2/b9984c6d90a4bd80, kernel
7.0.2-6-pve; local-lvm active and empty, approximately 793.8 GiB; root 96 GiB LV
with df reporting 85 GiB available; swap 8 GiB; systemctl --failed lists zero units.
A 500 GiB Debian virtual disk leaves approximately 293.8 GiB of nominal pool capacity
for other disks; actual thin-pool consumption must be monitored. Reassess Windows
import capacity and virtual disk sizing rather than assuming both full disks fit.

1. Download the official amd64 netinst ISO directly through local > ISO Images >
   Download from URL; attach it during Create VM. No USB or Mac upload is necessary.
   Source: https://www.debian.org/download
2. During VM creation, enable **QEMU Guest Agent** on the System tab (Advanced if
   necessary). Alternatively, with the VM fully shut down, enable it under
   VM > Options > QEMU Guest Agent, then start the VM. This provides the virtual
   communication channel; it does not install the Debian package.
3. Install Debian using its virtual console, guided partitioning of the VM disk,
   SSH server and standard system utilities; omit desktop for server use. Preserve
   the guest login/password. Detach installer media after installation.
4. Inside the Debian guest, as root (use su - if logged in as a regular user):

   ```bash
   apt update
   apt install -y qemu-guest-agent
   systemctl start qemu-guest-agent
   systemctl is-active qemu-guest-agent
   ```

   Expect active. If it fails due to the virtio port being absent, ensure the host
   agent option is enabled and fully shut down/start the VM. The Debian service
   may be static/device-activated; do not require systemctl enable to succeed.
5. On the Proxmox host as root, substitute the actual numeric VMID below:

   ```bash
   qm agent <VMID> ping
   qm guest exec <VMID> -- /usr/bin/id
   qm guest cmd <VMID> network-get-interfaces
   ```

   Ping must succeed; exec must return exitcode 0 and uid=0(root). This explicitly
   tests the requested host-root access to commands inside the guest, without
   requiring guest SSH/network access. Never type the angle-bracket placeholder
   literally; replace it with the selected VM ID.
6. Reboot Debian and repeat agent ping/exec to confirm the agent returns automatically.
   Keep SSH enabled for interactive terminals and noVNC as console fallback. Agent
   command execution is not an interactive shell and requires a running guest/agent.

Acceptance: Debian installation and resources are confirmed; user reports the
agent checks work. Power-loss recovery and VM autostart are confirmed by user test. A separate
post-reboot guest-agent command check is not confirmed. Agent supports IP discovery, managed shutdown and backup filesystem freeze;
its presence alone does not prove successful backups or passthrough.

Reference: https://github.com/proxmox/pve-docs/blob/master/generated/qm.1-synopsis.adoc

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
The later SHA2521 command failed and produced no additional hash. The Proxmox working copy was subsequently compared successfully below; cloud-copy
verification remains unconfirmed.

## Windows recovery preflight — 2026-11-14

User confirmed the transfer finished after discussing SSH/rsync instead of the slow
USB drive. No Windows VM creation, import or first boot is confirmed yet.

| Item | Observed value |
| --- | --- |
| Working image | `/var/lib/vz/dell-windows.vhdx` |
| Format / cluster size | VHDX / 2097152 bytes |
| Virtual size | 932 GiB (1000204886016 bytes) |
| File length / allocated size | 36892049920 bytes / approximately 34.4 GiB |
| local storage | 98497780 KiB total; 44736508 used; 48711724 available (45.42% used) |
| local-lvm thin pool | 832356352 KiB total; 11569753 used; 820786598 available (1.39% used) |
| Existing VM | 100 senaev-madrid, running, 16384 MiB RAM, 500.00 GiB boot disk |

Commands supplied by the user:

```bash
qemu-img info /var/lib/vz/dell-windows.vhdx
pvesm status
qm list
sha256sum /var/lib/vz/dell-windows.vhdx
```

Checksum output:

```text
e05509082e46209f48f71bfb5b55bd74d718a5cd89995c9acf01e7c2177cc758  /var/lib/vz/dell-windows.vhdx
```

**PASS:** identical to the recorded Windows SHA-256 (hexadecimal case is irrelevant).
This verifies transfer integrity, not Windows bootability.

Proposed next VM: **101 / dell-windows**, initially 8 GiB RAM, 4 host-type vCPUs,
q35/OVMF, EFI disk and TPM 2.0, with the imported Windows disk initially attached
as SATA to use its existing storage drivers. These settings are planned, not applied.
Inspect `qm config 101` after import before choosing the imported volume identifier;
EFI/TPM allocations affect disk numbering. Then verify Windows boot, files, apps and
activation before adding VirtIO drivers, guest agent, autostart and backups.

The 932 GiB Windows virtual disk plus the 500 GiB Debian disk exceed the approximately
793.8 GiB physical thin pool. Sparse import may fit current data, but future growth
can exhaust it. Monitor thin-pool data/metadata and settle disk sizing or additional
storage before substantial writes. Retain the original VHDX; do not shrink/truncate
it without a partition-aware recovery plan.
