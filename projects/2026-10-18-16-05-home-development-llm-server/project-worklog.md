## 2026-11-21 UTC — Hardware transcode test passed in senaev-madrid

Installed `ffmpeg`, made a 20 s 1080p30 H.264 test clip with libx264 on the CPU
(`speed=3.82x`), then transcoded it to HEVC fully on the iGPU (VA-API decode + `hevc_vaapi`):

```
        encoder         : Lavc61.19.101 hevc_vaapi
frame=  600 fps=145 q=-0.0 Lsize=    9781KiB time=00:00:19.96 bitrate=4012.8kbits/s speed=4.84x
```

The passed-through UHD 770 decodes H.264 and encodes HEVC at 145 fps (4.8× real time for
one 1080p30 stream), with no errors. `intel_gpu_top` was not checked. Still pending: the
ten-restart test and moving Jellyfin. Also proposed: VM 100 memory 16 → 24 GiB and Windows
capped at 6 GiB (balloon 4 GiB), so that both fit in the host's 32 GB with VM 100's memory
pinned by passthrough; not yet applied.

## 2026-11-21 UTC — Stage 3 done: Intel firmware and VA-API work in senaev-madrid

Added `non-free` to the three Debian lines in `/etc/apt/sources.list` (backup
`/root/sources.list.bak`), installed `firmware-intel-graphics`,
`intel-media-va-driver-non-free`, `vainfo`, `intel-gpu-tools`, then `qm reboot 100`:

```
i915 0000:01:00.0: [drm] Finished loading DMC firmware i915/adls_dmc_ver2_01.bin (v2.1)
i915 0000:01:00.0: [drm] GT0: GuC firmware i915/tgl_guc_70.bin version 70.36.0
i915 0000:01:00.0: [drm] GT0: HuC firmware i915/tgl_huc.bin version 7.9.3
i915 0000:01:00.0: [drm] GT0: HuC: authenticated for all workloads
i915 0000:01:00.0: [drm] GT0: GUC: submission disabled
vainfo: Driver version: Intel iHD driver for Intel(R) Gen Graphics - 25.2.3 ()
      VAProfileH264High               :	VAEntrypointEncSliceLP
      VAProfileHEVCMain               :	VAEntrypointEncSliceLP
      VAProfileHEVCMain10             :	VAEntrypointEncSliceLP
```

The firmware loads and HuC is authenticated, which low-power encoding needs. GuC
submission stays disabled (the i915 default on Alder Lake-S). The iHD driver offers
hardware decode and encode for H.264, HEVC and HEVC 10-bit through `/dev/dri/renderD128`.
Not yet done: a real transcode, the ten-restart reliability test, and moving Jellyfin.

## 2026-11-21 UTC — Stage 2 done: iGPU visible in senaev-madrid; GuC/DMC firmware missing

senaev-madrid was back after the host reboot (`up 3 min`, on the tailnet). Then:

```
# qm set 100 --hostpci0 0000:00:02.0,pcie=1
kvm: -device vfio-pci,host=0000:00:02.0,id=hostpci0,bus=ich9-pcie-port-1,addr=0x0: info: OpRegion detected on Intel display 4680.
status: running
AGENT-OK
--- senaev-madrid ---
ens18            UP             bc:24:11:5e:6e:a4
01:00.0 VGA compatible controller [0300]: Intel Corporation AlderLake-S GT1 [8086:4680] (rev 0c)
	Kernel driver in use: i915
crw-rw---- 1 root render 226, 128 Nov 20 23:42 renderD128
i915 0000:01:00.0: [drm] Failed to load DMC firmware i915/adls_dmc_ver2_01.bin (-ENOENT).
i915 0000:01:00.0: [drm] *ERROR* GT0: GuC firmware i915/tgl_guc_70.bin: fetch failed -ENOENT
[drm] Initialized i915 1.6.0 for 0000:01:00.0 on minor 1
```

The VM starts with the iGPU (no BAR/vfio errors), keeps `ens18`, and the guest i915 driver
creates `card1` and `renderD128`. Debian lacks the Intel GPU firmware (GuC, HuC, DMC), so
GuC is uninitialized. Next: stage 3, firmware and VA-API driver, then `vainfo`.

## 2026-11-21 UTC — Stage 1 done: iGPU bound to vfio-pci on proxmox-madrid

Someone was at the Dell for the reboot. Added `/etc/modprobe.d/vfio-igpu.conf`
(`options vfio-pci ids=8086:4680`, `softdep i915 pre: vfio-pci`, `softdep xe pre: vfio-pci`),
appended `vfio`, `vfio_iommu_type1`, `vfio_pci` to `/etc/initramfs-tools/modules`, ran
`update-initramfs -u -k all` (generated initrd for 7.0.2-6-pve; "No
/etc/kernel/proxmox-boot-uuids found, skipping ESP sync" — GRUB boot, expected), rebooted:

```
00:02.0 VGA compatible controller [0300]: Intel Corporation AlderLake-S GT1 [8086:4680] (rev 0c)
	Kernel driver in use: vfio-pci
status: running        # qm status 100
```

The host came back over the tailnet with the iGPU reserved for VMs, and VM 100 autostarted.
Next: stage 2, `hostpci0` on VM 100.

## 2026-11-21 UTC — iGPU passthrough to senaev-madrid: read-only checks and staged plan

User wants the Intel iGPU passed to VM 100 `senaev-madrid`. No RDP for Windows (decided).
Read-only checks on proxmox-madrid (pve-manager 9.2.26, kernel 7.0.2-6-pve, cmdline
without IOMMU flags):

```
00:02.0 VGA compatible controller [0300]: Intel Corporation AlderLake-S GT1 [8086:4680] (rev 0c)
	Kernel driver in use: i915
	Kernel modules: i915, xe
group 0: 00:02.0 VGA compatible controller [0300]: Intel Corporation AlderLake-S GT1 [8086:4680]
group 8: 00:1f.6 Ethernet controller [0200]: Intel Corporation Ethernet Connection (17) I219-LM [8086:1a1c]
```

IOMMU is active (DMAR table, populated IOMMU groups) with no cmdline change. The iGPU is
alone in group 0; the host NIC is in group 8, so passthrough does not touch it. VM 100 is
already `machine: q35`, `bios: ovmf`, `balloon: 0`, NIC `net0: virtio` → `ens18` in
Debian 13.7 (kernel 6.12.117), so no machine-type change is needed. The guest has only the
virtual display (`/dev/dri/card0`).

Staged plan, each stage verified before the next (both nodes are sensitive):
1. Host: bind 8086:4680 to vfio-pci at boot (modprobe options + softdeps for i915/xe,
   vfio modules in initramfs), reboot the host; VM 100 starts unchanged. Rollback: remove
   the files, `update-initramfs -u -k all`, reboot.
2. VM 100: `hostpci0: 0000:00:02.0,pcie=1`, restart only VM 100. Rollback:
   `qm set 100 --delete hostpci0`.
3. Debian: Intel media driver and firmware, check `vainfo` on `/dev/dri/renderD128`.
Moving Jellyfin to senaev-madrid is a separate later decision. The host loses its local
display output after stage 1.

## 2026-11-20 21:55 UTC — VM 101 snapshots deleted; restore test skipped

```
# qm delsnapshot 101 before-virtio; qm delsnapshot 101 before-oem-key
# qm listsnapshot 101
`-> current                                             You are here!
# ls -la /var/lib/vz/dump/      # empty
# lvs pve/data
  data pve twi-aotz-- <793.80g             16.58  0.76
```

The thin pool dropped from 19.98% to 16.58% after the snapshots were removed. User
decided to skip the restore test. Jellyfin GPU passthrough stays in the plan. RDP to the
Windows VM is not decided yet.

## 2026-11-20 UTC — Backup downloaded, verified and stored in the cloud

User downloaded the backup with `rsync -avP -e 'ssh -J root@senaev.com'` (~4.2 MB/s,
2 h 03 min for the archive) and checked it on the laptop:

```
77b2e4dcca8685d21b8f3dba2841982664d60ea9bc4f6898975955344b14224f  vzdump-qemu-101-2026_11_20-17_38_01.vma.zst
ce3f3860e028ee7fc0efe2d8e42ccc33171befedb494b991746dac648a020911  dell-msdm.bin
```

Both match the host. The archive, `.log`, `.notes` and `dell-msdm.bin` are uploaded to the
user's private cloud storage, and the user removed the backup files from
`/var/lib/vz/dump/` on proxmox-madrid (`/root/dell-msdm.bin` stays: VM 101 needs it).
Remaining cleanup: snapshots `before-oem-key` and `before-virtio`. Restore test not done.

## 2026-11-20 17:44 UTC — VM 101 backup succeeded (30.73 GB)

Before the backup, Windows: BitLocker Fully Decrypted (0.0%), `powercfg /h off`,
`DISM /Online /Cleanup-Image /StartComponentCleanup` (completed successfully), ReTrim.

```
INFO: backup mode: stop
INFO: backup is sparse: 868.55 GiB (93%) total zero data
INFO: transferred 931.52 GiB in 358 seconds (2.6 GiB/s)
INFO: archive file size: 30.73GB
INFO: Backup job finished successfully
vzdump-qemu-101-2026_11_20-17_38_01.vma.zst: 67752246272 bytes      # zstd -t OK
77b2e4dcca8685d21b8f3dba2841982664d60ea9bc4f6898975955344b14224f  vzdump-qemu-101-2026_11_20-17_38_01.vma.zst
ce3f3860e028ee7fc0efe2d8e42ccc33171befedb494b991746dac648a020911  dell-msdm.bin
```

About 63 GiB of real data compressed to 30.73 GB; the archive passes `zstd -t`. Files in
`/var/lib/vz/dump/` on proxmox-madrid: the archive, its `.log` and `.notes`, and
`dell-msdm.bin` (contains the OEM key, private storage only). Next: user downloads them,
checks SHA-256 and uploads to private cloud storage; then delete snapshots
`before-oem-key` and `before-virtio`. A restore test has not been done.

## 2026-11-20 UTC — VM 101 disk: discard and SSD emulation on, TRIM run

After BitLocker decryption (`manage-bde -status C:` had shown Protection Off, Key
Protectors: None Found):

```
# qm set 101 --sata0 local-lvm:vm-101-disk-2,size=953872M,discard=on,ssd=1
sata0: local-lvm:vm-101-disk-2,discard=on,size=953872M,ssd=1
PS> Optimize-Volume -DriveLetter C -ReTrim -Verbose
    Used space                 = 71.35 GB
    Free space                 = 859.06 GB
    Total space trimmed        = 857.13 GB
# lvs pve/vm-101-disk-2
  vm-101-disk-2 pve Vwi-aotz-- <931.52g data        8.22
```

Windows really uses ~71 GB (up from ~31.6 GiB at import: updates, language packs, DISM
repair). The thin volume now matches that (8.22% ≈ 76.6 GiB). Windows will keep freeing
space through its weekly Optimize Drives task. Snapshots still hold older blocks.

## 2026-11-20 UTC — BitLocker was on in VM 101; decryption started

`lvs` after the failed backup: `vm-101-disk-2` 9.28% of 931.52g (~86 GiB), pool `data`
19.98% (unchanged), `vm-100-disk-1` 10.85% of 500g. So only used space was encrypted and
the pool is not filling; the backup had read almost all allocated data when the disk ran
out. In Windows the user ran:

```
PS> manage-bde -off C:
Decryption is now in progress.
```

This confirms BitLocker/device encryption was on (enabled by Windows itself; the import
plan required it off). Decision: run the Windows VM without BitLocker so backups compress
and thin provisioning works; the backup file must then be stored privately. Next: wait for
"Fully Decrypted", enable `discard` on `sata0`, run TRIM, then back up again.

## 2026-11-20 17:11 UTC — First VM 101 backup failed: local disk full, data incompressible

User confirmed they deleted `/var/lib/vz/dell-windows.vhdx` earlier. Before the backup:
`/` (pve-root) 94G, 80G free; thin pool `pve/data` 19.97% of 793.80g.

```
INFO: backup mode: stop
INFO:   9% (86.3 GiB of 931.5 GiB) in 2m 16s, read: 719.3 MiB/s, write: 586.9 MiB/s
zstd: error 70 : Write error : cannot write block : No space left on device
ERROR: Backup of VM 101 failed - vma_queue_write: write error - Broken pipe
```

vzdump removed the partial archive; the VM was resumed. Write ≈ read from the start means
the Windows disk is almost all non-zero, incompressible data, although the imported
Windows used ~31.6 GiB. Main hypothesis: BitLocker/device encryption encrypting the whole
disk inside the VM (TPM + Secure Boot + Microsoft account). Risk: if VM 101's thin volume
grows to its 932 GiB size, it overfills the 794 GiB thin pool shared with VM 100.
Next: check `lvs` for vm-101-disk-2 and `manage-bde -status C:` in Windows.

## 2026-11-20 UTC — No Windows autostart; CD ejected; backup to a local file

User decided Windows VM 101 must **not** start automatically (no `onboot`; started
manually with `qm start 101` or the web UI). The driver CD was ejected live:

```
# qm set 101 --ide2 none,media=cdrom
update VM 101: -ide2 none,media=cdrom
```

Backup decision: `vzdump` of VM 101 to the host's `local` storage
(`/var/lib/vz/dump`), together with a copy of `/root/dell-msdm.bin` (not part of the VM
backup). The user downloads both and stores them in their cloud. Old snapshots and the
imported `/var/lib/vz/dell-windows.vhdx` are removed only after the new backup is verified.

## 2026-11-20 16:5x UTC — VM 101: VirtIO drivers, guest agent and VirtIO network

On proxmox-madrid: downloaded `virtio-win.iso` (0.1.302) to
`/var/lib/vz/template/iso/`, set `agent: enabled=1`, attached the ISO as `ide2` CD-ROM.
Snapshot `before-virtio` was taken at 16:53:51 just after a fresh start (Windows was
booting, no filesystem freeze); kept as near-clean. In Windows the user ran
`virtio-win-gt-x64` (drivers) and the guest agent is running. Then:

```
# qm agent 101 ping && echo OK
OK
# qm shutdown 101 --timeout 120 && qm status 101
status: stopped
# qm set 101 --net0 virtio=BC:24:11:23:58:97,bridge=vmbr0
# qm guest cmd 101 network-get-interfaces | grep '"ip-address"'
            "ip-address" : "192.168.0.28",
```

The agent answers and Proxmox can now shut Windows down cleanly (the earlier
`qm shutdown` without the agent timed out). The NIC moved from `e1000` to `virtio`
with the same MAC; Windows got 192.168.0.28 by DHCP. The disk stays on SATA.
Snapshots now: `before-oem-key` → `before-virtio`.

## 2026-11-20 UTC — Windows VM switched to English after repairing Windows files

Windows in VM 101 was installed in Spanish (`es-ES` LpCab). The English pack was only a
Store add-on (`en-US` LXP), so Settings stayed Spanish even with English as the display
language. `Install-Language en-US -CopyToSettings` failed twice:

```
Install-Language : Language pack or features could only be partially installed. ErrorCode: -2146498159.
```

(0x800F0991, Windows component store.) Fixed by `DISM /Online /Cleanup-Image /RestoreHealth`
(completed successfully), `sfc /scannow` ("found corrupt files and successfully repaired
them") and Windows Update (2026-11 Preview Update KB5132057, build 26300.10075). The next
attempt succeeded:

```
Language Language Packs  Language Features
-------- --------------  -----------------
en-US    LpCab, LXP      BasicTyping, Handwriting, Speech, TextToSpeech, OCR
```

After a restart the user confirmed Windows is in English everywhere. Settings → Activation
also shows Windows 11 Pro as active. The Windows user account is local `user`.

## 2026-11-20 12:54 UTC — Windows 11 Pro activated with the Dell firmware key

`slmgr /dlv` in VM 101 (user screenshot; VM clock confirmed correct):

```
Name: Windows(R), Professional edition
Description: Windows(R) Operating System, OEM_DM channel
Product Key Channel: OEM:DM
License Status: Licensed
Trusted time: 11/20/2026 12:54:06 PM
```

Activation is complete: the Dell's own OEM key from its MSDM table, passed to the VM
with its SMBIOS identity. The earlier 0xC004F014 was transient; no restart, `/rilc` or
phone activation was needed. VORPC's reply is no longer needed and no licence was bought.
VM 101 now depends on `/root/dell-msdm.bin` on proxmox-madrid; a VM backup does not
contain it. Snapshot `before-oem-key` can be deleted once Windows is stable.

## 2026-11-20 UTC — Firmware key is Pro and installed; online activation failed

Inside VM 101 (admin PowerShell, key masked in the user's screenshot):

```
PS> (Get-CimInstance SoftwareLicensingService).OA3xOriginalProductKeyDescription
[4.0] Professional OEM:DM
slmgr /ipk  -> Installed product key ... successfully.
slmgr /ato  -> Activating Windows(R), Professional edition ...
               Error: 0xC004F014 The Software Licensing Service reported that the product key is not available
```

The VM sees the Dell MSDM table and the key matches the installed edition, so the
VM-side setup works. The first online activation right after installing the key failed.
`slmgr /dlv` was not run (typed as `/dlt`). Next: confirm the OEM:DM channel, restart
and retry, then `slmgr /rilc`, then phone activation (`slui 4`).

## 2026-11-20 UTC — VM 101 gets the Dell MSDM table and SMBIOS identity

User shut VM 101 down (the first `qm shutdown` timed out; the second with
`--timeout 300` succeeded), took snapshot `before-oem-key` (disk, EFI and TPM volumes),
set the Dell identity and started the VM:

```
args: -acpitable file=/root/dell-msdm.bin
smbios1: uuid=d734033c-fe5f-458c-923d-a379faee0499,manufacturer=RGVsbCBJbmMu,product=T3B0aVBsZXggTWljcm8gNzAxMA==,serial=RFNZUExZMw==,base64=1
swtpm_setup: Not overwriting existing state file.
```

The base64 values decode to `Dell Inc.`, `OptiPlex Micro 7010` and `DSYPLY3`; the VM
UUID is unchanged and the TPM state was kept. LVM printed the known thin-pool
oversubscription warnings (sum of thin volumes ~2.31 TiB vs ~930 GiB pool). Next: in
Windows, check the firmware key edition, then install it and activate. Rollback:
`qm rollback 101 before-oem-key`, plus `qm set 101 --delete args` and
`qm set 101 --smbios1 uuid=d734033c-fe5f-458c-923d-a379faee0499`.

## 2026-11-19 23:50 UTC — Dell firmware has an OEM Windows key (MSDM)

User ran the read-only check on proxmox-madrid; the key was masked before pasting:

```
-r-------- 1 root root 85 Nov 19 23:44 /sys/firmware/acpi/tables/MSDM
*****-*****-*****-*****-*****
```

The Dell firmware holds an OEM product key, so activation no longer depends on VORPC.
Decided: pass the MSDM table and the Dell SMBIOS identity to VM 101, check in Windows
that the key is for the Professional edition, then install it and activate online.
Snapshot VM 101 first. Never record the key itself. Steps are in
[the setup plan](windows-backup-proxmox-plan.md#activate-with-the-dell-firmware-key).

## 2026-11-19 22:45 UTC — VORPC licence email sent; no reply yet

User reports the Spanish email “Pedido #102889 — Ayuda para reactivar Windows 11 Pro”
was sent to `vorpc@vorpc.es`. The exact send date was not recorded. As of 2026-11-19
there is no reply, and Windows 11 Pro in VM 101 is still not activated.

Decided the fallback order if VORPC stays silent (details in
[the setup plan](windows-backup-proxmox-plan.md#if-vorpc-does-not-reply)): first try
local, read-only checks for a firmware OEM key on the Proxmox host, then chase VORPC
by other channels, then escalate as a warranty claim before the 30-day return window
closes (delivered 2026-11-13, so around 2026-12-13). No new licence was bought.

## 2026-11-14 20:56 UTC — Windows restored; activation remains open

Recorded VM 101 `dell-windows` creation (4 shared vCPUs, 8 GiB maximum/4 GiB balloon
minimum), EFI/TPM setup, successful VHDX import and SATA boot. User confirmed Windows
boots, internet works, and files/applications are present. Post-import thin pool is
5.38% used; Windows allocation ~31.6 GiB despite its ~932 GiB logical disk.

Remaining recovery task: activate Windows 11 Pro. Error 0xC004F211; troubleshooter
found no eligible account-linked device. License reports RETAIL / Notification.
Prepared an unsent Spanish Gmail draft to the invoice-verified VORPC address,
requesting license details/key or reactivation instructions for order 102889.
User reviewed the English translation. No message has been sent and activation is
not claimed complete. Detailed evidence and separate driver/agent/autostart/backup
follow-ups are in [the setup plan](windows-backup-proxmox-plan.md#windows-recovery-result--2026-11-14).

## 2026-11-14 17:37 UTC — End-to-end power recovery and VM autostart passed

User tested an abrupt power cut followed by restoration of power and confirmed
that the VM started working automatically. Record this as a passed end-to-end test
of Dell AC Recovery Power On, Proxmox startup and Debian VM 100 `senaev-madrid`
autostart. This supersedes the earlier pending host-reboot/autostart check.
No separate post-recovery QEMU agent command output or application-level recovery
results were supplied. No settings were changed by this documentation update.

## 2026-11-14 17:35 UTC — Windows restore preflight recorded

Before starting Windows recovery, consolidated the installation progress and user
command evidence in [the setup plan](windows-backup-proxmox-plan.md#windows-recovery-preflight--2026-11-14).
Debian VM 100 `senaev-madrid` is running with 16384 MiB RAM and a 500 GiB disk;
the existing cluster record confirms 8 vCPUs. Start at boot and QEMU Guest Agent are
enabled in its Options screenshot; user reports agent checks work. A separate full
host-reboot/autostart test remains unconfirmed. Preserved both k3s worker records.

Windows working image is `/var/lib/vz/dell-windows.vhdx`, VHDX, 932 GiB logical,
36892049920 bytes file length (~34.4 GiB). The user explicitly requested checksum
validation after previously skipping it. `sha256sum` returned
`e05509082e46209f48f71bfb5b55bd74d718a5cd89995c9acf01e7c2177cc758`, matching
the original Windows capture. Transfer integrity passes; cloud-copy integrity and
Windows bootability are not implied.

Recorded current storage: local 45.42% used (48711724 KiB available), local-lvm
1.39% used (820786598 KiB available). Planned Windows VM 101 remains uncreated/
unimported in the evidence. Its 932 GiB logical disk plus Debian's 500 GiB disk
would exceed the ~793.8 GiB thin pool; review sizing/growth, preserve the VHDX and
monitor physical allocation. No host or VM configuration was changed in this update.

## 2026-11-14 17:13 UTC — senaev-madrid (Debian VM) joined the k3s cluster

The Debian VM from the plan was created as `senaev-madrid`, joined the tailnet and got
SSH keys (user report). Added it like `senaev-media`: label `vps=senaev-madrid`,
host `senaev-madrid`, user `root`. Merged to `main` in commit 1b713dde
(`✨ Add senaev-madrid worker`): `VPS_SENAEV_MADRID_*` variables, `make
worker-senaev-madrid` (in `make workers` after proxmox-madrid), vm-stack smokeping
target and iperf3 tests to hetzner and firstvds, and a sensitive node in `AGENTS.md`.

Read-only SSH check through the jump host before the bootstrap:

```text
Debian GNU/Linux 13 (trixie)
8
Mem:            15Gi       488Mi        14Gi       744Ki       726Mi        15Gi
/dev/sda2       475G  3.5G  447G   1% /
```

It shows 8 vCPUs (plan proposed 4), 16 GiB RAM and the ~500 GiB disk. User reported:

> make worker-senaev-madrid succeeded

kube-state-metrics shows `senaev-madrid` `Ready`, kubelet v1.36.5+k3s1. For
proxmox-madrid, the first iperf3 tests to hetzner and firstvds succeeded at ~20 Mbit/s.
The Deploy run for 1b713dde succeeded (`deploy (telemetry, telemetry/vm-stack)`).
After it, senaev-madrid ran iperf3-agent, smokeping-prober and node-exporter, and
hetzner and galkin already got its smokeping replies during the rolling restart.
Not confirmed: senaev-madrid iperf3 results (last in the 8-test queue), Tailscale key
expiry disabled, QEMU Guest Agent checks.

## 2026-11-14 16:32 UTC — Debian VM plan requires QEMU Guest Agent host access

User requested adding QEMU agent for access from the Proxmox host as root. Saved
Debian VM plan (16 GiB RAM, proposed 500 GiB disk, 4 vCPUs) and supplied healthy host
storage/service baseline. Added agent channel enablement before guest start, package
installation inside Debian, host ping/exec id/network checks and reboot verification.
Distinguished root command execution from interactive SSH. VMID, VM creation,
installation and agent checks are unconfirmed. Windows recovery remains planned;
capacity must be reassessed alongside the large Debian virtual disk. Docs only.

## 2026-11-14 16:15 UTC — proxmox-madrid joined the k3s cluster as a sensitive worker

User decided to add the Dell to the cluster like the existing `proxmox` host: a k3s agent
on the Proxmox VE host itself, label `vps=proxmox-madrid`, reached by its Tailscale name.
Merged to `main` in commit 1ca94635 (`✨ Add proxmox-madrid worker`):

- `VPS_PROXMOX_MADRID_HOST/_USERNAME/_LABEL` in `.env.example`, `terraform/variables.tf`,
  `terraform/terraform.tfvars.example` and the sync list of `scripts/apply-terraform.sh`.
  Local (git-ignored) `.env` and `terraform.tfvars`: host `proxmox-madrid`, user `root`.
- `make worker-proxmox-madrid`; `make workers` runs it after galkin and before the two
  home nodes in Russia, so a broken bootstrap stops before it reaches them.
- vm-stack: smokeping target `proxmox-madrid`; iperf3 agent on it, with tests
  `proxmox-madrid → hetzner` and `proxmox-madrid → firstvds` (the same as senaev-media).
- `AGENTS.md`: added to "Sensitive nodes" at the user's request — reachable only over the
  tailnet, so loss of network access is an unacceptable loss.

User ran the bootstrap and reported:

> make worker-proxmox-madrid succeeded

Not added to Datadog (the existing `proxmox` is not there either). Tailscale key expiry
for proxmox-madrid and revocation of the auth key from the screenshot are not confirmed.
Not verified yet: node `Ready`, iperf3/smokeping samples in Grafana.

## 2026-11-14 15:38 UTC — Installation, Tailscale access and DHCP stage completed

User closed this stage and requested findings/steps be saved. Recorded installed
Proxmox web/Shell access, kernel 7.0.2-6-pve, working tailnet DNS access and observed
Tailscale IP 100.113.139.72. Preserved enterprise apt 401 issue and corrective guidance
without recording the exposed auth key or claiming revocation/repository verification.
Recorded final user choice: vmbr0 DHCP only; no reservation, fixed hosts mapping,
hook or Tailscale startup dependency. Configuration screenshot and post-reboot output
show 192.168.0.23/24 scope global dynamic with expiring lease. Router port changes
reused lease; actual changed-address test and hostname behavior remain unverified.
Next stage: storage/service baseline and cloud VHDX recovery/import as Windows VM;
check logical disk sizing before import, then Jellyfin passthrough acceptance.
No server commands or configuration executed remotely; docs only. Purchase remains closed.

## 2026-11-14 15:03 UTC — Proxmox installer decisions and USB recovery recorded

User requested installation details and decisions be preserved. Recorded original
USB ISO-discovery failure, replacement KINGSTON 123.7 GB, exact dd command/output
(1706178560 bytes), successful graphical installer boot and final summary settings.
Target: /dev/nvme0n1, ext4/default sizing, Spain/Europe-Madrid/en-us; hostname
proxmox-madrid.home.arpa, nic0 with name pinning, initial static 192.168.0.23/24,
gateway/DNS 192.168.0.1, automatic reboot enabled. User explicitly chose DHCP after
installation. No router reservation, completed cloud upload, installation completion,
first SSD boot, web login or DHCP change is claimed. No server changes executed remotely.

## 2026-11-14 14:30 UTC — BIOS settings and diagnostic passes recorded

User requested all BIOS settings and passed tests be preserved before installing
Proxmox. Added setting/evidence tables to hardware-inventory.md, including internal
speaker disabled, microphone enabled, VT/VT-d enabled, keyboard detection off and
AC Recovery Power On. Recorded user-tested successful AC restoration and Dell quick
and follow-up diagnostic pass screens (2000-0000 / 90116). Follow-up selection and
Thorough mode are not visible on its result screen, so exact coverage is qualified.
Updated setup state and recorded user's choice to skip cloud checksum comparison.
Cloud upload completion, Proxmox installation and VM/passthrough tests remain unconfirmed.
Purchase remains closed. No server configuration or installation executed remotely.

## 2026-11-14 13:27 UTC — Delivered Dell BIOS hardware inventory recorded

User asked to preserve hardware parameters from BIOS photos. Recorded observed
model/identifiers, i5-13500T (6+8 cores), BIOS 1.3.1/microcode 2C, 32768 MB DDR4,
2 x 16384 MB SO-DIMM dual-channel at BIOS-reported 3200 MHz, Intel UHD Graphics,
no Wi-Fi/Bluetooth, audio and LAN MAC in hardware-inventory.md. Linked from README.
Kept transient clock/display values separate from hardware limits, retained ambiguous
numeric manufacture date verbatim, and did not claim diagnostics or BIOS input fixed.

## 2026-11-14 13:25 UTC — Windows image SHA-256 recorded

User asked to retain the hash in project history. Successful screenshot output:

```text
Algorithm: SHA256
Hash: E05509082E46209F48F71BFB5B55BD74D718A5CD89995C9ACF01E7C2177CC758
File: C:\Users\user\Downloads\dell-windows.vhdx
```

Saved reference in setup plan. Later SHA2521 invocation is a typo/error, not a new
hash. No cloud integrity comparison or VM boot verification claimed.

## 2026-11-14 09:38 UTC — Defer Windows remote access until after import

User questioned the need to prepare access before imaging when the Proxmox console
is available. Confirmed the official Proxmox guide documents a built-in guest console.
Moved configuration after import via noVNC with a virtual display. Guest networking,
RDP and guest agent are not required; Proxmox reachability, Windows boot and valid
Windows login remain prerequisites. Removed recapture solely for remote-access setup.
No VM boot, authentication or remote access has yet been tested on this Dell.

## 2026-11-14 08:31 UTC — Prepare Windows remote access before final capture

User requested:
> I this step to the documentation. And after that we need to recreate the image. Am I right?

Added edition-dependent remote access, verified account-password login, private
connectivity and Proxmox console fallback before final capture. Recapture after
configuration changes to include them; keep the existing image until the replacement
is safely uploaded. Setup through the VM console after import remains an alternative
that does not require recapture. No Windows changes or new image are confirmed.

## 2026-11-13 22:30 UTC — Windows image ready; cloud upload in progress

User confirmed:
> The image is ready. Now I am uploading it to the cloud.

Recorded Disk2vhd capture complete and upload ongoing. Screenshots establish C: fully
decrypted, internal SSD EFI/C:/recovery selection, USB volumes excluded, VHDX and VSS
selected. Next: finish upload and compare original/downloaded SHA-256 before erasure.
No checksum, VM boot test or Proxmox installation result is yet confirmed.

## 2026-11-13 21:31 UTC — Proxmox installer USB prepared

After instructions to write the Intel/AMD Proxmox VE 9.2-1 ISO with macOS dd,
user confirmed:
> everything is done

Etcher failed to start its flasher process; used macOS Terminal instead. Recorded
USB preparation complete, not boot-tested on Dell. Windows capture/cloud verification,
hardware inspection and Proxmox installation remain unconfirmed. Next prerequisite
before erasing the SSD is a verified cloud Windows image.

## 2026-11-13 21:14 UTC — Simplified to one USB and cloud Windows backup

User approved saving Disk2vhd locally and uploading the image to cloud storage:
> Okay, change the plan in the project

Replaced mandatory Clonezilla/external-disk workflow with local VHDX capture,
private cloud upload and downloaded-copy SHA-256 verification before wiping SSD.
One USB is used only for the Proxmox installer. Preserved encryption, VM boot,
activation and hardware acceptance checks; clarified that no factory-disk restore
backup is produced by this simplified workflow. No backup or installation executed.

## 2026-11-13 20:28 UTC — Arrival and Windows preservation plan recorded

User confirmed arrival and asked:
> Okay, let's write this plan into our project

Added windows-backup-proxmox-plan.md: hardware inspection, separate external backup
storage, full-disk Clonezilla backup plus Disk2vhd VM copy, verification before erasing,
Proxmox on internal SSD and Windows VM import. Recorded encryption/licensing caveats,
rollback and Jellyfin acceptance checks. Purchase remains complete; setup is pending.
No disk backup, installation or infrastructure changes executed.

## 2026-11-11 08:46 UTC — Purchase project completed and closed

User confirmed:
> I ordered Dell for the price that was listed. Something like 599.89.
> And now it is being shipped to my office.
> So we can mark this project as completed. And close it

Marked purchase complete: VORPC Dell Micro 7010, 32 GB / 1 TB, order 102889,
€599.89 delivered. Shipping to office is user-confirmed; arrival remains pending.
Hardware inspection and Proxmox/Jellyfin acceptance testing remain follow-up and
are not represented as passed. Updated README result and project status together.

## 2026-11-08 21:51 UTC — Dell ordered from VORPC

User reported:
> I ordered Dell

Order confirmation screenshot:
> Número de pedido: 102889
> Fecha: 08/11/2026
> Total: 599,89 € EUR
> Método de pago: Google Pay (WooPayments)
> Envío GRATIS en 48–72 horas

Product: refurbished Dell OptiPlex Micro 7010, i5 13 Gen, 32 GB RAM, 1 TB M.2 NVMe.
Recorded order received, not dispatched/delivered. No address or payment-card details
copied into repository. Dell replaces shortlist; actual CPU, AC recovery, noise,
network stability and reliable Linux VM Jellyfin passthrough remain acceptance checks.

## 2026-11-08 19:18 UTC — Dell requirements and retailer checked

Completed Dell/VORPC investigation in research-intel-options.md. Latest listing:
> 599,89 €
> Solo quedan 10 disponibles

Price supersedes earlier €533.34 observation. Dell confirms compact dimensions,
64 GB RAM ceiling and AC Recovery. Passthrough/reset reliability and noise remain
unverified. Retailer identity matches independent listings; Trustpilot 4.4/5,
PcComponentes 3.8/5 and shop deactivated for unknown reason. Documented conflicting
return-shipping marketing and customized-configuration exclusion; written testing
and return confirmation needed. No seller contact, order or deployment changes.

## 2026-11-08 18:21 UTC — Mandatory AC recovery and Jellyfin GPU passthrough; Intel prices

User request:

> Also let's add automatic enablement when power on and passing through GPU to the virtual machines as a requirement for our project.

Added BIOS AC recovery and reliable full GPU passthrough to a Linux VM for Jellyfin.
SER8 preference is on hold; trustworthy refurbished/used Intel machines are acceptable.
Recorded three price paths and limits in research-intel-options.md. VORPC Dell Micro
7010 i5-13500T 32 GB/1 TB at €533.34 VAT included is the strongest price lead; exact
CPU, VM GPU recovery and noise need confirmation. No order, seller communication or
deployment change was made.

## 2026-11-08 16:37 UTC — Beelink SER8 chosen as preferred purchase candidate

User decision:

> Okay, let's change the project and now say that Zef Ser8 is the best candidate for now and most probably I will order it

Recorded the intended model as Beelink SER8 8745HS, 32 GB RAM and 1 TB SSD,
at the observed €929 EU-store price. Purchase remains pending. Confirmed living-room
noise priority, SSD-only storage and willingness to assemble. Replaced the initial
Intel/M3 recommendation with SER8; documented occupied RAM slots, vacant SSD slot,
upgrade caveats and outstanding checkout/Proxmox/noise acceptance checks.

## 2026-11-08 15:04 UTC — Spain hardware research and initial shortlist

User confirmed new hardware only, up to roughly 10–15 litres and media/general-server GPU use.
Screened 118 distinct pages and threads; documented sources, current-price checks,
variant/stock pitfalls and two budget paths. No final purchase choice or deployment changes.
Internal hard-drive requirements, assembly and noise questions were not answered.

## 2026-11-08 10:56 UTC — Reformulated as a home server purchase

The user set a maximum budget of €1,000, at least 32 GB RAM, at least 1 TB SSD
and a capable GPU. Following the LLM speed experiments, large local LLMs no longer
drive this purchase. GPU workload and VRAM have not been specified.

Rewrote the current goal and plan; preserved the previous README verbatim in
llm-experiments.md. No deployed services or configurations were changed.
