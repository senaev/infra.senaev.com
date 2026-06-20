# 2026-06-20 — Obsidian OpenCode Telegram Bot

> This file is the working log for this task. All design decisions, implementation steps,
> commands run, outputs pasted, blockers hit, and the eventual completion state must be
> appended to this file as we go — so the whole session lives in one place and is
> searchable later.
>
> Format: append new dated sections under ## Findings as work proceeds. Don't rewrite
> earlier sections — annotate them.

## Goal

Deploy **OpenCode** + **opencode-telegram-bot** to give Telegram access to the Obsidian
vault. The vault is treated as a codebase — full read/write access. OpenCode handles
the AI agent; the bot handles Telegram. No custom API wrapper needed.

The vault is synchronized by the existing `obsidian-sync` sidecar via Obsidian Sync.

## Architecture

```
Telegram
  ↕  (long-polling, no open ports)
opencode-telegram-bot
  ↕  HTTP  localhost:4096
opencode serve
  ↕  read-write /vault (hostPath)
  ↕  read-write /vault (hostPath)
obsidian-sync  (separate deployment, same node)
  ↕
Obsidian Sync
```

Two separate Kubernetes Deployments on the same node (`vps: hetzner`) share the vault
via the same hostPath directory. `obsidian-sync` handles cloud sync; `obsidian-opencode`
runs opencode-serve (and later the telegram bot).

## Components

### opencode-telegram-bot (new container)

- npm package: `@grinev/opencode-telegram-bot`
- Connects to Telegram via long-polling — no ingress needed.
- Connects to `opencode serve` at `http://localhost:4096`.
- No upstream Docker image — we write a minimal `node:20-alpine` Dockerfile.

Key env vars:
| Var | Source | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Vault (`TG_TOKEN_SENAEV_OBSIDIAN_SYNC_BOT`) | New bot token (separate from webhook-endpoint bot) |
| `TELEGRAM_ALLOWED_USER_ID` | Vault (`TG_SENAEV_USER_ID`) | Numeric Telegram user ID whitelist |
| `OPENCODE_API_URL` | hardcoded | `http://localhost:4096` |
| `OPENCODE_MODEL_PROVIDER` | values.yaml | e.g. `anthropic` or `openai` |
| `OPENCODE_MODEL_ID` | values.yaml | e.g. `claude-sonnet-4-6` |
| `OPEN_BROWSER_ROOTS` | hardcoded | `/vault` — restricts `/open` browsing to the vault |

### opencode serve (new container)

- Runs `opencode serve` headlessly on port 4096.
- Full read/write access to `/vault` — treat it as a codebase.
- Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` depending on chosen model provider.
- No upstream Docker image — we write a minimal Dockerfile (Go binary, small).

Key env vars:
| Var | Source | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Vault | If using Anthropic models |
| `OPENAI_API_KEY` | Vault | If using OpenAI models |
| `OPENCODE_WORKDIR` | hardcoded | Working directory for opencode — required, no default |

### obsidian-sync sidecar (existing — unchanged)

- Continuously syncs Obsidian Sync into `/vault`.
- `OBSIDIAN_SYNC_MODE` unset — default bidirectional sync. Changes made by OpenCode
  will be pushed back to Obsidian cloud and appear in the Obsidian app on other devices.

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: obsidian-opencode
spec:
  replicas: 1
  selector:
    matchLabels:
      app: obsidian-opencode
  template:
    metadata:
      labels:
        app: obsidian-opencode
    spec:
      containers:
        - name: opencode-telegram-bot
          image: ghcr.io/senaev/opencode-telegram-bot:latest
          env:
            - name: TELEGRAM_BOT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: senaev-com-kv-secrets
                  key: TG_TOKEN_SENAEV_OBSIDIAN_SYNC_BOT
            - name: TELEGRAM_ALLOWED_USER_ID
              valueFrom:
                secretKeyRef:
                  name: senaev-com-kv-secrets
                  key: TG_SENAEV_USER_ID
            - name: OPENCODE_API_URL
              value: "http://localhost:4096"
            - name: OPENCODE_MODEL_PROVIDER
              value: "anthropic"
            - name: OPENCODE_MODEL_ID
              value: "claude-sonnet-4-6"
            - name: OPEN_BROWSER_ROOTS
              value: "/vault"

        - name: opencode-serve
          image: ghcr.io/senaev/opencode-serve:latest
          env:
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: senaev-com-kv-secrets
                  key: ANTHROPIC_API_KEY
          volumeMounts:
            - name: vault
              mountPath: /vault

        - name: obsidian-sync
          image: ghcr.io/senaev/obsidian-sync:latest
          env:
            - name: OBSIDIAN_AUTH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: senaev-com-kv-secrets
                  key: OBSIDIAN_AUTH_TOKEN
            - name: OBSIDIAN_VAULT_NAME
              valueFrom:
                secretKeyRef:
                  name: senaev-com-kv-secrets
                  key: OBSIDIAN_VAULT_NAME
            - name: OBSIDIAN_DEVICE_NAME
              value: "senaev-com-obsidian-headless"
          volumeMounts:
            - name: vault
              mountPath: /vault

      volumes:
        - name: vault
          hostPath:
            path: /data/volumes/obsidian-sync/vault
            type: DirectoryOrCreate
```

## Security requirements

1. `OBSIDIAN_AUTH_TOKEN` and `OBSIDIAN_VAULT_NAME` never visible in opencode or bot containers.
2. Telegram access restricted to `TELEGRAM_ALLOWED_USER_ID`.
3. No ingress required — bot uses long-polling only.
4. `OPEN_BROWSER_ROOTS=/vault` prevents the bot's `/open` command from browsing outside the vault.
5. Containers run as non-root where possible.
6. Resource limits and requests configured.

## Collaboration model

Claude proposes implementation steps; the user executes or reviews. No cluster state
is modified without the user running the commands explicitly.

## Implementation plan

- [x] Create new Telegram bot via BotFather, add token to Vault as `TG_TOKEN_SENAEV_OBSIDIAN_SYNC_BOT`
- [x] Add Telegram user ID to Vault as `TG_SENAEV_USER_ID`
- [x] Write `opencode-telegram-bot/Dockerfile` (node:20-alpine, installs `@grinev/opencode-telegram-bot`)
- [x] Write `opencode-serve/Dockerfile` (debian:bookworm-slim, installs opencode via curl, `OPENCODE_WORKDIR` required)
- [x] Add GitHub Actions workflow to build and push opencode-serve image to GHCR
- [x] Add `opencode-serve.yaml` Helm template — separate deployment sharing obsidian-sync hostPath volume
- [x] Deploy and test end-to-end: send a message → OpenCode queries vault → reply in Telegram

## Findings

### 2026-06-20 — Step 1: obsidian-sync container

**Research finding**: Obsidian released an official headless CLI (`obsidian-headless`, npm package, `ob` binary) in open beta on 2026-02-27. It connects to the real `sync.obsidian.md` with E2E encryption — no Xvfb, no Electron. Requires Node 22+.

The CLI reads `OBSIDIAN_AUTH_TOKEN` from the environment for non-interactive login (`ob login`). Full startup sequence: `ob login` → `ob sync-setup` → `ob sync --continuous`.

**Implementation**: Created `obsidian-sync/` with:
- `Dockerfile` — `node:22-alpine` base, reuses built-in `node` user (uid 1000), installs `obsidian-headless` globally, vault path hardcoded to `/vault`
- `entrypoint.sh` — validates required env vars, runs login → sync-setup → optional sync-config → `ob sync --continuous`
- `.github/workflows/build-obsidian-sync.yml` — builds and pushes to `ghcr.io/senaev/obsidian-sync:latest`

**Env vars consumed by the container** (all sourced from `senaev-com-kv` Vault via `senaev-com-kv-secrets`):
| Var | Required | Source | Description |
|---|---|---|---|
| `OBSIDIAN_AUTH_TOKEN` | yes | Vault | Auth token obtained via `npx obsidian-headless@latest login` |
| `OBSIDIAN_VAULT_NAME` | yes | Vault | Remote vault name or ID |
| `OBSIDIAN_DEVICE_NAME` | no | values.yaml | Device name shown in Obsidian version history (set to `k3s-hetzner`) |
| `OBSIDIAN_VAULT_PATH` | yes | Helm | Container path where the vault is mounted (e.g. `/projects/vault`) |
| `OBSIDIAN_SYNC_MODE` | no | hardcoded | Set to `pull-only` — vault is read-only for Claude |
| `OBSIDIAN_CONFLICT_STRATEGY` | no | env | `merge` / `conflict` |
| `OBSIDIAN_EXCLUDED_FOLDERS` | no | env | Comma-separated folders to exclude |

**Vault is not E2E encrypted** — no password needed.

**Note on `ob sync-setup`**: runs on every container start (idempotent — safe to re-run).

**Helm**: `obsidian-sync` Deployment added to `senaev-com` chart, deployed on `hetzner`, vault stored at `clusterRootPath/volumes/obsidian-sync/vault` (hostPath).

**Before deploying**: add `OBSIDIAN_VAULT_NAME` to Vault at `senaev-com-kv`.

**Next steps**:
- [x] Add `OBSIDIAN_VAULT_NAME` to Vault and deploy to test sync
- [ ] Scaffold `claude-code-runner-api` service
- [ ] Add `claude-code-runner-api` as second container in the Deployment with shared vault volume

### 2026-06-20 — final state

**Two deployments running on hetzner:**

`obsidian-sync` — syncs Obsidian Sync cloud → `/projects/vault` (hostPath). `Recreate` strategy prevents duplicate sync instances. Config dir stays in-container (no volume) so lockfile never persists.

`obsidian-opencode` — two containers in one pod:
- `opencode-serve`: runs `opencode serve` from `/projects/vault`, configured via `OPENCODE_CONFIG_CONTENT` with OpenRouter + `anthropic/claude-sonnet-4.6`
- `opencode-telegram-bot`: Telegram long-polling bot, browses `/projects` via `/open`, connects to opencode at `localhost:4096`

`Recreate` strategy on both deployments. Bot project selection persists in-container only — user runs `/open` once after pod start to select `/projects/vault`.

**Key decisions made during implementation:**
- Switched from Claude Code → Codex CLI → OpenCode + opencode-telegram-bot
- Dropped webhook-endpoint from the flow entirely
- Vault changed from read-only to full read/write (treat as codebase)
- Vault mount path: `/vault` → `/projects/vault` (room for future projects)
- Sync mode: pull-only → bidirectional
- Model provider: OpenAI direct → OpenRouter (uses existing `OPENROUTER_API_KEY`)
- `OBSIDIAN_VAULT_PATH` env var replaces hardcoded `/vault` in entrypoint.sh

### 2026-06-20 — switched runtime from Claude Code to OpenAI Codex CLI

Plan updated to use the OpenAI Codex CLI (`codex`, npm package `@openai/codex`) instead of Claude Code.
Key changes: `ANTHROPIC_API_KEY` → `OPENAI_API_KEY`, container/secret names updated to `codex-runner-*`, CLI invocation uses `codex --approval-policy auto-edit`.

### 2026-06-20 — obsidian-sync container verified

Added `OBSIDIAN_VAULT_NAME` to `senaev-com-kv` Vault. Deployed and ran the container successfully — sync is confirmed working.

### 2026-06-20 — opencode-serve container built successfully

`opencode-serve/Dockerfile` committed and built via GitHub Actions. Image pushed to `ghcr.io/senaev/opencode-serve:latest`.
`OPENCODE_WORKDIR` is required — container fails fast if unset.

### 2026-06-20 — opencode-serve verified in cluster

Deployed `obsidian-opencode` to hetzner. Confirmed `GET http://localhost:4096/doc` returns the OpenAPI spec via SSH tunnel. opencode-serve is running and pointed at the vault.

Fix required: install script puts the binary at `~/.opencode/bin`, not `~/.local/bin` — added `ENV PATH="/root/.opencode/bin:$PATH"` to the Dockerfile.

### 2026-06-20 — switched to OpenCode + opencode-telegram-bot

Dropped webhook-endpoint and Codex runner. New plan uses two off-the-shelf components:
- `opencode serve` as the AI agent backend (supports Anthropic, OpenAI, 75+ providers)
- `opencode-telegram-bot` (`@grinev/opencode-telegram-bot`) as the Telegram interface

Vault is treated as a codebase with full read/write access — no agent mode locking.
User will create a new Telegram bot (separate from the existing webhook-endpoint bot).
`OPEN_BROWSER_ROOTS=/vault` restricts the bot's directory browser to the vault.
`OBSIDIAN_SYNC_MODE` removed — bidirectional sync enabled. OpenCode edits will sync back to Obsidian cloud and appear on other devices.
