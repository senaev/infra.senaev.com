# 2026-10-10 — code-tools: background commands and an isolated pod

- [ ] Run code-tools commands in the background in an isolated pod

## Goal

1. **Background operations.** Every command and every long operation of the `code-*` tools
   runs as a background job: the call returns at once (or after a short wait) with a job id,
   and ChatGPT gets the status, the output and the result later, or cancels the job. So no
   tool call depends on how long ChatGPT waits, and a lost mobile connection does not stop
   the work.
2. **Rename** the `opencode-telegram` pod (Deployment, labels, NetworkPolicy, build
   workflows) to `code-tools`.
3. **Only git repositories in the pod.** Remove the Obsidian vault from it, the hostPath
   included. Then move the vault data of obsidian-sync from its hostPath to a volume that no
   other pod can mount, so the vault is not visible to other processes. (Annotation: "other
   pods" — root on the node can still read it; see D.)

## Context

- Follows [`2026-10-10-remote-project-editing-via-mcp`](../2026-10-10-remote-project-editing-via-mcp/README.md)
  (v1 of the `code-*` tools, done).
- ChatGPT waited 119 s for one `code-run` call; its upper limit is not known. Today `run`
  and `clone` block for up to 300 s, and cluster-helper waits 330 s.
- Pod: `provisioning/helm/senaev-com/templates/opencode-serve.yaml`. Deployment
  `opencode-telegram` with two containers: `opencode-serve` (opencode :4096 and code-tools
  :8080, `opencode-serve/start.sh`) and `opencode-telegram-bot`. PVC `opencode-telegram-git`
  at `/projects/git`, hostPath `volumes/opencode-data`, ConfigMap `opencode-telegram-config`.
  Build workflows restart `deployment/opencode-telegram`.
- The vault hostPath `{{ clusterRootPath }}/{{ obsidianSync.volumePath }}`
  (`/k3s-cluster/volumes/obsidian-sync/vault`) is mounted only by obsidian-sync and by this
  pod (both containers, at `/projects/vault`).
- **The Telegram opencode agent works in the vault today**: `OPENCODE_WORKDIR=/projects/vault`,
  and its AGENTS.md (`config/opencode-telegram/AGENTS.md`) describes `/projects/vault`.
  The owner does not want it to work in the vault any more.

## Plan

### A. Background jobs in code-tools

Proposed contract (to confirm):
- `code-run` starts the command as a job and waits up to `waitSeconds` (default ~20 s).
  Done in time: the result as today. Not done: `{ jobId, status: "running", outputSoFar }`.
  So short commands stay one call.
- `code-clone` works the same way.
- New `code-job` (`jobId`, `waitSeconds?`, `outputOffset?`): status, exit code and new output;
  it can also wait up to `waitSeconds` for the end.
- New `code-cancel` (`jobId`): kills the process group.
- `code-projects` (or a new `code-jobs`) lists running and recent jobs, so a new chat finds
  the work of the last one.
- Job output is written to a file per job under the PVC (not only kept in memory), with a
  size cap and a time to live.

The owner answers these later:

❓ Should the jobs survive a restart of the container (state and output on the PVC; the
process itself is lost), or is memory enough?
❓ How many jobs may run at once, and may two jobs run in the same project?
❓ How long are finished jobs and their output kept (e.g. 24 h / last 50 jobs)?
❓ Is there still a hard maximum run time for a job (e.g. 1 h), or only manual cancel?
❓ Which other tools become jobs? Proposed: only `run` and `clone`; `search`, `read`,
`patch` stay synchronous, because they are short.

### B. Rename the pod to `code-tools`

- Deployment, labels `app:`, the Datadog service tag, NetworkPolicy and the Service selector;
  `deployment_name` in both build workflows.
- Rename everything: also the container `opencode-serve` → `code-tools`, the image
  `ghcr.io/senaev/opencode-serve` → `ghcr.io/senaev/code-tools`, the folder `opencode-serve/`
  (merge it into `code-tools/`: Dockerfile and start.sh), the workflow, the ConfigMap, the
  values key `opencodeTelegram`, and the hostPath `volumes/opencode-data`.
- 📌 New PVC `code-tools-git`; delete `opencode-telegram-git`. The repositories are cloned
  again; work that was not pushed is lost. Helm deletes the old PVC when it leaves the chart
  (no `helm.sh/resource-policy: keep`), and `local-path` then deletes its folder.
- `strategy: Recreate` and the RWO PVC: the old and the new Deployment must not run at the
  same time; Helm deletes the old one in the same upgrade, so expect a short gap.
- The container `opencode-telegram-bot` keeps its name: it is the Telegram bot.
- The hostPath `volumes/opencode-data` holds the opencode sessions and the bot settings
  (selected project). 📌 New path `volumes/code-tools-data`; the old sessions are not moved
  (the bot starts fresh). The owner deletes the old folder on hetzner later.
- Files to change: `templates/opencode-serve.yaml` → `templates/code-tools.yaml`,
  `config/opencode-telegram/` → `config/code-tools/`, `values.yaml` (`opencodeTelegram` →
  `codeTools`), `.github/workflows/build-opencode-serve.yml` → `build-code-tools.yml`,
  `build-opencode-telegram-bot.yml` (`deployment_name`), `opencode-serve/` → `code-tools/`
  (Dockerfile, start.sh; the Dockerfile `COPY` paths), root `AGENTS.md`, and the image name
  in the opencode-serve template. The old image `ghcr.io/senaev/opencode-serve` stays in the
  registry; delete it by hand later.

### C. Remove the vault from the pod

- Remove the `vault` volume and both `/projects/vault` mounts; `OPEN_BROWSER_ROOTS=/projects/git`.
- `OPENCODE_WORKDIR=/projects/git`: the Telegram opencode agent works only on git repositories.
- Update `config/opencode-telegram/AGENTS.md` (`config/code-tools/AGENTS.md` after B): no
  `/projects/vault`, only `/projects/git`.
- After C, obsidian-sync is the only pod that mounts the vault hostPath, until D removes it.

### D. Move the vault data off the hostPath

- obsidian-sync gets a PVC with `accessModes: [ReadWriteOncePod]`, so Kubernetes lets only one
  pod mount it. Plain `ReadWriteOnce` still allows every pod on the same node.
- Migration: `ob sync` downloads the whole vault again into the empty volume; no data copy.
  The owner accepts a full re-sync. 📌 Before the switch, confirm that `ob sync` into an empty
  folder downloads and never deletes on the server (test with a copy, or check its docs).
- obsidian-sync runs on hetzner (`obsidianSync.vps`).
- A `ReadWriteOncePod` PVC stops other **pods** from mounting the volume. It does not hide the
  data from the node: a `local-path` PVC is a folder under `/var/lib/rancher/k3s/storage/`,
  readable by root on the node.
- Decision: the `ReadWriteOncePod` PVC is enough. Stronger options were considered and not
  taken: tmpfs (`emptyDir` with `medium: Memory`; RAM cost and a full download at every
  restart), an encrypted volume (the key is on the node anyway), and confidential computing
  (not available on a normal VPS). None of them hides the data from root on the node.
- 📌 New PVC `obsidian-sync-vault` (`ReadWriteOncePod`, `local-path`, on hetzner), mounted at
  `obsidianSync.containerVaultPath`; remove the hostPath volume and `obsidianSync.volumePath`.
  Check the size needed with `du -sh /k3s-cluster/volumes/obsidian-sync/vault` first.
- 📌 Keep the old hostPath folder until the new volume is synced and the smoke test passes;
  then the owner deletes it on hetzner.
- 📌 The `chown 1000:1000` init container stays: the new volume is created as root.

### Order

C and B together (both rebuild the pod and its volumes), then D, then A after the owner
answers the job questions.

The owner decided all points of B, C and D on 2026-10-10; no work is started yet.

## Verification

- From ChatGPT: `code-run` with a 3-minute command returns a job id; `code-job` shows the
  output while it runs and the exit code at the end; `code-cancel` stops a `sleep 600`;
  a new chat finds the job.
- `kubectl -n senaev-com get deploy,netpol,svc` shows `code-tools`, no `opencode-telegram`.
- The pod has no `/projects/vault`; the Telegram bot still answers.
- obsidian-sync works on the new volume: the smoke test in the root AGENTS.md passes, and
  ChatGPT can read and search the vault.

## Findings
