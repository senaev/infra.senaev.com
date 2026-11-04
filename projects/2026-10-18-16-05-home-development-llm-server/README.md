# 2026-10-18 — Local LLM inference API on `senaev-media`

- [ ] Run a local LLM with an OpenAI-compatible API on `senaev-media`, with the models stored on the media disk, without risk to the media services or to the node's network access

## Goal

A local LLM that other services and devices can call through an API. It runs on the
existing home server, as a pod on `senaev-media`. We do not buy new hardware now.

The first version of this task (moved from the Obsidian vault) was about buying a new home
server for development and LLM work. That is now deferred: we first find out what the
current hardware can do (see "Deferred: new hardware" below).

## Context

- `senaev-media` is VM 100 on the `proxmox` host. Both are sensitive nodes: see
  "Sensitive nodes" in the root `AGENTS.md`. The user increased the VM memory to 12 GB.
- Host hardware (from the Obsidian note "My home server"):

  | Component | Value |
  | --- | --- |
  | Box | CW-TWL-4L-N150 (purchase entry: TopTon X4C-XL) |
  | CPU | Intel N150: 4 E-cores, 4 threads, AVX2 and AVX-VNNI, no AVX-512; Intel UHD iGPU |
  | RAM | 1 × 16 GB DDR5-4800 SO-DIMM (Kingston KF548S38IB-16), **single channel, ~38 GB/s peak**; 1 slot, recorded maximum 32 GB |
  | Disk | Kingston NV3 1 TB NVMe, PCIe 4.0 |

- Media storage: `mediaServerStoragePath: /mnt/sdb1` in
  `provisioning/helm/common-values.yaml`. Pods use `hostPath` volumes under it, for example
  `/mnt/sdb1/volumes/jellyfin` (`provisioning/helm/senaev-com/templates/jellyfin.yaml`).
- Other workloads on `senaev-media` (`provisioning/helm/senaev-com/values.yaml`): Jellyfin,
  Unmanic (limit 2 CPU, 2Gi), qBittorrent, media-server-helper, filebrowser, webdav,
  xray-vpn, the Datadog agent, and the planned ClickHouse
  (`projects/2026-10-18-15-06-clickhouse-logs-stack/README.md`). Jellyfin and Unmanic use the iGPU
  through `/dev/dri`.
- media-server-helper deletes completed torrents when `/mnt/sdb1` is 98% full, down to 95%.
  It only touches qBittorrent folders, so it does not delete models; but models take space
  from media.
- Chart pattern: a template in `provisioning/helm/senaev-com/templates/`, a values block with
  `enabled` and `vps`, secrets from Vault `senaev-com-kv` through `senaev-com-kv-secrets`.

## Plan

1. **Use case** (decided 2026-11-04): personal tasks — analyse and summarise text in
   Russian; maybe n8n automations. No coding agent, no code autocomplete.
   - The model must be good in Russian: compare Qwen3-4B-Instruct-2507 and Gemma-3-4B-it
     on our own Russian texts (step 9).
   - Summaries need long prompts, and prompt processing is the slow part on this CPU: a
     prompt of a few thousand tokens can take a minute or more. Use the LLM for jobs that
     can wait (n8n, a request that answers later), not for an interactive chat.
   - Code autocomplete is out of scope (decided 2026-11-04): it needs an answer in less than
     ~1 s with 1–2k tokens of code context, which the N150 cannot give, and it would take
     CPU from the summaries. A small model on the laptop itself is the better option.
2. **Capacity check** (read-only; the user runs the commands):
   - on `proxmox`: `free -h`, `qm config 100` (`memory`, `balloon`, `cpu`), `zfs list` /
     `arc_summary` if the host uses ZFS, `kubectl top pod -A --field-selector spec.nodeName=proxmox`
   - on `senaev-media`: `free -h`, `nproc`,
     `grep -o -w 'avx2\|fma\|avx_vnni' /proc/cpuinfo | sort | uniq -c`,
     `df -h /mnt/sdb1`, `lsblk -d -o NAME,ROTA,SIZE`
   - `kubectl top node senaev-media`, `kubectl describe node senaev-media` (allocated requests)
3. **Protect network access before the first deploy** (ask the user first):
   - If the VM CPU type is not `host`, the VM does not see AVX2 and inference is several
     times slower. To change it needs a VM stop and start: a high-risk step, with a rollback
     command ready (`qm set 100 --cpu <old value>`).
   - Make `tailscaled` on `senaev-media` the last process that the OOM killer selects. Apply it
     live, without a restart: `choom -p "$(pidof tailscaled)" -n -1000`. To keep it after a
     reboot, add `OOMScoreAdjust=-1000` in a systemd drop-in; it takes effect at the next
     normal reboot, not now.
   - Make sure that the `proxmox` host keeps enough free memory with the VM at 12 GB
     (the host now has about 4 GB for Proxmox, its k3s agent and its pods). If the host
     runs out of memory, its OOM killer stops the whole VM.
   - *2026-11-04:* the check confirmed that the VM has no AVX2 (`cpu` is not set, so QEMU
     uses `kvm64`). The CPU type change is required. The host has 1.3 GiB available and
     8 GiB swap, and the VM already holds all of its 12 GiB. See Findings.
4. **Model storage**: `hostPath` `/mnt/sdb1/volumes/llm/models`. An init container downloads
   the model GGUF from Hugging Face once, with a pinned revision and a SHA-256 check, and
   skips the download when the file is already there.
5. **Inference server**: `llama-server` from llama.cpp (image `ghcr.io/ggml-org/llama.cpp`,
   pinned `server-<build>` tag), new template `provisioning/helm/senaev-com/templates/llm-server.yaml`
   and values block `llmServer` (`enabled`, `vps: senaev-media`, model URL and hash,
   context size).
   - flags: `--threads 3` (one core stays free for Jellyfin and the node),
     `--parallel 1`, `--ctx-size 16384` with `--cache-type-k q8_0 --cache-type-v q8_0`
     (room for long texts to summarise; the KV cache of a 4B model is then ~1–1.5 GB),
     `--no-mmap` (the model memory counts against the pod
     limit and is not page cache that the kernel can drop and read again), `--metrics`
     (*2026-11-04:* no API key, see Findings)
   - resources: memory request = limit = model + KV cache + 0.5 GiB; CPU request 1, limit 3
   - 1 replica, `Recreate`, readiness probe on `/health`
6. **Access**: a ClusterIP Service and a NetworkPolicy that allows only the selected
   consumers (n8n and cluster-helper). No public endpoint for now (decided 2026-11-04). From
   the laptop, use `kubectl port-forward` on the control plane.
7. ~~**Secrets**: put `LLM_SERVER_API_KEY` in Vault `senaev-com-kv`.~~ Dropped 2026-11-04:
   no API key, the NetworkPolicy is the access control.
8. **Monitoring**: vmagent scrapes `/metrics`; a vmalert rule sends a Telegram alert when the
   pod restarts or is OOM-killed.
9. **Benchmark**: for each candidate model, measure prompt processing and generation speed
   (tokens/s), and the memory use. Run a Jellyfin transcode at the same time and check
   that playback does not stutter.
10. **Optional**: test the llama.cpp Vulkan backend on the iGPU (`/dev/dri`, shared with
    Jellyfin and Unmanic). It can make prompt processing faster; generation speed stays
    limited by memory bandwidth.

Candidate models (the budget for the pod is about 6 GB, see Findings):

| Model | GGUF size (Q4_K_M) | Use |
| --- | --- | --- |
| Qwen3-4B-Instruct-2507 | ~2.5 GB | Russian analysis and summaries |
| Gemma-3-4B-it | ~2.5 GB | Russian analysis and summaries (strong multilingual) |

## Verification

- `POST http://llm-server:8080/v1/chat/completions` from an n8n or cluster-helper pod returns
  an answer; the same request from another pod is blocked.
- A model download survives a pod restart: the second start does not download again.
- The benchmark numbers are in Findings.
- Jellyfin playback with transcoding works while the LLM generates.
- `free -h` on `proxmox` and on `senaev-media` shows free memory under load; no OOM kills
  outside the LLM pod (`journalctl -k | grep -i oom`).
- `senaev-media` stays reachable (`tailscale status` shows `direct`, SSH works).

## Deferred: new hardware

Kept from the first version of this task. Return to it if the benchmarks show that the
current host is too slow for the selected use case.

- Requirements: headless, wired, Proxmox with VMs and Docker for development, local LLM
  through an API; passive cooling, metal case, low power, low maintenance; reliability and
  low temperatures matter more than speed; compare ready-made machines on Amazon Spain with
  a custom build.
- Complaints about the current host: the RAM runs hot (measure the real temperatures under
  load before you blame DDR5; the module is already 1.1 V); maybe a smaller box.
- Open questions: budget, size and noise limits; passive or very quiet active cooling;
  target models, quantisation, context and parallel requests; inference only (no training);
  one machine or a development server plus a separate LLM node; system RAM and VRAM
  separately (shared memory needs one budget for host, VMs and inference); Linux drivers,
  IOMMU groups and GPU passthrough for the exact model; DDR generation depends on the CPU.
- A cheap step before a new machine: a 32 GB SO-DIMM in the current host. It does not make
  generation faster, but it lets the host run a mixture-of-experts model such as
  Qwen3-30B-A3B (~18 GB at Q4, ~3B active parameters), which is usable on low memory
  bandwidth. ❓ Check that the board takes 32 GB (or 48 GB) modules.

## Findings

### 2026-10-18 — Requirements and previous hardware captured

(From the Obsidian vault.) Read "My home server"; copied the hardware details and concerns.
Recorded the headless Proxmox and container requirements and the local inference goal. No
hardware selected or purchased. Amazon direct listing access was not available through web
retrieval.

### 2026-11-03 — Moved to this repo; new scope: `senaev-media`

The user decided to run the LLM on `senaev-media` (VM memory now 12 GB) and to keep the
models on the media storage `/mnt/sdb1`.

Review of the plan:

- **It makes sense as a cheap first step**, for small models and short prompts. No purchase,
  the deploy follows the existing chart pattern, and the benchmarks give real numbers for
  the hardware decision later.
- **Speed is limited by memory bandwidth.** Generation speed is about bandwidth ÷ model size.
  Single-channel DDR5-4800 gives ~38 GB/s peak, ~25 GB/s in practice, shared with all other
  pods. Estimates (to confirm in step 9): 7B Q4 ~4–5 tokens/s, 4B Q4 ~8–10 tokens/s. Prompt
  processing on 4 E-cores is about 20–60 tokens/s for a 7B model.
- **Not useful for a coding agent.** OpenCode sends prompts of 10–30k tokens: at that
  prompt speed, one request takes several minutes before the first output token, and good
  agent models (30B and more) do not fit in memory.
- **Memory budget.** 12 GB in the VM minus the current media pods (Unmanic alone has a 2Gi
  limit) and the planned ClickHouse leaves about 6 GB for the LLM pod. Confirm in step 2.
- **Main risk is memory, not the disk.** The LLM pod has a memory limit, so the cgroup OOM
  killer stops only that pod. But if the VM runs out of memory, the kernel OOM killer can stop
  `tailscaled`, and we lose access to the node. If the `proxmox` host runs out of memory, it
  stops the whole VM. Step 3 is there for this reason.
- **CPU type.** Proxmox VMs often use a generic CPU type without AVX2. Check it in step 2.
- **Storage is a good fit.** `/mnt/sdb1` is on the NVMe (to confirm with `lsblk`), so a model
  loads in seconds; models take only a few GB of the 1 TB.

### 2026-11-04 — Capacity check (step 2)

`proxmox`:

```
❯ free -h
               total        used        free      shared  buff/cache   available
Mem:            15Gi        14Gi       255Mi        38Mi       1.4Gi       1.3Gi
Swap:          8.0Gi        40Mi       8.0Gi
❯ qm config 100
agent: 1
balloon: 0
bios: ovmf
cores: 4
hostpci0: 0000:00:02,pcie=1
machine: q35
memory: 12288
onboot: 1
scsi0: local-lvm:vm-100-disk-0,discard=on,size=35G,ssd=1
scsi1: local-lvm:vm-100-disk-1,backup=0,discard=on,iothread=1,size=500G,ssd=1
serial0: socket
vga: serial0
...
```

`senaev-media`:

```
❯ free -h
               total        used        free      shared  buff/cache   available
Mem:            11Gi       1.6Gi       190Mi        87Mi        10Gi        10Gi
Swap:             0B          0B          0B
❯ nproc
4
❯ grep -o -w 'avx2\|fma\|avx_vnni' /proc/cpuinfo | sort | uniq -c
(no output)
```

`df` and `lsblk` did not run (the command was pasted with the Markdown backticks).

```
kubectl top node senaev-media
NAME           CPU(cores)   CPU(%)   MEMORY(bytes)   MEMORY(%)
senaev-media   138m         3%       3198Mi          26%

kubectl describe node senaev-media
...
Capacity:      cpu: 4   memory: 12250412Ki
Allocatable:   cpu: 4   memory: 12250412Ki
...
  senaev-com   jellyfin-dd6586949-d9w2w   0 (0%)  0 (0%)  0 (0%)  0 (0%)  25d
  senaev-com   unmanic-7887c54c79-jvq4n   0 (0%)  0 (0%)  0 (0%)  0 (0%)  25d
...
Allocated resources:
  cpu                30m (0%)   200m (5%)
  memory             96Mi (0%)  384Mi (3%)
```

What it shows:

- **No AVX2, no FMA, no AVX-VNNI in the VM.** `qm config` has no `cpu:` line, so QEMU
  uses `kvm64`. llama.cpp would run with SSE only, several times slower. The CPU type
  change (step 3) is a blocker for this task.
- **Recovery path exists.** The VM has a serial console (`serial0: socket`, `vga: serial0`),
  so from `proxmox` `qm terminal 100` reaches the VM even when its network is down, while
  `proxmox` itself stays reachable.
- **Host memory is tight but stable.** `balloon: 0`, and the VM page cache (10Gi) means
  the guest has touched all of its memory, so QEMU already holds the full 12 GiB. The LLM
  pod does not make the host use more memory. The risk on the host is only from its own
  workloads (the `proxmox` k3s pods); 8 GiB swap is a buffer. Do not raise the VM memory
  again.
- **Storage:** `scsi1` (500G, `local-lvm`, `ssd=1`) is very likely `/mnt/sdb1`, on the
  NVMe thin pool. A full thin pool gives I/O errors to all VMs on it, so check its usage.
- **VM memory:** 3.2 GiB working set, so about 8.8 GiB is free before ClickHouse and
  transcoding peaks. The ~6 GB budget for the LLM pod stays valid.
- **No memory reserve for the system.** Allocatable = Capacity, and almost no pod has
  requests or limits. A pod without a limit (Jellyfin, Unmanic, qBittorrent) can push the
  VM into the kernel OOM killer, which can select `tailscaled`. Note: `unmanic.resources`
  in `values.yaml` (limit 2Gi) is not applied to the pod.

### 2026-11-04 — Thin pool, serial console

```
❯ lvs
  LV                VG  Attr       LSize    Pool Origin Data%  Meta%
  base-9001-disk-0  pve Vri---tz-k    3.00g data
  data              pve twi-aotz-- <793.80g             58.47  2.10
  root              pve -wi-ao----   96.00g
  swap              pve -wi-ao----    8.00g
  vm-100-cloudinit  pve Vwi-aotz--    4.00m data        9.38
  vm-100-disk-0     pve Vwi-aotz--   35.00g data        53.19
  vm-100-disk-1     pve Vwi-aotz--  500.00g data        88.86
  vm-9001-cloudinit pve Vwi---tz--    4.00m data
❯ qm terminal 100
starting serial terminal on interface serial0 (press Ctrl+O to exit)
[48700.529649] audit: type=1400 audit(1793790234.515:19961): apparmor="DENIED" operation="ptrace" class="ptrace" profile="cri-containerd.apparmor.d" pid=4824 comm="agent" requested_mask="read" denied_mask="read" peer="unconfined"
... (the same line every 2–10 s)
```

- **The thin pool cannot fill up.** The pool is 794G, 58% used. The sum of all thin
  volumes is 35G + 500G + 3G = 538G, less than the pool, so it is not overcommitted.
  `vm-100-disk-1` (500G) has 89% of its blocks written; models of a few GB fit, and
  media-server-helper keeps the filesystem under 98%.
- **The serial console works**, but the login prompt was not confirmed: the console is
  flooded with AppArmor `ptrace` denials from the Datadog agent (`comm="agent"`) every few
  seconds. This is a separate, existing issue. The flood makes the console hard to use in an
  emergency; `dmesg -n 1` in the VM stops kernel messages on the console until the next boot.

`kubectl top pod -A --field-selector spec.nodeName=proxmox` failed:
`"spec.nodeName" is not a known field selector` (`kubectl top` does not support it).

### 2026-11-04 — CPU type changed to `host` (step 3)

```
❯ qm set 100 --cpu host
update VM 100: -cpu host
❯ qm shutdown 100 --timeout 180 && qm start 100
generating cloud-init ISO
WARN: no efidisk configured! Using temporary efivars disk.
WARN: iothread is only valid with virtio disk or virtio-scsi-single controller, ignoring
kvm: -device vfio-pci,host=0000:00:02.0,id=hostpci0,bus=ich9-pcie-port-1,addr=0x0: info: OpRegion detected on Intel display 46d4.
Task finished with 2 warning(s)!
```

The VM stopped and started again in 1m 42s. Both warnings existed before this change and
are not caused by it:

- `no efidisk`: OVMF keeps its EFI variables only until the VM stops. The VM boots from
  the default boot path, so this works; add an EFI disk later if the boot order is lost.
- `iothread ... ignoring`: `iothread=1` on `scsi1` does nothing with `virtio-scsi-pci`. To
  use it needs `scsihw: virtio-scsi-single` and one more VM restart; not needed now.

The `OpRegion` line shows that the iGPU passthrough started. Not yet verified: network
access, AVX2 in the guest, `/dev/dri` and the pods.

### 2026-11-04 — Check after the CPU change

`senaev-media`:

```
❯ grep -c -w avx2 /proc/cpuinfo
4
❯ grep -o -w 'avx2\|fma\|avx_vnni' /proc/cpuinfo | sort | uniq -c
      4 avx2
      4 avx_vnni
      4 fma
❯ ls -l /dev/dri
drwxr-xr-x 2 root root         80 Nov  4 11:09 by-path
crw-rw---- 1 root video  226,   0 Nov  4 11:09 card0
crw-rw---- 1 root render 226, 128 Nov  4 11:09 renderD128
❯ df -h /mnt/sdb1
Filesystem      Size  Used Avail Use% Mounted on
/dev/sdb1       492G  436G   31G  94% /mnt/sdb1
❯ lsblk -o NAME,ROTA,SIZE,MOUNTPOINT
sda        0   35G
|-sda1     0 34.9G /
...
sdb        0  500G
`-sdb1     0  500G /mnt/sdb1
❯ cat /proc/$(pidof tailscaled)/oom_score_adj
0
```

`hetzner`:

```
100.87.199.13   proxmox       ...  active; direct 46.48.65.87:1039, tx 2350458316 rx 6455508762
100.103.254.98  senaev-media  ...  active; direct 46.48.65.87:41641; offline, last seen 1m ago, tx 4603244 rx 1142792
```

Control plane: all 11 pods on `senaev-media` are `Running`, restarted 2m6s before (the VM
restart). On `proxmox` there are only `smokeping-prober` (9Mi) and `node-exporter` (11Mi).

```
NAMESPACE    NAME                                   READY  STATUS   RESTARTS      AGE
datadog      datadog-87w2f                          3/3    Running  6 (2m6s ago)  3d21h
senaev-com   jellyfin-dd6586949-d9w2w               1/1    Running  2 (2m6s ago)  25d
senaev-com   unmanic-7887c54c79-jvq4n               1/1    Running  2 (2m6s ago)  25d
...
```

What it shows:

- **Step 3 (CPU type) is done.** The guest has AVX2, FMA and AVX-VNNI on all 4 cores;
  the iGPU (`renderD128`) is still there for Jellyfin and Unmanic.
- **Network access works**: SSH to `senaev-media` worked, the data path from `hetzner` is
  `direct`, and kubelet reports the pods. But `tailscale status` on `hetzner` also says
  `offline, last seen 1m ago`: the coordination server did not yet see the node online
  again. This is the same weak point as the 2026-10-05 outage (the home ISP link to the
  coordination server). ❓ Check again; the `offline` flag must be gone.
- **Disk:** `/mnt/sdb1` is on a non-rotational disk (NVMe through the thin pool), 31G free,
  94% used. A 2.5–5 GB model brings it to about 95%. media-server-helper starts to delete
  completed torrents at 98%, so the model takes space from media sooner, but it is safe.
- **`tailscaled` has `oom_score_adj` 0**: the OOM killer can select it. Next step.
- **The `proxmox` host is safe.** Its k3s agent runs only two small DaemonSet pods, so the
  host's own memory use stays about 2 GB. Any new pod without a `nodeSelector` can still
  be scheduled on `proxmox`; a taint would prevent this (separate change).
- **Memory on `senaev-media`** right after the restart: the pods use ~1.2 GiB together
  (`datadog` 304Mi, `jellyfin` 301Mi, `media-server-helper` 276Mi, ...).

### 2026-11-04 — `tailscaled` protected from the OOM killer (step 3)

Manually on `senaev-media`, without a restart of `tailscaled`:

```
❯ echo -1000 > /proc/$(pidof tailscaled)/oom_score_adj
mkdir -p /etc/systemd/system/tailscaled.service.d
printf '[Service]\nOOMScoreAdjust=-1000\n' > /etc/systemd/system/tailscaled.service.d/oom-score.conf
systemctl daemon-reload
cat /proc/$(pidof tailscaled)/oom_score_adj
-1000
```

The same is now in `provisioning/common/bootstrap-node-networking.sh` (item 6): it writes the
same file `/etc/systemd/system/tailscaled.service.d/oom-score.conf`, runs `daemon-reload`,
sets `oom_score_adj` of the running process, and verifies both. It never restarts
`tailscaled`. The script runs on every node at bootstrap (`bootstrap-control-plane.sh`,
`bootstrap-worker.sh`), so the other nodes get it at their next bootstrap.
`npm run check:shell` passes.

### 2026-11-04 — `senaev-media` still has no control connection

`tailscale status` on `hetzner`, some minutes after the first check:

```
100.120.76.115  hetzner       andrei.senaev@  linux  -
100.90.217.37   firstvds      andrei.senaev@  linux  active; direct 157.22.197.112:41641, tx 60034844796 rx 63870727628
100.87.199.13   proxmox       andrei.senaev@  linux  active; direct 46.48.65.87:1039, tx 2351042140 rx 6457234470
100.103.254.98  senaev-media  andrei.senaev@  linux  active; direct 46.48.65.87:41641; offline, last seen 10m ago, tx 6279508 rx 30549904
```

- The data path works: `direct`, and tx/rx grew since the first check (4.6 MB → 6.3 MB,
  1.1 MB → 30.5 MB).
- But `offline` is the coordination server's view: the `tailscaled` that started with the VM
  has no control connection. It runs on the netmap that it got at start. This is the same
  state as on 2026-10-05 (`projects/2026-10-04-k3s-dual-stack-ipv6/README.md`, Round 7), where the
  long-poll to `controlplane.tailscale.com` timed out and recovered on its own after 16 min.
  `proxmox`, on the same home network, is online, so the home uplink is not fully down.
- **Risk while this lasts:** if `tailscaled` restarts on any other node, that node gets a
  new disco key, `senaev-media` does not learn it, and the path to that node fails (this
  caused the 10-minute outage on 2026-10-05). Do not restart `tailscaled` anywhere, and do
  not deploy to the cluster nodes, until `offline` is gone.

### 2026-11-04 — Control connection recovered on its own

On `senaev-media`, 14 min after the VM start:

```
● tailscaled.service - Tailscale node agent
    Drop-In: /etc/systemd/system/tailscaled.service.d
             └─oom-score.conf, override.conf
     Active: active (running) since Wed 2026-11-04 11:09:04 UTC; 14min ago
   Main PID: 718 (tailscaled)
Nov 04 11:15:05 senaev-media tailscaled[718]: control: map response long-poll timed out!
Nov 04 11:15:05 senaev-media tailscaled[718]: Received error: PollNetMap: Post "https://controlplane.tailscale.com/machine/map": context canceled
Nov 04 11:15:06 senaev-media tailscaled[718]: control: lite map update error after 2m0.001s: Post "https://controlplane.tailscale.com/machine/map": context canceled
... (the same every 2 min, last at 11:23:07)
❯ curl -sS -m 5 -o /dev/null -w "%{http_code}\n" https://controlplane.tailscale.com/
302
```

Some minutes later, on `hetzner`:

```
100.103.254.98  senaev-media  andrei.senaev@  linux  active; direct 46.48.65.87:41641, tx 7322444 rx 33319418
```

- Same pattern as 2026-10-05: a short request to the control server passes (`302`), but the
  long-poll for the netmap times out every 2 min. After about 15–20 min one poll went
  through and the node is online again. No action was needed.
- The `oom-score.conf` drop-in is loaded (`Drop-In:` line), so it applies to every start.
- Lesson: after any restart of a home node, wait until `tailscale status` on `hetzner`
  shows no `offline` before the next risky step.

### 2026-11-04 — `llm-server` chart written (steps 4–7), not deployed

- `provisioning/helm/senaev-com/templates/llm-server.yaml`: Deployment (1 replica,
  `Recreate`), ClusterIP Service on port 8080, NetworkPolicy that allows only the pods in
  `llmServer.allowedClients` (first: `n8n`).
- Values: `llmServer` block in `provisioning/helm/senaev-com/values.yaml`.
- Image `ghcr.io/ggml-org/llama.cpp:server-b12098` (the newest build tag on 2026-11-04;
  the CPU image selects the AVX2/AVX-VNNI code at runtime).
- First model: Qwen3-4B-Instruct-2507 Q4_K_M from `unsloth/Qwen3-4B-Instruct-2507-GGUF`,
  pinned to revision `a06e946b…`, 2,497,281,120 bytes, SHA-256 `3605803b…c67e597` (from the
  Hugging Face API). Gemma-3-4B-it is compared in step 9.
- The init container `download-model` (`curlimages/curl:8.23.0`) downloads the file to
  `/mnt/sdb1/volumes/llm-server/models` once, checks the SHA-256, and renames `.part` to
  the final name only when the hash matches. The next starts skip the download.
- Changed against the plan: in build b12098, `--no-mmap` is replaced by
  `--load-mode none`. The API key comes from the `LLAMA_API_KEY` env variable, not a flag,
  so it does not show in the process list. `--flash-attn on` is set because a quantised
  V cache needs it.
- Memory: request = limit = 5Gi (model 2.3 GiB + q8_0 KV cache for 16k tokens ~1.2 GiB +
  compute buffers). CPU: request 1, limit 3, `--threads 3`.
- Secret: `LLM_SERVER_API_KEY` added to `templates/external-secret.yaml`. It must exist in
  Vault before the deploy: a missing key makes the whole `senaev-com-kv-secrets` sync fail.
- `/metrics` needs the API key (only `/health` is public); this matters for step 8.
- `npm run check:helm` passes; `helm template` renders the expected objects.

### 2026-11-04 — Review changes: image in the template, cluster-helper, no API key

- The image tag is now in `templates/llm-server.yaml`, as in the other templates, not in
  `values.yaml`.
- `cluster-helper` is added to `llmServer.allowedClients`.
- **The API key is removed** (user decision): the env variable, the reloader annotation and
  the `LLM_SERVER_API_KEY` entry in `templates/external-secret.yaml`. The NetworkPolicy is
  the access control. Reason: the server reads no data and changes nothing, so an unwanted
  call costs only CPU; without the key there is no Vault step and no risk to the
  `senaev-com-kv-secrets` sync, and `/metrics` is open for vmagent (step 8). Add a key
  if the API ever gets a public endpoint.

### 2026-11-04 — Pushed to `main` (commit `e4fe4e3`)

- Rebased on 42 new upstream commits. Upstream moved `tasks/` to `projects/<folder>/README.md`,
  so this log moved to `projects/2026-10-18-16-05-home-development-llm-server/README.md`,
  and the links in `bootstrap-node-networking.sh` and `values.yaml` were updated.
- Upstream replaced `update-helm-charts.yml` with `.github/workflows/deploy.yml`, which runs
  `upgrade-namespace.sh <chart> <ns> --wait --timeout 300s`. The first start of `llm-server`
  downloads 2.5 GB over the home connection, so the `senaev-com` deploy can fail on this
  timeout while the pod continues and becomes ready later. The user accepted this risk.
- Pre-push `simple-checks` passed (lint, typecheck, 1661 tests, helm, shell, python).
- Deploy run: `41824260679`.

### 2026-11-04 — Deploy run `41824260679`: `senaev-com` failed on the wait timeout

`check`, `plan` and `sync-provisioning` passed; no image was built (`BUILT_IMAGES: []`).
`deploy (senaev-com, senaev-com)` failed after 5m22s:

```
11:52:45 out: ✅ [upgrade-namespace senaev-com senaev-com] Namespace=[senaev-com] exists
11:57:56 out: 👉 [upgrade-namespace senaev-com senaev-com] Helm upgrade release=[senaev-com] namespace=[senaev-com]
11:57:56 err: level=WARN msg="upgrade failed" name=senaev-com error="resource Deployment/senaev-com/llm-server not ready. status: InProgress, message: Available: 0/1\ncontext deadline exceeded"
11:57:57 err: Error: UPGRADE FAILED: resource Deployment/senaev-com/llm-server not ready. status: InProgress, message: Available: 0/1
```

As expected: `llm-server` was the only resource that was not ready after 300 s, most
likely because the init container was still downloading the model. Helm runs without
`--atomic`, so nothing was rolled back: the objects stay and the pod continues. The
release is marked `failed`; the next `senaev-com` deploy upgrades it normally. To confirm,
check the pod state and the download log on the control plane.

### 2026-11-04 — `llm-server` is running

```
NAME                          READY   STATUS    RESTARTS   AGE     IP            NODE
llm-server-765bd4566c-shxf5   1/1     Running   0          6m44s   10.42.3.138   senaev-media

download-model:
100  2.32G 100  2.32G   0      0  8.87M      0   04:28   04:28          9.03M
/models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf.part: OK

llm-server:
warn: LLAMA_ARG_HOST environment variable is set, but will be overwritten by command line argument --host
0.00.020.635 W srv  server_setup: security: no API key is set and CORS allows all origins (see https://github.com/ggml-org/llama.cpp/pull/25655)
0.00.022.173 I srv    load_model: loading model '/models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf'
0.00.405.218 W load: control-looking token: 128247 '</s>' was not control-type; this is probably a bug in the model. its type will be overridden
0.04.372.812 I cmn          init: llama threadpool init, n_threads = 3
0.05.201.747 I srv    load_model: initializing, n_slots = 1, n_ctx_slot = 16384, kv_unified = 'false'
0.05.211.554 I srv  server_run_i: model loaded
0.05.211.568 I srv  server_on_li: listening on http://0.0.0.0:8080

kubectl top pod:
llm-server-765bd4566c-shxf5   1m           3673Mi
```

- The download took 4m28s at ~9 MB/s, and the SHA-256 matched. With the model load, the
  first start took a bit longer than the 300 s CI wait, which explains the failed deploy.
- The model loads from the NVMe in 5.2 s. The pod uses 3673Mi of its 5Gi limit while idle
  (model + KV cache allocated at start).
- The warnings are harmless: the image sets `LLAMA_ARG_HOST`/`LLAMA_ARG_PORT`, and the flags
  override them; no API key is a decision (NetworkPolicy), and CORS matters only for browsers,
  which cannot reach the ClusterIP; the `</s>` token warning is a known quirk of this GGUF.
- `ls` and `free -h` ran on `hetzner`, not on `senaev-media`: the path does not exist there,
  and `free` shows 7.6Gi total with 2Gi swap. Side finding: `hetzner` has only 976Mi
  available and uses 982Mi of swap. Not caused by this task, but worth a separate look.

### 2026-11-04 — Node state and the first request

`senaev-media`:

```
               total        used        free      shared  buff/cache   available
Mem:            11Gi       5.1Gi       162Mi        76Mi       6.8Gi       6.6Gi
Swap:             0B          0B          0B
-rw-r--r-- 1 root root 2497281120 Nov  4 11:57 Qwen3-4B-Instruct-2507-Q4_K_M.gguf
/dev/sdb1       492G  438G   29G  94% /mnt/sdb1
```

From the `n8n` pod, `POST /v1/chat/completions` with "Кратко: что такое Proxmox?":

```
Proxmox — это бесплатная и открытая платформа для виртуализации, работающая на Linux. ...
{
  prompt_n: 18,
  prompt_ms: 1463.599,
  prompt_per_second: 12.298450600198553,
  predicted_n: 157,
  predicted_ms: 19614.918,
  predicted_per_second: 7.953130367407092
}
```

- **The API works from `n8n`**, through the Service and the NetworkPolicy. The answer is
  correct, fluent Russian.
- **Generation: 7.95 tokens/s**, as estimated (8–10 for a 4B model). A 150-token answer
  takes ~20 s.
- Prompt speed 12.3 tokens/s is not representative: 18 tokens are mostly fixed overhead.
  A long prompt is needed to measure it for summaries (step 9).
- **Memory:** 6.6Gi still available in the VM with the model loaded. **Disk:** the model
  file is 2.4 GiB; 29G free, 94% used.

### 2026-11-04 — NetworkPolicy works; a long prompt timed out after 5 min

From `nextjs-app` (not in `allowedClients`), `GET /health` with a 5 s timeout:

```
blocked
```

From `n8n`, a prompt of ~12k characters of Russian text (the same sentence 60 times,
estimated ~3–4k tokens) with `max_tokens: 100`:

```
TypeError: fetch failed
  [cause]: HeadersTimeoutError: Headers Timeout Error
    code: 'UND_ERR_HEADERS_TIMEOUT'
```

- **The NetworkPolicy blocks other pods**, and allows `n8n` (previous entry).
- The Node.js `fetch` (undici) waits at most 300 s for the response headers, and
  `llama-server` sends them only after the prompt is processed. So prompt processing of
  ~3–4k tokens took more than 300 s: **less than ~12 tokens/s**, the same as the 12.3 tokens/s
  of the short prompt. On a CPU, prompt processing is normally several times faster than
  generation (7.95 tokens/s here), so something slows it down.
- Hypotheses, to check with the server log and the cgroup CPU statistics:
  1. **CPU throttling by the 3-core limit (CFS quota).** llama.cpp threads wait for each
     other at every step; when the quota throttles one thread, all of them stall. Signal:
     `nr_throttled` / `throttled_usec` grow in `/sys/fs/cgroup/cpu.stat` of the pod during
     a request. Fix: remove the CPU limit (keep the request) and rely on `--threads 3`.
  2. **llama.cpp did not load the AVX2 CPU backend.** Signal: the `system_info` line at
     start has no `AVX2 = 1`. Fix: pick the right image or backend.
  3. **The quantised KV cache with flash attention is slow on this CPU.** Signal: the same
     request is much faster with the default f16 cache. Fix: f16 cache with a smaller
     context.
- Datadog: the `datadog-prod-senaev-eu1` MCP server is not the org of this cluster. It has
  no hosts named `senaev-media`, `hetzner` or `firstvds`, and its logs come from Datadog's
  own production services. The cluster sends to `datadoghq.eu`
  (`provisioning/helm/datadog/values.yaml`), so the right org must be connected to read
  its logs.
  *Correction, same day:* after a reconnect, `datadog-prod-senaev-eu1` is the right org
  (hosts `hetzner-senaev-k3s`, `senaev-media-senaev-k3s`). See the next entry.

### 2026-11-04 — Datadog: the CPU limit is not the cause

`llm-server` logs (Datadog, `kube_deployment:llm-server`):

```
12:04:46  slot launch_slot_: id  0 | task 158 | processing task, is_child = 0
12:08:17  slot print_timing: id  0 | task 158 | prompt processing, n_tokens =   2048, progress = 0.41, t = 212.10 s / 9.66 tokens per second
12:09:46  srv          stop: cancel task, id_task = 158
12:15:07  slot      release: id  0 | task 158 | stop processing: n_tokens = 4099, truncated = 0
12:29:16  slot get_availabl: id  0 | task -1 | selected slot by LCP similarity, f_sim_best = 0.819 (> 0.100 thold), f_keep = 1.000
12:29:16  slot launch_slot_: id  0 | task 164 | processing task, is_child = 0
12:34:17  srv          stop: cancel task, id_task = 164
12:34:17  slot      release: id  0 | task 164 | stop processing: n_tokens = 5032, truncated = 0
```

Metrics, 12:04–12:15 (prompt processing of task 158):

| Metric | Value |
| --- | --- |
| `container.cpu.usage{kube_deployment:llm-server}` | ~2.98e9 ns/s = **3.0 cores** (the full limit) |
| `container.cpu.throttled.periods` | ~0.9 per second (~9% of the 100 ms periods) |
| `container.cpu.throttled` | ~2–3e6 ns/s = **~0.3% of the time** |
| `system.cpu.user{host:senaev-media-senaev-k3s}` | ~76% (3 of 4 cores) |

- **The prompt had ~5,000 tokens** (2048 tokens = 41%), more than estimated. Prompt speed
  was **9.66 tokens/s**: at that speed, 5,000 tokens take ~8.6 min.
- The server cancels the task when the client closes the connection (`stop: cancel task`
  at exactly 300 s), so a timed-out request does not keep the CPU busy.
- **Hypothesis 1 (CPU throttling) is refuted.** The pod uses all 3 cores, and the quota
  throttles it only ~0.3% of the time. The CPU is busy, but it does the work slowly.
- Generation speed (7.95 tokens/s ≈ 18 GB/s of model reads) is close to the memory
  bandwidth limit, so the AVX2 code path most likely works for matrix-vector work.
  Prompt processing is matrix-matrix work and should be several times faster than
  generation; here it is only ~1.2×.
- **Hypothesis 3 is now the most likely:** the CPU flash-attention path with a q8_0 KV
  cache is slow for prompt processing. Test: f16 KV cache, context 8192 (the f16 KV cache
  for 8k tokens is ~1.1 GiB, so the pod stays within 5Gi), and compare a ~1k-token prompt.
- The `system_info` line with the CPU features is not in Datadog. If the f16 test does not
  help, check it with `kubectl logs` for hypothesis 2.
- Side finding: Datadog shows all `llama.cpp` lines with `status: error`, because
  llama.cpp writes its log to stderr. A log pipeline status remapper would fix this.

### 2026-11-04 — Test of hypothesis 3: f16 KV cache, context 8192

`--cache-type-k q8_0 --cache-type-v q8_0` removed (the default is f16), `contextSize`
16384 → 8192, so the pod stays within its 5Gi. `--flash-attn on` stays. Test after the
deploy: the same ~1k-token prompt as before; compare `prompt_per_second` with 9.66.
