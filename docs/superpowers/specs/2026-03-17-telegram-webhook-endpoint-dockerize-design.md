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
├── Dockerfile
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # Entrypoint: HTTP server, startup, shutdown
    ├── config.ts             # Environment variables and constants
    ├── kafka-producer.ts     # Kafka producer wrapper
    └── telegram-api.ts       # Telegram Bot API calls using fetch
```

### Technology choices

- **Runtime**: Node.js 22 Alpine
- **TypeScript runner**: `tsx` (matches media-server-helper)
- **Module system**: CommonJS with `"type": "commonjs"` (matches media-server-helper)
- **tsconfig**: Strict, `module: "nodenext"`, `target: "esnext"` (matches media-server-helper)
- **Dependencies**: `tsx`, `kafkajs`
- **Dev dependencies**: `typescript`, `@types/node`
- **HTTP**: Raw `node:http` module (service only has 3 routes, no need for fastify)
- **Telegram API**: Node 22 built-in `fetch` replaces hand-rolled `https.request`

### Module responsibilities

| File | Responsibility |
|------|---------------|
| `config.ts` | Export typed env vars (`TELEGRAM_BOT_TOKEN`, `WEBHOOK_DOMAIN`, `KAFKA_BROKERS`, `KAFKA_TOPIC`) and constants (`PORT`, `WEBHOOK_PATH`, `MAX_BODY_SIZE`) |
| `kafka-producer.ts` | Export functions: `connectProducer()`, `sendMessage(topic, value)`, `disconnectProducer()` |
| `telegram-api.ts` | Export `telegramApiCall(method, payload)` using `fetch` to `https://api.telegram.org/bot<token>/<method>` |
| `index.ts` | Wire everything: create HTTP server, connect Kafka, set Telegram webhook, handle graceful shutdown |

### Dockerfile

Mirrors `media-server-helper.senaev.com/Dockerfile`:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### GitHub Actions workflow

File: `.github/workflows/build-telegram-webhook-endpoint.yml`

- Trigger: push to `main`/`master` when `telegram-webhook-endpoint/**` changes, plus `workflow_dispatch`
- Steps: checkout, setup-buildx, login to GHCR, build-and-push
- Image: `ghcr.io/senaev/telegram-webhook-endpoint:latest`
- Build context: `./telegram-webhook-endpoint`
- Platform: `linux/amd64`
- Cache: GitHub Actions cache (`type=gha`)

### Helm chart changes

**`provisioning/helm/senaev-com/templates/telegram-webhook-endpoint.yaml`**:
- Remove: ConfigMap resource, init container, volume mounts, volumes
- Replace image `node:22-alpine` with `ghcr.io/senaev/telegram-webhook-endpoint:latest`
- Keep: Deployment (simplified), Service, same env vars, same nodeSelector

**`provisioning/helm/senaev-com/values.yaml`**: No changes needed.

### Cleanup

- Delete `provisioning/helm/senaev-com/config/telegram-webhook-endpoint/index.js`
- Delete `provisioning/helm/senaev-com/config/telegram-webhook-endpoint/package.json`

## Behavior preserved

The rewritten service maintains identical external behavior:
- Listens on port 3000
- GET any path returns 200 health check
- POST `/telegram-webhook` with valid `x-telegram-bot-api-secret-token` header forwards body to Kafka
- On startup: connects Kafka producer, starts HTTP server, calls `setWebhook` on Telegram API
- On SIGTERM/SIGINT: graceful shutdown (close server, disconnect producer)
