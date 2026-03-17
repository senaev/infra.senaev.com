# Telegram Webhook Endpoint Dockerize & TypeScript Rewrite

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ConfigMap-based telegram-webhook-endpoint deployment with a Docker image built via GitHub Actions, rewriting the service to modular TypeScript with tsx.

**Architecture:** New `telegram-webhook-endpoint/` folder at repo root containing a Node.js 22 TypeScript service with 4 source modules. GitHub Actions builds and pushes to GHCR on changes. Helm template simplified to reference the Docker image directly.

**Tech Stack:** Node.js 22, TypeScript, tsx, kafkajs, node:http, GitHub Actions, GHCR, Helm

**Spec:** `docs/superpowers/specs/2026-03-17-telegram-webhook-endpoint-dockerize-design.md`

---

## File Map

### New files (create)

| File | Responsibility |
|------|---------------|
| `telegram-webhook-endpoint/package.json` | Project manifest with tsx, kafkajs as prod deps |
| `telegram-webhook-endpoint/tsconfig.json` | Strict TS config matching media-server-helper |
| `telegram-webhook-endpoint/Dockerfile` | Multi-stage Node 22 Alpine image |
| `telegram-webhook-endpoint/.dockerignore` | Exclude node_modules, .git |
| `telegram-webhook-endpoint/src/config.ts` | Env vars, constants, webhook secret token |
| `telegram-webhook-endpoint/src/telegram-api.ts` | Telegram Bot API calls via fetch |
| `telegram-webhook-endpoint/src/kafka-producer.ts` | Kafka producer connect/send/disconnect |
| `telegram-webhook-endpoint/src/index.ts` | HTTP server, startup orchestration, shutdown |
| `.github/workflows/build-telegram-webhook-endpoint.yml` | CI: build & push Docker image to GHCR |

### Modified files

| File | Change |
|------|--------|
| `provisioning/helm/senaev-com/templates/telegram-webhook-endpoint.yaml` | Remove ConfigMap + initContainer + volumes; use Docker image; add reloader annotation + health probes |

### Deleted files

| File | Reason |
|------|--------|
| `provisioning/helm/senaev-com/config/telegram-webhook-endpoint/index.js` | Replaced by TypeScript source |
| `provisioning/helm/senaev-com/config/telegram-webhook-endpoint/package.json` | Replaced by new package.json |

---

## Task 1: Scaffold project files

**Files:**
- Create: `telegram-webhook-endpoint/package.json`
- Create: `telegram-webhook-endpoint/tsconfig.json`
- Create: `telegram-webhook-endpoint/.dockerignore`
- Create: `telegram-webhook-endpoint/Dockerfile`

- [ ] **Step 1: Create `telegram-webhook-endpoint/package.json`**

```json
{
  "name": "telegram-webhook-endpoint",
  "version": "1.0.0",
  "type": "commonjs",
  "main": "src/index.ts",
  "scripts": {
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "kafkajs": "2.2.4",
    "tsx": "4.21.0"
  },
  "devDependencies": {
    "@types/node": "25.4.0",
    "typescript": "5.9.3"
  }
}
```

- [ ] **Step 2: Create `telegram-webhook-endpoint/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "target": "esnext",
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "strict": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 3: Create `telegram-webhook-endpoint/.dockerignore`**

```
node_modules
.git
npm-debug.log
Dockerfile
.dockerignore
.gitignore
```

- [ ] **Step 4: Create `telegram-webhook-endpoint/Dockerfile`**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

- [ ] **Step 5: Generate package-lock.json**

Run from the `telegram-webhook-endpoint/` directory:

```bash
cd telegram-webhook-endpoint && npm install
```

This creates `package-lock.json` and `node_modules/`. The lock file is committed; `node_modules/` is excluded by `.dockerignore`.

- [ ] **Step 6: Commit scaffold**

```bash
git add telegram-webhook-endpoint/package.json telegram-webhook-endpoint/package-lock.json telegram-webhook-endpoint/tsconfig.json telegram-webhook-endpoint/.dockerignore telegram-webhook-endpoint/Dockerfile
git commit -m "feat: scaffold telegram-webhook-endpoint project files"
```

---

## Task 2: Implement `config.ts`

**Files:**
- Create: `telegram-webhook-endpoint/src/config.ts`

- [ ] **Step 1: Create `telegram-webhook-endpoint/src/config.ts`**

```typescript
import { randomBytes } from "node:crypto";

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
export const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN!;
export const KAFKA_BROKERS = process.env.KAFKA_BROKERS!;
export const KAFKA_TOPIC = process.env.KAFKA_TOPIC!;

export const PORT = 3000;
export const WEBHOOK_PATH = "/telegram-webhook";
export const MAX_BODY_SIZE = 1_000_000;

export const webhookSecretToken = randomBytes(32).toString("hex");
```

- [ ] **Step 2: Verify it compiles**

```bash
cd telegram-webhook-endpoint && npx tsc --noEmit src/config.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add telegram-webhook-endpoint/src/config.ts
git commit -m "feat: add config module with env vars and constants"
```

---

## Task 3: Implement `telegram-api.ts`

**Files:**
- Create: `telegram-webhook-endpoint/src/telegram-api.ts`

- [ ] **Step 1: Create `telegram-webhook-endpoint/src/telegram-api.ts`**

```typescript
import { TELEGRAM_BOT_TOKEN } from "./config.js";

export async function telegramApiCall(
  method: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  const data: unknown = await response.json();
  return data;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd telegram-webhook-endpoint && npx tsc --noEmit src/telegram-api.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add telegram-webhook-endpoint/src/telegram-api.ts
git commit -m "feat: add telegram API module using fetch"
```

---

## Task 4: Implement `kafka-producer.ts`

**Files:**
- Create: `telegram-webhook-endpoint/src/kafka-producer.ts`

- [ ] **Step 1: Create `telegram-webhook-endpoint/src/kafka-producer.ts`**

```typescript
import { Kafka } from "kafkajs";
import { KAFKA_BROKERS } from "./config.js";

const kafka = new Kafka({ brokers: [KAFKA_BROKERS] });
const producer = kafka.producer();

export async function connectProducer(): Promise<void> {
  await producer.connect();
}

export async function sendMessage(
  topic: string,
  value: string,
): Promise<void> {
  await producer.send({
    topic,
    messages: [{ value }],
  });
}

export async function disconnectProducer(): Promise<void> {
  await producer.disconnect();
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd telegram-webhook-endpoint && npx tsc --noEmit src/kafka-producer.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add telegram-webhook-endpoint/src/kafka-producer.ts
git commit -m "feat: add Kafka producer module"
```

---

## Task 5: Implement `index.ts`

**Files:**
- Create: `telegram-webhook-endpoint/src/index.ts`

- [ ] **Step 1: Create `telegram-webhook-endpoint/src/index.ts`**

```typescript
import http from "node:http";
import {
  PORT,
  WEBHOOK_PATH,
  WEBHOOK_DOMAIN,
  KAFKA_TOPIC,
  MAX_BODY_SIZE,
  webhookSecretToken,
} from "./config.js";
import { telegramApiCall } from "./telegram-api.js";
import {
  connectProducer,
  sendMessage,
  disconnectProducer,
} from "./kafka-producer.js";

const server = http.createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200);
    res.end("Telegram Webhook Endpoint Works!");
    return;
  }

  if (req.method === "POST" && req.url === WEBHOOK_PATH) {
    const secret = req.headers["x-telegram-bot-api-secret-token"];
    if (secret !== webhookSecretToken) {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        req.destroy();
        res.writeHead(413);
        res.end("Payload Too Large");
      }
    });
    req.on("end", () => {
      if (body.length > MAX_BODY_SIZE) return;
      sendMessage(KAFKA_TOPIC, body)
        .then(() => {
          res.writeHead(200);
          res.end("OK");
        })
        .catch((err: unknown) => {
          console.error("Failed to send to Kafka:", err);
          res.writeHead(500);
          res.end("Error");
        });
    });
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

async function main(): Promise<void> {
  await connectProducer();
  console.log("Connected to Kafka");

  await new Promise<void>((resolve) =>
    server.listen(PORT, "0.0.0.0", resolve),
  );
  console.log(`Server listening on port=${PORT}`);

  const webhookUrl = `https://${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;
  await telegramApiCall("setWebhook", {
    url: webhookUrl,
    secret_token: webhookSecretToken,
  });
  console.log(`Webhook set to url=${webhookUrl}`);
}

function shutdown(): void {
  console.log("Shutting down...");
  server.close(() => {
    disconnectProducer().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify entire project compiles**

```bash
cd telegram-webhook-endpoint && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add telegram-webhook-endpoint/src/index.ts
git commit -m "feat: add main entrypoint with HTTP server and startup logic"
```

---

## Task 6: Add GitHub Actions workflow

**Files:**
- Create: `.github/workflows/build-telegram-webhook-endpoint.yml`

- [ ] **Step 1: Create `.github/workflows/build-telegram-webhook-endpoint.yml`**

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

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-telegram-webhook-endpoint.yml'))"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-telegram-webhook-endpoint.yml
git commit -m "ci: add GitHub Actions workflow to build telegram-webhook-endpoint image"
```

---

## Task 7: Update Helm template

**Files:**
- Modify: `provisioning/helm/senaev-com/templates/telegram-webhook-endpoint.yaml`

- [ ] **Step 1: Replace the entire Helm template**

Replace the contents of `provisioning/helm/senaev-com/templates/telegram-webhook-endpoint.yaml` with:

```yaml
{{- if .Values.telegramWebhookEndpoint.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: telegram-webhook-endpoint
  namespace: {{ .Release.Namespace }}
  labels:
    app: telegram-webhook-endpoint
spec:
  replicas: 1
  selector:
    matchLabels:
      app: telegram-webhook-endpoint
  template:
    metadata:
      labels:
        app: telegram-webhook-endpoint
      annotations:
        secret.reloader.stakater.com/reload: "senaev-com-kv-secrets"
    spec:
      nodeSelector:
        vps: {{ .Values.telegramWebhookEndpoint.vps }}
      containers:
        - name: telegram-webhook-endpoint
          image: ghcr.io/senaev/telegram-webhook-endpoint:latest
          ports:
            - containerPort: 3000
          env:
            - name: KAFKA_BROKERS
              value: redpanda.{{ .Release.Namespace }}.svc.cluster.local:{{ .Values.redpanda.kafkaPort }}
            - name: KAFKA_TOPIC
              value: {{ (index .Values.redpanda.topics 0).name }}
            - name: WEBHOOK_DOMAIN
              value: {{ .Values.telegramWebhookEndpoint.webhookDomain }}
            - name: TELEGRAM_BOT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: senaev-com-kv-secrets
                  key: TOKEN_senaev_com_bot
                  optional: false
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: telegram-webhook-endpoint
  namespace: {{ .Release.Namespace }}
  labels:
    app: telegram-webhook-endpoint
spec:
  type: ClusterIP
  selector:
    app: telegram-webhook-endpoint
  ports:
    - port: 3000
      targetPort: 3000
{{- end }}
```

- [ ] **Step 2: Validate Helm template renders**

```bash
cd provisioning/helm/senaev-com && helm template . --set telegramWebhookEndpoint.enabled=true --set telegramWebhookEndpoint.vps=hetzner --set telegramWebhookEndpoint.webhookDomain=telegram-webhook-endpoint.senaev.com --set redpanda.kafkaPort=9092 --set 'redpanda.topics[0].name=telegram-webhook-data' 2>&1 | grep -A5 "telegram-webhook-endpoint"
```

Expected: rendered YAML with `image: ghcr.io/senaev/telegram-webhook-endpoint:latest`, no ConfigMap, no initContainers.

- [ ] **Step 3: Commit**

```bash
git add provisioning/helm/senaev-com/templates/telegram-webhook-endpoint.yaml
git commit -m "feat: update helm template to use Docker image with health probes and reloader"
```

---

## Task 8: Clean up old ConfigMap files

**Files:**
- Delete: `provisioning/helm/senaev-com/config/telegram-webhook-endpoint/index.js`
- Delete: `provisioning/helm/senaev-com/config/telegram-webhook-endpoint/package.json`

- [ ] **Step 1: Delete old files**

```bash
rm provisioning/helm/senaev-com/config/telegram-webhook-endpoint/index.js
rm provisioning/helm/senaev-com/config/telegram-webhook-endpoint/package.json
rmdir provisioning/helm/senaev-com/config/telegram-webhook-endpoint
```

- [ ] **Step 2: Verify no remaining references to deleted files**

```bash
grep -r "config/telegram-webhook-endpoint" provisioning/
```

Expected: no output (no remaining references).

- [ ] **Step 3: Commit**

```bash
git add -A provisioning/helm/senaev-com/config/telegram-webhook-endpoint/
git commit -m "chore: remove old ConfigMap-based telegram-webhook-endpoint source"
```

---

## Task 9: Local Docker build smoke test

- [ ] **Step 1: Build the Docker image locally**

```bash
cd telegram-webhook-endpoint && docker build -t telegram-webhook-endpoint:test .
```

Expected: successful build, no errors.

- [ ] **Step 2: Verify the image starts (will fail on missing env vars, but confirms tsx works)**

```bash
docker run --rm -e KAFKA_BROKERS=localhost:9092 -e KAFKA_TOPIC=test -e WEBHOOK_DOMAIN=test.example.com -e TELEGRAM_BOT_TOKEN=fake telegram-webhook-endpoint:test &
sleep 3
# It will fail to connect to Kafka, but should print "Server listening" or "Connected to Kafka" attempt
docker ps -a | grep telegram-webhook-endpoint
```

Expected: container starts, tsx executes the TypeScript successfully (connection errors to Kafka are expected).

- [ ] **Step 3: Clean up test image**

```bash
docker rmi telegram-webhook-endpoint:test 2>/dev/null || true
```
