# 2026-11-12 — Public Telegram notification path

Give my laptop scripts a public URL with a secret path that sends a Telegram message to me.

## Goal

The `work-log` opencode skill on my work laptop (dotfiles: `opencode-settings/skills/work-log/`) will run from launchd with no user present. When a source needs a new sign-in or the run fails, it must tell me. The laptop is not in the cluster and not on the tailnet, so it cannot call the internal `/telegram/send-message` route.

We want a public endpoint:

```
POST https://api.senaev.com/<secret path>
{ "text": "work-log: datadog-prod-org2 needs sign-in" }
```

It sends `text` to my direct chat with the senaev.com bot. Anyone who does not know the secret path gets 404.

Changed on 2026-11-13: the endpoint is a thin proxy to the whole Bot API of the senaev.com bot. The client builds the Telegram request (`POST https://api.senaev.com/<secret path>/sendMessage` with `{ "chat_id": …, "text": … }`), and the endpoint only adds the bot token.

## Context

- cluster-helper has two Fastify servers: internal (port 80) and public (port 3000, `api.senaev.com`). See the comment above `INTERNAL_PORT` in `cluster-helper/src/index.ts`.
- The internal route `POST /telegram/send-message` already sends a message with `TG_TOKEN_SENAEV_COM_BOT`.
- My chat ID is `TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID` (`cluster-helper/src/env.ts`).
- Secrets live in Vault (`senaev-com-kv`) and reach the pod through the External Secrets Operator.
- Client side: the secret path is stored in the Obsidian vault, `@senaev/work_stream/work_stream_workflow.md`, front matter key `send-message-path`.

## Plan

1. ✅ Read the secret path `TELEGRAM_PUBLIC_API_PATH` in `cluster-helper/src/env.ts`; Helm takes it from Vault (`external-secret.yaml`, `cluster-helper.yaml`).
2. ✅ Thin proxy `GET|POST /${TELEGRAM_PUBLIC_API_PATH}/:method` in `cluster-helper/src/telegramPublicApi.ts`:
   - forwards to `https://api.telegram.org/bot<TG_TOKEN_SENAEV_COM_BOT>/<method>` with the same query, raw body and content type (JSON, form, multipart up to 50 MB), and returns Telegram's status, content type and body unchanged
   - all methods and all chats are allowed (decision of 2026-11-13): the path gives full control of the bot, including `setWebhook`
   - `method` must be letters only, otherwise 404, so the client cannot change the upstream path
   - the route has `logLevel: 'silent'`, because Fastify logs the URL (the secret) of each request; the route logs only the method name and the status
   - 502 when Telegram is unreachable
   - file downloads (`https://api.telegram.org/file/bot<token>/<path>`) are not proxied
3. ✅ Unit tests in `telegramPublicApi.test.ts`: wrong path or bad method name → 404; JSON, multipart and GET with query are forwarded unchanged; Telegram errors are returned unchanged; unreachable Telegram → 502; the log has neither the path, the token nor the body.
4. ✅ The Vault key `TELEGRAM_PUBLIC_API_PATH` is in `senaev-com-kv` (2026-11-13). The variable is required, so cluster-helper does not start without it.
5. 📌 Put the same secret into `send-message-path` in the vault file. The client also needs my chat ID (`TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID`) for `chat_id`.
6. ✅ No rate limit: the secret path is enough (decision of 2026-11-13).
7. ✅ One fixed path for all scripts. To revoke, rotate the Vault key (decision of 2026-11-13).
8. 📌 Move the secret from the path to a header: [`2026-11-13-13-16-remove-secrets-from-paths`](../2026-11-13-13-16-remove-secrets-from-paths/README.md).

## Verification

1. After the deploy, from the laptop:
   ```
   curl -sS -X POST "https://api.senaev.com/$(yq --front-matter=extract '.send-message-path' ~/projects/obsidian-vault/@senaev/work_stream/work_stream_workflow.md)/sendMessage" -H 'content-type: application/json' -d '{"chat_id":"<my chat ID>","text":"test from laptop"}'
   ```
   The answer is `{"ok":true,…}` and the message arrives in my bot chat. To send a file:
   ```
   curl -sS "https://api.senaev.com/<secret path>/sendDocument" -F chat_id=<my chat ID> -F document=@note.md
   ```
2. `curl -sS -o /dev/null -w '%{http_code}' -X POST https://api.senaev.com/wrong-path/sendMessage` gives `404`.
3. `bash scripts/smoke-test-websites.sh` still passes.
