# Worklog

## 2026-11-20 23:15 UTC — The phone is paired: remote control works end to end

PR #257 deployed (the socket folder shared with the helper). The user sent `/codex_pair`, entered
the code in the ChatGPT app (Codex → Connect computer → Start pairing → Pair manually), and the
server works from the phone.

The user restarted the VM a few times between 22:35 and 22:56 (4 container restarts). After each,
`start.sh` installed the daemon again and it connected with the same enrollment, with no new
pairing:

```
22:43:28  Starting the Codex app-server daemon with remote control.
22:43:28  Installing daemon from CLI version 0.170.0 into /home/codex/.codex/packages/app-server-daemon...
22:43:28  This machine is available for remote control as senaev-codex.
22:43:22  connected to app-server remote control websocket ... server_id=Some("srv_e_6b00...")
```

Earlier, at 20:12-20:15, the ChatGPT side answered `503 Service Unavailable` for a few minutes; the
daemon retried by itself and reconnected.

Noise, harmless: `WARN codex_app_server::transport: dropping message for disconnected connection`
once a minute, from the `codex app-server daemon version` check of `start.sh`, which connects and
leaves.


## 2026-11-20 19:55 UTC — MFA on: the server enrolled; /codex_pair could not reach the daemon socket

PR #256 deployed: the daemon runs, retries, and logs to Datadog. Without MFA every enrollment
answered 403. The user turned on MFA at about 19:43; the next retry enrolled and connected, with the
same login:

```
19:44:08  failed to connect ... HTTP 403 Forbidden ... {"detail":"Multi-factor authentication required"}  reconnect_attempt=93
19:44:29  created new remote control enrollment: ... server_id=srv_e_6b00..., environment_id=env_e_6b00...
19:44:30  connected to app-server remote control websocket ... server_name=senaev-codex
```

`/codex_pair` from the helper then failed:

```
❌ Could not create a pairing code: failed to connect to /home/codex/.codex/app-server-control/app-server-control.sock
```

The control socket in CODEX_HOME is only a symlink to `/tmp/codex-daemon-<uid>/<sha256 of the path>`
(`app-server-transport/src/transport/unix_socket.rs`, `bind_private_daemon_socket`;
`uds/src/daemon_directory.rs`), which is inside the codex container. Local check:

```
app-server-control.sock -> /tmp/codex-daemon-0/0094c215ef63ecbf354c3bb483057770185e5212a5ecc5b8b3aa8c5997ac6712
```

Both the daemon and the client require that folder to be owned by their uid with mode 0700; with
0755 the daemon does not start. Fix: a host folder mounted at `/tmp/codex-daemon-0` in both
containers, `chmod 700` in `start.sh`. The hash is of the same path in both pods, so the symlink
resolves in the helper too. The bot message also showed the old 403 although a later connection had
succeeded, and dropped the `Caused by` line of the CLI error; both fixed.


## 2026-11-20 19:00 UTC — Pairing from the bot: /codex_pair and the Codex daemon

The ChatGPT app on the user's Android phone now has a Codex tab: Connect computer → Start pairing
→ Pair manually takes an 8-character code (`XXXX-XXXX`), the format of `manualPairingCode` of
`codex remote-control pair`. The user wants to try without MFA first.

`codex remote-control pair` talks only to the managed daemon, through
`CODEX_HOME/app-server-control/app-server-control.sock`
(`app_server_control_socket_path`), and never starts one (`start_remote_control_pairing`), so the
helper in the claude-code pod can call it through the mounted login folder. Local test with a
`ps` stand-in on `/proc` (no procps in the sandbox), without a login:

```
start: Error: Remote control is enabled on senaev-claude-code but the connection is errored.
version: {"status":"running","backend":"pid",...,"socketPath":"/root/cxd/app-server-control/app-server-control.sock",...}
pair: Error: remoteControl/pairing/start failed: remote control pairing is unavailable until enrollment completes
```

The daemon keeps running after a failed connection. With `RUST_LOG` (inherited by the daemon) its
log has the reason, which the bot reads:

```
WARN ... failed to connect to app-server remote control websocket ... error=remote control requires ChatGPT authentication error_kind=PermissionDenied
```

A deleted package copy is not installed again while any of `daemon.pid`, `daemon.stderr.log`,
`daemon-updater.pid`, `daemon-updater.stderr.log` exists (`prepare_install.rs`):

```
Error: daemon executable not found at .../packages/app-server-daemon/current/bin/codex; repair the existing installation, ...
```

So `start.sh` deletes all of them on each start. The whole `start.sh` against the real daemon:
starts and installs it, starts it again when it is gone, stops it on SIGTERM, and starts it again
in a second run with the files of the first. The helper code against a real daemon:

```
pair error: remoteControl/pairing/start failed: remote control pairing is unavailable until enrollment completes
last connection error: remote control requires ChatGPT authentication
```


## 2026-11-20 17:15 UTC — Codex runs tasks and reaches the MCP servers of the ChatGPT account

PR #248 deployed: the helper starts with Codex, and the codex container idles.

```
2026-11-20T15:11:46Z  🚀 Telegram login helper started  (codex: true)
2026-11-20T15:11:46Z  Remote control is off (codex.remoteControl). Nothing else runs.
```

`codex exec` works with the current login, without MFA (the MFA requirement is only for the
remote control enrollment). Asked for its tools, Codex lists the apps of the ChatGPT account in the
`mcp__codex_apps__` namespace:

```
| Code Tools on senaev.com | `code_tools_senaev_com` |
| Datadog EU               | `datadog_eu` |
| Gmail                    | `gmail` |
| Grafana on senaev.com    | `grafana_senaev_com` |
| Obsidian on senaev.com   | `obsidian_senaev_com` |
...
```

A real call:

```
mcp: codex_apps/obsidian_senaev_com.obsidian-search (completed)
mcp: codex_apps/obsidian_senaev_com.obsidian-read (completed)
`@senaev/My Career/Job Search Framework/LLM Job Search Round.md`
```

cluster-helper logged it (`📓 Obsidian MCP message`, `tools/call`, `obsidian-read`, 17:11:26), and
answered `server/discover` with `Method not found` without harm. So the ChatGPT connectors reach
Codex through OpenAI's host-owned apps server: no `mcp_servers` in `config.toml`, and no new OAuth
client in cluster-helper. Telegram is not in the list (no ChatGPT connector for it).


## 2026-11-20 15:00 UTC — Telegram login for Codex in the shared helper

Decisions of the user: the same bot and chat as Claude Code (one helper serves both), Codex
running again with remote control off (`codex.remoteControl: false`), and code review as a separate
project.

`codex login --device-auth` through a pipe (0.170.0), the input of the parser:

```
1. Open this link in your browser and sign in to your account
   ^[[94mhttps://auth.openai.com/codex/device^[[0m

2. Enter this one-time code ^[[90m(expires in 15 minutes)^[[0m
   ^[[94mXXXX-XXXXX^[[0m
```

`codex-rs/login/src/device_code_auth.rs`: the CLI polls for at most 15 minutes
(`device auth timed out after 15 minutes`), so the helper needs no answer from the chat, only the
exit of the CLI. `claude-code/telegram-login/codex.ts` run against the real CLI (not logged in):

```
logged in: false
url: https://auth.openai.com/codex/device code shape: XXXX-XXXXX
result after cancel: {"ok":false,"reason":"exit code none: Continue only if you started this login in Codex. ..."}
```

The helper tests pass (93 in `claude-code/telegram-login`). `start.sh` with remote control off and
a logged-in fake `codex` prints `Remote control is off (codex.remoteControl). Nothing else runs.`
and stays up.


## 2026-11-20 13:45 UTC — Codex disabled until remote control is available

The user could not log in again: the container restarts in a loop and takes no `kubectl exec`:

```
error: unable to upgrade connection: container not found ("codex")
```

The ChatGPT app on the user's Android phone (latest version, Plus plan) shows no Codex entry, and
the server enrollment needs MFA on the account. Decision of the user: disable the component
(`codex.enabled: false`) and wait until remote control is rolled out to the account, instead of
changing `start.sh` to keep the container running. The image, the template and the login in
`/k3s-cluster/volumes/codex` stay; enabling it again is a one-line change.

## 2026-11-20 13:25 UTC — The cause: the account has no multi-factor authentication

With `RUST_LOG` (PR #244) the server logs why the connection fails. The enrollment of the new
server is refused:

```
no persisted remote control enrollment found: ... account_id=406b4044-...
creating new remote control enrollment: ... enroll_url=https://chatgpt.com/backend-api/wham/remote/control/server/enroll
failed to connect to app-server remote control websocket ... error=remote control server enrollment failed at
`https://chatgpt.com/backend-api/wham/remote/control/server/enroll`: HTTP 403 Forbidden, ...
body: {"detail":"Multi-factor authentication required"}; retrying after auth recovery error_kind=Other
Error: Remote control is enabled on senaev-codex but the connection is errored.
```

ChatGPT requires MFA on the account before a server can enroll for remote control. The Codex
source has no MFA handling (no match for `multi-factor`/`mfa` besides a login timeout comment), so
the check is on the server side. The fix is on the account: turn on MFA in ChatGPT (Settings →
Security), then log in again with `codex login --device-auth`, so that the token is issued after
MFA. The ChatGPT app on the user's phone shows no Codex entry (Plus plan); that is a separate
question for step 3.

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
