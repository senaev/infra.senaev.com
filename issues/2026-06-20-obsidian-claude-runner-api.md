# 2026-06-20 — Obsidian Claude Runner API

> This file is the working log for this task. All design decisions, implementation steps,
> commands run, outputs pasted, blockers hit, and the eventual completion state must be
> appended to this file as we go — so the whole session lives in one place and is
> searchable later.
>
> Format: append new dated sections under ## Findings as work proceeds. Don't rewrite
> earlier sections — annotate them.

## Goal

Build a new service called **Claude Code Runner API** that accepts HTTP requests from
the existing **Webhook Endpoint** service, runs Claude Code with a given prompt, and
provides Claude Code with read-only access to a local Obsidian Vault.

The vault is synchronized inside a Kubernetes pod by a dedicated `obsidian-sync` sidecar
via Obsidian Sync. Claude Code must never write to the vault.

## Architecture

```
Telegram
  ↓
Webhook Endpoint  (existing — no changes needed)
  ↓  HTTP POST /v1/ask
Claude Code Runner API  (new)
  ↓
Claude Code Runtime
  ↓  read-only /vault
  ↑  read-write /vault
Obsidian Headless Sync sidecar
  ↑
Obsidian Sync
```

## Components

### Webhook Endpoint (existing)

No changes required. It must:
- Forward the user message as a POST to Claude Code Runner API.
- Return the response to Telegram.
- NOT access `/vault` or do any file discovery.

### Claude Code Runner API (new service)

Single endpoint:

```
POST /v1/ask
Authorization: Bearer <INTERNAL_SHARED_TOKEN>
Content-Type: application/json
```

Request:
```json
{
  "chat_id": "string",
  "user_id": "string",
  "message": "string",
  "request_id": "string (optional)"
}
```

Success response:
```json
{ "answer": "string", "status": "ok", "request_id": "string (optional)" }
```

Error response:
```json
{ "status": "error", "error": "string", "request_id": "string (optional)" }
```

Start with synchronous processing. Streaming/async can be added later.

### Claude Code system prompt

```
You are an assistant with read-only access to the user's Obsidian vault mounted at /vault.

Your task is to answer the user's questions using the contents of the vault.

You may:
- list files and directories
- search markdown files
- read markdown files
- summarize, compare, and synthesize information from notes

You must not:
- create files
- modify files
- delete files
- rename files
- move files
- write to the vault
- run destructive shell commands

If the user asks to change the vault, propose the change as text only and explain that
direct modification is disabled.

When answering:
- be concise but useful
- mention which notes or paths you used when relevant
- distinguish between information found in the vault and your own inference
- clearly state when relevant information cannot be found
```

Claude Code independently decides which files to inspect — Webhook Endpoint must not
pre-select files.

### Obsidian Sync sidecar

- Continuously syncs Obsidian Sync into `/vault` on the shared PVC.
- Read-write access to the shared volume.
- Secrets (auth token, vault name, vault password) must NEVER be visible inside the
  Claude Code Runner container.

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: obsidian-claude-runner
spec:
  replicas: 1
  selector:
    matchLabels:
      app: obsidian-claude-runner
  template:
    metadata:
      labels:
        app: obsidian-claude-runner
    spec:
      containers:
        - name: claude-code-runner-api
          image: my-registry/claude-code-runner-api:latest
          env:
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: claude-code-secrets
                  key: anthropic-api-key
            - name: VAULT_PATH
              value: /vault
          volumeMounts:
            - name: obsidian-vault
              mountPath: /vault
              readOnly: true

        - name: obsidian-sync
          image: obsidian-headless-sync-image
          env:
            - name: OBSIDIAN_AUTH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: obsidian-sync-secrets
                  key: obsidian-auth-token
            - name: OBSIDIAN_VAULT_NAME
              valueFrom:
                secretKeyRef:
                  name: obsidian-sync-secrets
                  key: obsidian-vault-name
            - name: VAULT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: obsidian-sync-secrets
                  key: vault-password
          volumeMounts:
            - name: obsidian-vault
              mountPath: /vault

      volumes:
        - name: obsidian-vault
          persistentVolumeClaim:
            claimName: obsidian-vault-pvc
```

## Security requirements

1. `/vault` mounted read-only in the Claude Code Runner container.
2. Webhook Endpoint has no access to `/vault`.
3. Claude Code Runner has no Kubernetes service account token unless explicitly needed.
4. Claude Code Runner runs as a non-root user where possible.
5. Resource limits and requests are configured.
6. Root filesystem write access disabled if compatible with Claude Code runtime.
7. Obsidian Sync credentials never available in the Claude Code Runner container.
8. Logs must not contain full contents of private notes.
9. API access restricted via internal shared token, network policies, or both.

## Collaboration model

Claude proposes implementation steps; the user executes or reviews. No cluster state
is modified without the user running the commands explicitly.

**Read-only until design is confirmed.** Before writing any Kubernetes manifests or
code, confirm the approach with the user. Only proceed to implementation after sign-off.

## Implementation plan

- [ ] Scaffold Claude Code Runner API service (language TBD — Go or Python)
- [ ] Implement `POST /v1/ask` with bearer token auth
- [ ] Wire Claude Code SDK invocation with the system prompt above
- [ ] Mount `/vault` read-only; pass `VAULT_PATH` env var to Claude Code
- [ ] Write Kubernetes Deployment manifest with both containers and shared PVC
- [ ] Write Kubernetes Secret manifests (claude-code-secrets, obsidian-sync-secrets)
- [ ] Add NetworkPolicy to restrict access to Claude Code Runner API
- [ ] Configure resource limits/requests and non-root securityContext
- [ ] Test end-to-end: Webhook Endpoint → Claude Code Runner API → vault query → response

## Findings

### 2026-06-20 — Step 1: obsidian-sync container

**Research finding**: Obsidian released an official headless CLI (`obsidian-headless`, npm package, `ob` binary) in open beta on 2026-02-27. It connects to the real `sync.obsidian.md` with E2E encryption — no Xvfb, no Electron. Requires Node 22+.

The CLI reads `OBSIDIAN_AUTH_TOKEN` from the environment for non-interactive login (`ob login`). Full startup sequence: `ob login` → `ob sync-setup` → `ob sync --continuous`.

**Implementation**: Created `obsidian-sync/` with:
- `Dockerfile` — `node:22-alpine` base, installs `obsidian-headless` globally, `obsidian` user (uid 1000)
- `entrypoint.sh` — validates required env vars, runs login, sync-setup, optional sync-config, then `ob sync --continuous`

**Env vars consumed by the container**:
| Var | Required | Description |
|---|---|---|
| `OBSIDIAN_AUTH_TOKEN` | yes | Auth token from `ob login` (stored in Vault `senaev-com-kv`) |
| `OBSIDIAN_VAULT_NAME` | yes | Remote vault name or ID |
| `OBSIDIAN_VAULT_PASSWORD` | no | E2E encryption password if vault is encrypted |
| `OBSIDIAN_VAULT_PATH` | no | Local mount path (default `/vault`) |
| `OBSIDIAN_DEVICE_NAME` | no | Device name shown in Obsidian version history |
| `OBSIDIAN_SYNC_MODE` | no | `bidirectional` / `pull-only` / `mirror-remote` |
| `OBSIDIAN_CONFLICT_STRATEGY` | no | `merge` / `conflict` |
| `OBSIDIAN_EXCLUDED_FOLDERS` | no | Comma-separated folders to exclude |

**Note on `ob sync-setup`**: runs on every container start (idempotent — safe to re-run). Auth token is obtained once by running `ob login` interactively locally, then stored in K8s secret.

**Next steps**:
- [ ] Build and test the image locally
- [ ] Scaffold `claude-code-runner-api` service
- [ ] Write K8s Deployment manifest with both containers and shared PVC
