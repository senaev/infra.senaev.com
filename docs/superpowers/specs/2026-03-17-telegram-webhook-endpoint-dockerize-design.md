# Telegram Webhook Endpoint: Dockerize and Rewrite to TypeScript

## Summary

Replace the ConfigMap-based deployment of `telegram-webhook-endpoint` with a proper Docker image built via GitHub Actions. Rewrite the service from a single CommonJS JavaScript file to modular TypeScript using `tsx` as the runner.

## Current State

The service currently:
- Embeds `index.js` and `package.json` in a Kubernetes ConfigMap
- Uses an init container to run `npm install` at pod startup (slow, no lockfile)
- Runs on `node:22-alpine` with raw `node index.js`
- Single file (~130 lines) handling HTTP server, Kafka producer, and Telegram API calls

## Target State

### New folder: `telegram-webhook-endpoint/`

Located at the repo root of `infra.senaev.com`:

```
telegram-webhook-endpoint/
├── .dockerignore
├── Dockerfile
├── package.json
├── package-lock.json          # Required by npm ci, committed to git
├── tsconfig.json
└── src/
    ├── index.ts               # Entrypoint: HTTP server, startup, shutdown
    ├── config.ts              # Environment variables and constants
    ├── kafka-producer.ts      # Kafka producer wrapper
    └── telegram-api.ts        # Telegram Bot API calls using fetch
```

### Technology choices

- **Runtime**: Node.js 22 Alpine
- **TypeScript runner**: `tsx` — must be in `dependencies` (not `devDependencies`) because the Dockerfile uses `npm ci --omit=dev` and tsx is needed at runtime
- **Module system**: CommonJS with `"type": "commonjs"` (matches media-server-helper)
- **tsconfig**: Strict, `module: "nodenext"`, `target: "esnext"` (matches media-server-helper)
- **Dependencies** (production): `tsx`, `kafkajs`
- **Dev dependencies**: `typescript`, `@types/node`
- **HTTP**: Raw `node:http` module (service only has 3 routes, no need for fastify)
- **Telegram API**: Node 22 built-in `fetch` replaces hand-rolled `https.request`

### Module responsibilities

| File | Responsibility |
|------|---------------|
| `config.ts` | Export typed env vars (`TELEGRAM_BOT_TOKEN`, `WEBHOOK_DOMAIN`, `KAFKA_BROKERS`, `KAFKA_TOPIC`) and constants (`PORT`, `WEBHOOK_PATH`, `MAX_BODY_SIZE`). Also generates and exports `webhookSecretToken` via `crypto.randomBytes(32)` — this is a per-startup random token used to validate incoming Telegram webhook requests. |
| `kafka-producer.ts` | Export functions: `connectProducer()`, `sendMessage(topic, value)`, `disconnectProducer()` |
| `telegram-api.ts` | Export `telegramApiCall(method, payload)` using `fetch` to `https://api.telegram.org/bot<token>/<method>` |
| `index.ts` | Wire everything: create HTTP server, connect Kafka, register webhook secret token with Telegram via `setWebhook`, handle graceful shutdown |

### Dockerfile

Based on `media-server-helper.senaev.com/Dockerfile`, adapted for this service (single port):

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### .dockerignore

```
node_modules
.git
```

### GitHub Actions workflow

File: `.github/workflows/build-telegram-webhook-endpoint.yml`

Note: unlike `media-server-helper` (which is its own repo and triggers on all pushes), this workflow uses a path filter because it lives in a monorepo alongside non-Docker content.

```yaml
name: Build Telegram Webhook Endpoint

on:
  push:
    branches: [main, master]
    paths:
      - 'telegram-webhook-endpoint/**'
  workflow_dispatch:

env:
  IMAGE_NAME: telegram-webhook-endpoint
  REGISTRY_IMAGE: ghcr.io/senaev/telegram-webhook-endpoint

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v6
        with:
          context: ./telegram-webhook-endpoint
          platforms: linux/amd64
          push: true
          tags: ${{ env.REGISTRY_IMAGE }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Helm chart changes

**`provisioning/helm/senaev-com/templates/telegram-webhook-endpoint.yaml`**:
- Remove: ConfigMap resource, init container, volume mounts, volumes
- Replace image `node:22-alpine` with `ghcr.io/senaev/telegram-webhook-endpoint:latest`
- Keep: Deployment (simplified), Service, same env vars, same nodeSelector
- Note: `:latest` tag means Kubernetes defaults `imagePullPolicy` to `Always`, which is the desired behavior — every pod restart pulls the newest image. This matches the `media-server-helper` deployment pattern.

**`provisioning/helm/senaev-com/values.yaml`**: No changes needed (enabled, vps, webhookDomain all stay the same).

### Cleanup

- Delete `provisioning/helm/senaev-com/config/telegram-webhook-endpoint/index.js`
- Delete `provisioning/helm/senaev-com/config/telegram-webhook-endpoint/package.json`

## Behavior preserved

The rewritten service maintains identical external behavior:
- Listens on port 3000
- GET any path returns 200 health check
- POST `/telegram-webhook` with valid `x-telegram-bot-api-secret-token` header forwards body to Kafka
- All other requests return 404
- On startup: connects Kafka producer, starts HTTP server, generates random `webhookSecretToken` and registers it with Telegram via `setWebhook` API call
- On SIGTERM/SIGINT: graceful shutdown (close server, disconnect producer)

### Additional improvements

- Add `secret.reloader.stakater.com/reload: "senaev-com-kv-secrets"` annotation to the Deployment template so secret rotations trigger a pod restart (matches `media-server-helper` pattern)
- Add health check / readiness probes (HTTP GET on port 3000)

## Out of scope

- Changing from `:latest` tag to SHA-based tags
