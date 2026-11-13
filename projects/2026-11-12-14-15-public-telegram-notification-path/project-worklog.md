# Project worklog

## 2026-11-13 13:30 UTC — Secret moved to the Authorization header

The user asked to move the secret out of the path in this PR. The route is now `/telegram-bot-api/:method` with `Authorization: Bearer <TELEGRAM_PUBLIC_API_SECRET>` (user's name), checked in an `onRequest` hook like `/llm`. The `logLevel: 'silent'` workaround is removed: the Fastify request log has no headers. The Vault key must be added under the new name; the old `TELEGRAM_PUBLIC_API_PATH` value can be reused because it was never deployed.

## 2026-11-13 13:20 UTC — Thin proxy to the Bot API

The user asked for a thin proxy instead of a fixed "send text to me" route: the client builds any Bot API request, the endpoint adds only the bot token. Asked about the risk (a leaked path gives full control of the bot, e.g. `setWebhook`); the user chose all methods and any chat. The raw body is forwarded (the plugin replaces the content type parsers with one buffer parser), so multipart uploads work. The Markdown/32000 limit work below is replaced. Secret-in-path is moved to the project `2026-11-13-13-16-remove-secrets-from-paths`.

## 2026-11-13 — Rich Markdown, 32000 characters; Vault key added

The user added the Vault key `TELEGRAM_PUBLIC_API_PATH`. The user wants to send whole Markdown files, so `text` is now sent unchanged as Telegram Rich Markdown (no escaping), with a limit of 32000 code points (the rich message limit is 32768). The 2000 limit had no reason except the first plan. The prefix `📨` is now its own paragraph, so a first-line heading still renders.

## 2026-11-13 — Route implemented

Decisions: the Vault key and env var are `TELEGRAM_PUBLIC_API_PATH` (user's name); no rate limit; one fixed path for all scripts, revoked by rotating the key.

Added `cluster-helper/src/telegramPublicApi.ts` (Fastify plugin on the public server) and its tests. The text is escaped with `escapeTelegramMarkdown`, because `sendTelegramMessage` has no plain-text mode. The route uses `logLevel: 'silent'`, because Fastify's request log contains `req.url`, which is the secret; a test checks that neither the path nor the text is logged. The Vault key must exist before the deploy, because the env var is required.

## 2026-11-12 14:15 UTC — Project created

The user asked for a public Telegram notification path for the `work-log` skill on the work laptop (dotfiles project `datadog/projects/2026-11-02-22-35-hermes-weekly-work-achievements/`). The client reads the secret path from the vault file `@senaev/work_stream/work_stream_workflow.md`, front matter `send-message-path`. Implementation has not started. Open: rate limit, one path or one path for each client.
