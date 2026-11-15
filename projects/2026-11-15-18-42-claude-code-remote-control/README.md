# 2026-11-15 — Claude Code server for the mobile app

Run Claude Code (Pro subscription) in a container of the `senaev` LLM workspace, work on the same `/code` folder as the other containers, and drive it from the Claude mobile app.

## Goal

- A new container `claude-code` in an LLM workspace. Only the `senaev` workspace uses it.
- The Claude mobile app (tab **Code**) and claude.ai/code connect to it with Remote Control.
- It works on the shared `/code` volume (`projects/<repo>` and `worktrees/<repo>/<branch>`), like OpenCode, Code Tools and OMP.
- It runs without approvals (yolo mode). The container is the sandbox.

## Context

- Remote Control server mode (`claude remote-control`) runs the `claude` process in the container. The phone is a window into it. The process makes outbound HTTPS requests only, so the pod needs no Ingress. Docs: https://code.claude.com/docs/en/remote-control
- Remote Control accepts only a full-scope claude.ai login (`claude auth login`). The long-lived token from `claude setup-token` does not work. `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` must not be set.
- Claude Code refuses `bypassPermissions` as root, except inside a recognized sandbox. `IS_SANDBOX=1` makes it work.
- Workspace templates: `provisioning/helm/senaev-com/templates/llm-workspace/`. Each component is a named template, rendered once for each entry of `llmWorkspaces` by `llm-workspaces.yaml`. Shared helpers are in `_access.tpl`.
- Server mode stops by itself after about 10 minutes without a network. Kubernetes starts the container again. `claude remote-control` in the same folder brings back the sessions within about 4 hours.
- A test on a plain Node pod on 2026-11-15 proved the flow. See [project-worklog.md](project-worklog.md).

### Findings of the test

| Question | Result |
|---|---|
| Login without a terminal | `claude auth login` prints the URL. The code from the browser (`code#state`) goes in through stdin. Keep the FIFO open with `exec 3<>fifo` first. |
| Trust and Remote Control confirmation | Two keys in `~/.claude.json`: `projects["/code"].hasTrustDialogAccepted: true` and `remoteDialogSeen: true`. `--spawn same-dir` skips the spawn question. |
| Server without a terminal | Works: `claude remote-control ... < /dev/null > log 2>&1` |
| Yolo as root | Works with `IS_SANDBOX=1`. No permission questions. |
| Restart and pod recreate | The login, trust and sessions persist when `HOME` is a hostPath. |
| Login lifetime | `claude auth status` shows `loginExpiresAt`, about 30 days after the login. |

## Decisions

- Container and component name: `claude-code`. HostPath: `/k3s-cluster/volumes/claude-code`, mounted as `HOME` (`/home/claude`). It holds `.claude/`, `.claude.json` and `.ssh/`.
- The pod mounts only the `<name>-code` PVC at `/code`. Not `/projects`. PR [#204](https://github.com/senaev/infra.senaev.com/pull/204) removed `/projects` from OpenCode and Code Tools.
- Yolo mode: `--permission-mode bypassPermissions` with `IS_SANDBOX=1`.
- Default model `sonnet`. You can change it from the phone with `/model`.
- One server in `/code`, `--spawn same-dir`. You tell Claude which repository to use.
- The component is a template (`_claude-code.tpl`), like the others. A plain YAML file would hardcode one workspace's names, node and git keys, and could not use the shared helpers.
- Interactive login first (`kubectl exec`). The Telegram login flow comes at the end.

## Plan

1. ✅ PR [#204](https://github.com/senaev/infra.senaev.com/pull/204): remove `/projects` from OpenCode and Code Tools. Merged and deployed.
2. ✅ Image `claude-code/`: `Dockerfile` (Node, Claude Code at a pinned version, git, gh, openssh-client) and `start.sh`.
   - `start.sh` merges the two trust keys into `~/.claude.json`.
   - It checks `claude auth status`. When not logged in, it logs a message and checks again every 30 seconds, so a login through `kubectl exec` needs no restart.
   - It runs `claude remote-control --spawn same-dir --permission-mode bypassPermissions --settings <file with the model>` in `/code`. The session name prefix is the env variable `CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX`. The `--model` flag is not carried over to the sessions of the server, so the model goes in the settings file.
3. ✅ Chart `_claude-code.tpl`, added to `llm-workspaces.yaml`, `_context.tpl`, `_workspace.tpl` and `values.schema.json`; `claudeCode` entry in `values.yaml` for `senaev` only.
   - Deployment: one replica, `Recreate`, node selector `vps`. Mounts: hostPath as `HOME`, `<name>-code` at `/code`, the instructions ConfigMap as `/AGENTS.md` and `/CLAUDE.md` (Claude Code reads `CLAUDE.md` of a parent folder).
   - Git credentials as in `_code-tools.tpl`; `IS_SANDBOX=1`.
   - `podAccess`, `containerAccess` and `egress` helpers. A NetworkPolicy with no ingress.
4. ✅ `AGENTS.md`: a section about the component.
5. ✅ Deploy: PR [#205](https://github.com/senaev/infra.senaev.com/pull/205). The login of the test pod was not reused, so the first login was `kubectl -n senaev-com exec -it deploy/senaev-claude-code -- claude auth login`. The pod then started the server by itself. The ghcr package was already public.
6. 📌 Telegram login: a second container `telegram-login` in the pod (same image, `claude-code/telegram-login/`, run by `tsx`; it uses `senaev-utils` for the Telegram calls, the Rich Markdown helpers, the command parser, the logger, `requireEnv` and the graceful shutdown). The bot is @senaev_claude_helper_bot, token in Vault `TG_TOKEN_CLAUDE_HELPER_BOT`, values `claudeCode.telegram`.
   - The bot answers only in the private chat with the user `TG_SENAEV_USER_ID`. In a private chat the chat id is the user id, so there is no separate chat id value.
   - `/auth` starts `claude auth login`, sends the link, takes the code from the next message, deletes that message, and says until when the login is valid.
   - Every 10 minutes it checks `claude auth status`. Not logged in: it says so once, with no link, until the login is back and lost again. From 5 days before `loginExpiresAt`: a warning once a day. Both messages tell the user to send `/auth`.
   - The bot token is only in this container, not in the container where Claude Code runs without approvals. A renewal writes the login file in the shared `HOME`; if the running server does not take it, the server is expected to stop at the expiry, and the container restarts and reads it. This exit is not tested yet (see Open points).

## Open points

- ❓ The Remote Control server may stop after about 10 minutes without a network. Test it, and check that the container restart brings the sessions back.
- ❓ Does the running Remote Control server stop when the login expires? `start.sh` checks the login only before it starts the server, so if the server keeps running with an expired login, nothing restarts it. Test it, or make `start.sh` or a probe check the login while the server runs.
- ❓ Does a background refresh move `loginExpiresAt`? Check `claude auth status` after a few days. If not, the login needs a renewal every month.
- ❓ Yolo mode plus the git credentials in the pod: a prompt injection could push to GitHub. Use a fine-grained token for this pod.
- ❓ The server logs its status line again on each change, and Datadog keeps every redraw as a log line (360 lines in the busiest minute of the first test). Watch the volume; add an exclusion filter if it stays high.

## Verification

- `claude auth status` in the pod shows `loggedIn: true` and `subscriptionType: pro`.
- The Claude app (tab **Code**) shows the device with a green dot and the `senaev-...` session.
- From the phone: "run `id; pwd; ls /code`" runs without a question, in `/code`, and sees the repositories of the other containers. A file made from the phone is visible in OpenCode or Code Tools.
- A pod restart and a pod recreate keep the login and the session.
- `npm run check:helm`, a `helm template` diff, and `npm run test:smoke` after the deploy. Datadog logs of the pod show no restart loop.
