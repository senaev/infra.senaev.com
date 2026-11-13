# 2026-11-12 — Public Telegram notification path

Give my laptop scripts a public, secret-protected way to send Telegram messages with the senaev.com bot.

## Goal

The `work-log` opencode skill on my work laptop (dotfiles: `opencode-settings/skills/work-log/`) will run from launchd with no user present. When a source needs a new sign-in or the run fails, it must tell me. The laptop is not in the cluster and not on the tailnet, so it cannot call the internal `/telegram/send-message` route.

We want a public endpoint:

```
POST https://api.senaev.com/<secret path>
{ "text": "work-log: datadog-prod-org2 needs sign-in" }
```

It sends `text` to my direct chat with the senaev.com bot. Anyone who does not know the secret path gets 404.

Changed on 2026-11-13: the endpoint is a thin proxy to the whole Bot API of the senaev.com bot. The client builds the Telegram request (`POST https://api.senaev.com/telegram-bot-api/sendMessage` with `{ "chat_id": …, "text": … }`) and sends the secret in `Authorization: Bearer <secret>`; the endpoint only adds the bot token. The secret is not in the path, so it does not go to logs and traces.

## Context

- cluster-helper has two Fastify servers: internal (port 80) and public (port 3000, `api.senaev.com`). See the comment above `INTERNAL_PORT` in `cluster-helper/src/index.ts`.
- The internal route `POST /telegram/send-message` already sends a message with `TG_TOKEN_SENAEV_COM_BOT`.
- My chat ID is `TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID` (`cluster-helper/src/env.ts`).
- Secrets live in Vault (`senaev-com-kv`) and reach the pod through the External Secrets Operator.
- Client side: the secret is stored in the Obsidian vault, `@senaev/work_stream/work_stream_workflow.md`, front matter (the first plan used the key `send-message-path`).

## Plan

1. ✅ Read the secret `TELEGRAM_PUBLIC_API_SECRET` in `cluster-helper/src/env.ts`; Helm takes it from Vault (`external-secret.yaml`, `cluster-helper.yaml`).
2. ✅ Thin proxy `GET|POST /telegram-bot-api/:method` in `cluster-helper/src/telegramPublicApi.ts`:
   - `Authorization: Bearer <TELEGRAM_PUBLIC_API_SECRET>`, compared with `timingSafeEqual` in an `onRequest` hook, before the body is read; otherwise 401
   - forwards to `https://api.telegram.org/bot<TG_TOKEN_SENAEV_COM_BOT>/<method>` with the same query, raw body and content type (JSON, form, multipart up to 50 MB), and returns Telegram's status, content type and body unchanged
   - all methods and all chats are allowed (decision of 2026-11-13): the secret gives full control of the bot, including `setWebhook`
   - `method` must be letters only, otherwise 404, so the client cannot change the upstream path
   - logs only the method name and the status; the Fastify request log does not include headers
   - 502 when Telegram is unreachable
   - file downloads (`https://api.telegram.org/file/bot<token>/<path>`) are not proxied
3. ✅ Unit tests in `telegramPublicApi.test.ts`: missing or wrong secret → 401; bad method name → 404; JSON, multipart and GET with query are forwarded unchanged; Telegram errors are returned unchanged; unreachable Telegram → 502; the log has neither the secret, the bot token nor the body.
4. 📌 Add the Vault key `TELEGRAM_PUBLIC_API_SECRET` in `senaev-com-kv` before the merge (the value of the old key `TELEGRAM_PUBLIC_API_PATH` can be reused: it was never deployed), then delete `TELEGRAM_PUBLIC_API_PATH`. The variable is required, so cluster-helper does not start without it.
5. 📌 Put the same secret into the front matter of the vault file. The client also needs my chat ID (`TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID`) for `chat_id`.
6. ✅ No rate limit: the secret is enough (decision of 2026-11-13).
7. ✅ One secret for all scripts. To revoke, rotate the Vault key (decision of 2026-11-13).
8. ✅ The secret is in a header, not in the path (decision of 2026-11-13; see [`2026-11-13-13-16-remove-secrets-from-paths`](../2026-11-13-13-16-remove-secrets-from-paths/README.md)).

## Verification

1. After the deploy, from the laptop:
   ```
   curl -sS -X POST https://api.senaev.com/telegram-bot-api/sendMessage -H "authorization: Bearer <secret>" -H 'content-type: application/json' -d '{"chat_id":"<my chat ID>","text":"test from laptop"}'
   ```
   The answer is `{"ok":true,…}` and the message arrives in my bot chat. To send a file:
   ```
   curl -sS https://api.senaev.com/telegram-bot-api/sendDocument -H "authorization: Bearer <secret>" -F chat_id=<my chat ID> -F document=@note.md
   ```
2. `curl -sS -o /dev/null -w '%{http_code}' -X POST https://api.senaev.com/telegram-bot-api/getMe` (no header) gives `401`.
3. `bash scripts/smoke-test-websites.sh` still passes.
