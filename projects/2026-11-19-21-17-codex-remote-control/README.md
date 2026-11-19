# 2026-11-19 — Codex server for the ChatGPT app

Run Codex (ChatGPT subscription) in a container of the `senaev` LLM workspace, work on the shared `/code` folder, and drive it from the ChatGPT mobile app, like the Claude Code container.

## Goal

- A new container `codex` in the `senaev` LLM workspace, next to `claude-code`.
- The ChatGPT mobile app (Codex) connects to it with Codex remote control.
- It works on the shared `/code` volume (`projects/<repo>` and `worktrees/<repo>/<branch>`).
- It runs without approvals. The container is the sandbox.
- The login is renewed from the same Telegram account and chat as Claude Code.

## Context

- Codex CLI 0.170.0 (2026-11-19) has `codex remote-control`, marked `[experimental]`: `start`, `stop`, `pair` and `--no-daemon`. Docs: https://learn.chatgpt.com/docs/developer-commands?surface=cli. The official mobile docs describe only pairing from the desktop app (macOS, Windows): https://learn.chatgpt.com/codex/mobile.
- The server opens one outbound WebSocket to `wss://chatgpt.com/backend-api/wham/remote/control/server`. The pod needs no Ingress.
- Remote control requires a ChatGPT login. The source rejects API keys: "remote control requires ChatGPT authentication; API key auth is not supported".
- `codex login --device-auth` works without a browser on the host: it prints `https://auth.openai.com/codex/device` and a one-time code. Nothing goes back through stdin.
- The device name on the phone is the hostname.
- `CODEX_HOME` (`~/.codex`) holds the login (`auth.json`), the remote control enrollment (SQLite) and the sessions.
- Codex reads `AGENTS.md` from the git root down to the working folder, plus `~/.codex/AGENTS.md`. `/code` is not a repository, so `/AGENTS.md` is not read.
- `codex remote-control pair` prints a short manual pairing code (`ABCD-EFGH`). It talks only to the managed daemon, not to a `--no-daemon` server. It is unknown whether the phone needs this code, or shows the server by itself for the same account.
- The managed daemon calls `ps` (missing in `node:*-slim`) and updates itself on a schedule.
- The local test and the source reading are in [project-worklog.md](project-worklog.md).
- The Claude Code setup this follows: [`2026-11-15-18-42-claude-code-remote-control`](../2026-11-15-18-42-claude-code-remote-control/README.md).

## Decisions

- Component `codex` (`templates/llm-workspace/_codex.tpl`), image `codex/` (`ghcr.io/senaev/codex`). Hostname `senaev-codex`.
- HostPath `/k3s-cluster/volumes/codex` mounted as `HOME` (`/home/codex`).
- Foreground server: `codex remote-control --no-daemon`, the main process of the container. The version stays pinned, and Kubernetes restarts it.
- `start.sh` writes `config.toml` on each start: `approval_policy = "never"`, `sandbox_mode = "danger-full-access"` (bubblewrap does not run in an unprivileged pod), no update check, `/code` trusted. It links `/AGENTS.md` as `~/.codex/AGENTS.md`.
- The default model of Codex. The phone picks the model per task.
- Git as in Claude Code: `GH_TOKEN` in env, SSH key only in the `ssh-agent` sidecar.
- First login by hand (`kubectl exec`), Telegram later.

## Plan

1. ⏳ Project, image and chart; first manual login. One PR.
   - `codex/Dockerfile`: the tools of the Claude Code image plus `procps`, `@openai/codex@0.170.0`.
   - `codex/start.sh`: config, instructions link, wait for the login (`codex login status`, every 30 seconds), then `exec codex remote-control --no-daemon`.
   - `AGENTS.md`: a Codex section.
   - `_codex.tpl`: Deployment (one replica, `Recreate`), ExternalSecret with the git keys, `ssh-agent` sidecar, NetworkPolicy with no ingress; `codex.enabled` in the schema and in `senaev`.
   - After the deploy, log in:
     `kubectl -n senaev-com exec -it deploy/senaev-codex -c codex -- codex login --device-auth`
2. Connect the phone. Check whether `senaev-codex` appears in ChatGPT → Codex by itself. If not, find where the app takes the manual code, and pair once: `codex remote-control start`, `codex remote-control pair`, then go back to `--no-daemon`. Check that the pairing survives a pod restart.
3. Telegram login in the same chat: `/auth` for Codex, a notice when the login is gone. The bot token cannot be polled by two processes at once (Telegram answers `409 Conflict` to the second `getUpdates`), so one helper must serve both Claude Code and Codex, or Codex gets its own bot. Decide at this step.
4. MCP servers (Datadog, Grafana, Obsidian, Telegram) in `config.toml`, with their OAuth login.
5. `AGENTS.md`: keep the Codex section current with each step (added in step 1).

## Open points

- ❓ Does the phone need the manual pairing code?
- ❓ How long does the ChatGPT login last, and does it refresh by itself?
- ❓ Remote control is experimental: the protocol can change between versions. Raise the pin only after a test.
- ❓ Yolo mode plus the git token in the pod: the same risk as in Claude Code.

## Verification

- `codex login status` in the pod shows the ChatGPT login.
- The pod log shows `This machine is available for remote control as senaev-codex.`
- The ChatGPT app (Codex) shows `senaev-codex`. From the phone: "run `id; pwd; ls /code`" runs with no question, in `/code`, and sees the repositories of the other containers.
- Codex knows the workspace instructions (ask it about the layout of `/code`).
- A pod restart keeps the login and the connection.
- `npm run check:helm`, and `npm run test:smoke` after the deploy. The Datadog logs of the pod show no restart loop.
