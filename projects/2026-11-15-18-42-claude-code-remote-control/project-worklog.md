# Worklog

## 2026-11-15 19:30 UTC — PR #205 deployed, login done, service works

PR [#205](https://github.com/senaev/infra.senaev.com/pull/205) (merge commit `ff53aee`) was merged. Deploy run `43751913273` succeeded, including the image build and the public-pull check. The login of the test pod was not reused (the data folder was not moved), so the user logged in with `kubectl exec -it ... claude auth login`. The pod noticed within 30 seconds and started the server:

```
19:24:36 Claude Code is not logged in. Waiting for: claude auth login
19:26:39 Claude Code is logged in.
19:26:40 ·✔︎· Connected · code
19:26:56 Capacity: 1/32 · New sessions will be created in the current directory
```

The user checked from the phone and confirmed that everything works. `npm run test:smoke` passed (5 of 5). The errors in `senaev-com` logs come from `log-generator` and `chromium`, not from this service.

Resolved by this: `/CLAUDE.md` is read, the model is Sonnet, the version is pinned in the image. New open point: the status line redraws make many log lines (48, 360 and 126 lines in the first three minutes). Still open: the exit after about 10 minutes without a network, the movement of `loginExpiresAt`, the git token scope, and the Telegram login flow.

## 2026-11-15 19:05 UTC — Image and chart written, checked locally

Branch `claude-code-container`: image `claude-code/` (Node 24, Claude Code 2.1.325 pinned, the OMP tool set), `start.sh`, the template `_claude-code.tpl`, schema, `values.yaml` entry for `senaev`, `AGENTS.md` section.

Decisions made while writing:
- The model goes through `--settings <file>`: the docs say `--model` before `remote-control` is not carried over to the sessions of the server.
- The session name prefix is the env variable `CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX`, and the pod `hostname` is fixed, so the device keeps its name when the pod name changes.
- No readiness probe: a probe on the login would fail the first deploy.
- `DISABLE_UPDATES=1`: the version is pinned in the image.

Checked locally: `helm template` diff against `origin/main` has only additions (185 lines); the schema rejects `claudeCode` without `git` and an empty `model`; `npm run check:helm` and `npm run check:shell` pass; `start.sh` merges the trust keys into an existing and a new `~/.claude.json`; the image builds for `linux/amd64`, has `claude`, `gh`, `helm`, `yq`, `rg`; without a login the container prints "Claude Code is not logged in. Waiting for: claude auth login" and stops on SIGTERM. Not checked: the live pod (needs the deploy).

## 2026-11-15 18:50 UTC — PR #204 merged and deployed

PR [#204](https://github.com/senaev/infra.senaev.com/pull/204) (merge commit `2b1e748`) removed `/projects` from OpenCode, its Telegram bot and Code Tools. Deploy run `43748337383` succeeded: check, builds of `opencode-serve` and `opencode-telegram-bot`, sync, Helm deploy.

Verified: `npm run test:smoke` passed (5 of 5). Datadog logs of namespace `senaev-com` since 18:40 UTC have no `error`, `critical` or `alert` entries, and no `/projects`, `ENOENT` or `permission denied` matches. The Telegram bot restarted and started cleanly:

```
18:45:31 [INFO] [App] Received SIGTERM, shutting down...
18:45:45 [INFO] Starting OpenCode Telegram Bot v0.26.4...
18:45:45 [INFO] [OpenCodeReady] OpenCode server is ready: reason=startup
```

Not verified: the live mounts of the pods (no `kubectl` here), and the Telegram bot's folder list (`/code` only). The first message in the bot may need a new project selection.

## 2026-11-15 18:42 UTC — Project created, decisions confirmed

The user confirmed these decisions: the container and the component are named `claude-code`; the hostPath is `/k3s-cluster/volumes/claude-code`; only `/code` is mounted (the `/projects` folder stays only for OMP, PR [#204](https://github.com/senaev/infra.senaev.com/pull/204) is open); yolo mode with `IS_SANDBOX=1`; the Telegram login flow comes at the end, first an interactive login. The user asked why the component is a template and not a plain YAML file. Answer: the chart renders each component once for every `llmWorkspaces` entry, so names, node, ingress and git keys come from the workspace; a plain file would hardcode `senaev`.

## 2026-11-15 18:25 UTC — Test on a plain Node pod passed

Test pod `claude-code-spike` (`node:22-bookworm`, `HOME=/home/claude` on hostPath `/k3s-cluster/volumes/claude-code-spike`, `/code` as `emptyDir`) in namespace `senaev-com` on node `senaev-madrid`. Claude Code 2.1.325. The data folder is renamed to `claude-code` for the final service.

What worked:

- `claude auth login < fifo > log` printed the OAuth URL; the code from the browser was written to the FIFO. The FIFO must be opened read-write first (`exec 3<>/tmp/code.fifo`), or the shell blocks before `claude` starts.
- The diff of `~/.claude.json` after the trust and Remote Control questions: `projects["/code/test"].hasTrustDialogAccepted: true`, `projects[...].remoteControlSpawnMode: "same-dir"`, top-level `remoteDialogSeen: true`. The rest was cache.
- With these keys set by a script, `IS_SANDBOX=1 claude remote-control --spawn same-dir --permission-mode bypassPermissions < /dev/null` started with no questions. A phone message `id; pwd; ls -la /code; touch /code/hello-from-phone` ran with no permission question, as `uid=0(root)`, and the file was visible in the pod.
- Kill and restart of the server: the same session came back with its history. Delete and recreate of the pod: `claude auth status` still showed `loggedIn: true`, no questions, the same session came back.

```
"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "pro",
"configDirectory": "/home/claude/.claude",
"loginExpiresAt": "2026-12-15T01:13:42.953Z"
```

The login expires in about 30 days. Not tested: the server exit after about 10 minutes without a network, and whether a background refresh moves `loginExpiresAt`.
