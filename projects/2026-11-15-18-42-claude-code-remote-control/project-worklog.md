# Worklog

## 2026-11-15 21:16 UTC — Telegram login is deployed and works

PR #207 (squash `873545df`) is merged, and the deploy passed; the smoke test passes and the logs of the pod have no errors. The user sent `/auth` to the bot while the old login was still active, took the link, logged in, and sent the code from the page. The helper logs show `/auth` handled, the text taken as a login code, and the message with the code deleted. The bot answered "Logged in. The login is valid until 2026-12-12" (27 days). A login that is still active does not need a logout first: `/auth` starts a new login next to it.

Two things to remember. The deploy restarts the pod twice (Helm, then the step that refreshes rebuilt images), and the helper skips messages that came before its last start, so a message sent in the first minutes after a deploy is lost: send `/auth` again. Datadog files the helper logs under `service:claude-code`, the same as the main container; use `container_name:telegram-login` to read only them.

Open: whether the running server uses the renewed login without a restart, and what happens at the expiry (see the README).

## 2026-11-15 21:45 UTC — Polling loop moved to senaev-utils

The user asked to move the loop that receives messages into `senaev-utils`. New: `pollTelegramMessages` (long polling with `getUpdates`: handles the messages one by one, reports a failed poll or handler through `onError`, retries after a delay, stops on an `AbortSignal`, and can skip the messages that came before the start) and `deleteTelegramMessage`, both in `senaev-utils/src/utils/TelegramApi/` with tests. The helper's own `telegram.ts` is gone; `main.ts` only gives `pollTelegramMessages` its handler. The helper still serializes message handling and the login checks in one queue. The record of 21:20 says the polling loop is not reused; this is now changed.

## 2026-11-15 21:30 UTC — `claudeCode.telegram.allowedUser` renamed to `user`

The user asked for the shorter name. Only the new `claudeCode.telegram` block changed; the `telegram.allowedUser` of OpenCode is untouched. The Vault key is the same, `TG_SENAEV_USER_ID`. The older records below use the old name.

## 2026-11-15 21:20 UTC — Telegram helper reuses senaev-utils

The user asked to reuse code that other containers already have. The first version had its own Telegram client, `requireEnv`, logger and shutdown. `claude-code` is now a service like `vpn-subscription` and `code-tools`: `senaev-utils` as a `file:` dependency, `tsx`, a lockfile, and the Dockerfile pattern with the repository root as context. Reused: `callTelegramApi` (`getUpdates`, `deleteMessage`), `sendTelegramMessage` (the Rich Markdown entry point of the repo, with `escapeTelegramMarkdown` and `telegramLink`), `getTelegramCommandFromMessage`, the Telegram types, `requireEnv`, `createLogger` (pino), `installGracefulShutdown`, `promiseTimeout`, `stringifyUnknownError`. Not reused, because nothing fits: the `getUpdates` polling loop (the other bots use a webhook), the runner of `claude auth login` (it needs stdin and the output as it comes; `runProcess` is private to `code-tools`) and the expiry logic. This removed about 100 lines. The messages are now Rich Markdown, and the login link is a clickable link.

Checked: 36 tests, eslint and `tsc` pass; the image builds with the new layout, `tsx` starts the helper, and with a fake token the error is `HTTP 401` and has no token in it.

## 2026-11-15 21:00 UTC — Logged-out notice without a link

The user asked that the bot does not send the login link by itself when Claude Code is logged out: it tells the user once, and the user sends `/auth` for the link. The logged-out notice is sent once for each loss of the login. While making this change I removed a bug: a check that found the user logged in cancelled a login that waited for a code, so a renewal with `/auth` before the expiry could fail within 10 minutes. A waiting login now stays until a code, or a new `/auth`. The tests cover both (38 tests).

## 2026-11-15 20:55 UTC — Telegram login written, checked locally

Decisions made with the user: bot @senaev_claude_helper_bot, token in Vault `TG_TOKEN_CLAUDE_HELPER_BOT`, passed in `claudeCode.telegram.token` of `values.yaml`; `/auth` is the command for a login at any time; a warning 5 days before the expiry; direct messages to the user. The chat id is not a separate value: in a private chat it equals the user id, so `claudeCode.telegram.allowedUser` (`TG_SENAEV_USER_ID`) is both the allowed user and the chat.

Design: a second container `telegram-login` in the same pod, so the bot token stays out of the container where Claude Code runs without approvals. Code is in `claude-code/telegram-login/`; Node 24 runs the TypeScript directly, so there are no dependencies and no lockfile. A package without a lockfile is still in `npm run typecheck` and in the vitest projects.

Checked locally: 36 unit tests (all under 100 ms), eslint and `tsc` pass. The tests found a real bug: the link was taken from the first output chunk, before it was complete; it now waits for the white space after it. In the built image, with the real `claude` CLI and no terminal: `claude auth status` is parsed, `claude auth login` prints a link of 497 characters with `state=`, and a wrong code gives `exit code 1` with "That code wasn't accepted". The Telegram part was checked only with a fake `fetch`: a fake token gives `HTTP 401` without the token in the message. Not checked: the real bot in the deploy.

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
