# Worklog

## 2026-11-20 13:15 UTC — Logged in; remote control fails to connect

Step 1 deployed (PR #239). The first image build of the deploy failed with
`curl: (22) The requested URL returned error: 403` on `https://api.github.com/meta` (anonymous rate
limit of the runner); a rerun of the job passed. The pod then waited for the login:

```
2026-11-19T21:57:06Z  Codex is not logged in. Waiting for: codex login --device-auth
```

The user logged in with `codex login --device-auth` (device code in the browser):

```
Successfully logged in
```

The server takes the login, then fails at each start, and the container restarts (3 restarts in 2 minutes):

```
2026-11-20T13:09:16Z  Codex is logged in.
2026-11-20T13:09:16Z  Starting app-server with remote control enabled...
2026-11-20T13:09:18Z  Error: Remote control is enabled on senaev-codex but the connection is errored.
2026-11-20T13:09:21Z  Starting app-server with remote control enabled...
2026-11-20T13:09:21Z  Error: Remote control is enabled on senaev-codex but the connection is errored.
```

Without `RUST_LOG` the server does not print the reason. In the source
(`app-server-transport/src/transport/remote_control/websocket.rs`), every failed connection
logs `warn!` with `error` and `error_kind`, and marks the status `Errored`; the foreground
`codex remote-control --no-daemon` exits when the first status is `Errored`, so even a
transient error ends the process. Next: `RUST_LOG=warn,codex_app_server_transport::transport::remote_control=info`
in the container, to see the error.

## 2026-11-19 21:30 UTC — Step 1 written: image, start script, chart

`codex/Dockerfile`, `codex/start.sh`, `templates/llm-workspace/_codex.tpl`, the schema and `codex.enabled` in `senaev`. `start.sh` was run locally with Codex 0.170.0, up to the login wait:

```
Codex is not logged in. Waiting for: codex login --device-auth
...
lrwxrwxrwx 1 root root   23 Nov 19 21:17 AGENTS.md -> /root/st.znzp/AGENTS.md
-rw------- 1 root root  150 Nov 19 21:17 config.toml
```

The written `config.toml` passes `codex app-server --strict-config --print-startup-config`. The same check rejects an unknown key (`unknown configuration field ...`), so the keys are real:

```
{"appServerVersion":"0.170.0","configRequirements":{"supportsIndependentSpeedModes":true,"requirements":null}}
```

`codex login status` exits 1 with `Not logged in`, so `start.sh` uses its exit code. `npm run check:helm` and `check:shell` pass. The image was not built locally (no Docker); the PR build checks it.

## 2026-11-19 21:10 UTC — `codex remote-control` exists; how it works

Codex CLI 0.170.0, installed from npm:

```
  app-server        [experimental] Run the app server or related tooling
  remote-control    [experimental] Manage the app-server daemon with remote control enabled
...
Commands:
  start  Start the app-server daemon with remote control enabled
  stop   Stop the app-server daemon
  pair   Create and print a short-lived manual pairing code
```

`codex remote-control --no-daemon` without a login (`RUST_LOG=info`):

```
app-server remote control websocket loop started remote_control_url=https://chatgpt.com/backend-api/ ... server_name=senaev-claude-code
connecting to app-server remote control websocket websocket_url=wss://chatgpt.com/backend-api/wham/remote/control/server
failed to connect ... error=remote control requires ChatGPT authentication error_kind=PermissionDenied
...
Error: Remote control is enabled on senaev-claude-code but the connection is errored.
```

It connects outbound to chatgpt.com, names the server by the hostname, needs a ChatGPT login, and exits when the first connection fails.

The managed daemon fails without `ps`:

```
Error: failed to record pid-managed app-server process 25631 startup
Caused by:
    0: failed to invoke ps for pid-managed app server
```

`codex remote-control pair` connects only to the daemon socket `CODEX_HOME/app-server-control/app-server-control.sock`, not to a `--no-daemon` server.

`codex login --device-auth` without a terminal:

```
1. Open this link in your browser and sign in to your account
   https://auth.openai.com/codex/device
2. Enter this one-time code (expires in 15 minutes)
```

From the source (`openai/codex` at `5f8c36e`, 2026-11-19):

- `app-server-transport/src/transport/remote_control/auth.rs`: "remote control requires ChatGPT authentication; API key auth is not supported".
- `enroll.rs`: the server enrollment is stored in the SQLite state of `CODEX_HOME` and reused on the next start.
- `app-server-protocol/src/protocol/v2/remote_control.rs`: pairing returns `pairingCode` (the QR code), `manualPairingCode` and `expiresAt`.
- `cli/src/remote_control_cmd.rs`: `--no-daemon` runs the server in the foreground (`EnabledEphemeral`).
- `app-server-daemon/README.md`: the daemon checks for updates five minutes after the start, then hourly.
- `core/src/agents_md.rs`: `AGENTS.md` is read from the project root (`.git`) down to the working folder; "If no marker is found, only the current working directory is considered."
- The thread start parameters have optional `approvalPolicy` and `sandbox`: the phone can override the defaults of `config.toml`.

Decision: a foreground server (`--no-daemon`) as the main process, as `claude remote-control` in the Claude Code container; `procps` in the image anyway, for a pairing with the daemon if the phone needs it.
