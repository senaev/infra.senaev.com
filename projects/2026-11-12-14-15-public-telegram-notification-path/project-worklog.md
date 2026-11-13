# Project worklog

## 2026-11-13 — Route implemented

Decisions: the Vault key and env var are `TELEGRAM_PUBLIC_API_PATH` (user's name); no rate limit; one fixed path for all scripts, revoked by rotating the key.

Added `cluster-helper/src/telegramPublicApi.ts` (Fastify plugin on the public server) and its tests. The text is escaped with `escapeTelegramMarkdown`, because `sendTelegramMessage` has no plain-text mode. The route uses `logLevel: 'silent'`, because Fastify's request log contains `req.url`, which is the secret; a test checks that neither the path nor the text is logged. The Vault key must exist before the deploy, because the env var is required.

## 2026-11-12 14:15 UTC — Project created

The user asked for a public Telegram notification path for the `work-log` skill on the work laptop (dotfiles project `datadog/projects/2026-11-02-22-35-hermes-weekly-work-achievements/`). The client reads the secret path from the vault file `@senaev/work_stream/work_stream_workflow.md`, front matter `send-message-path`. Implementation has not started. Open: rate limit, one path or one path for each client.
