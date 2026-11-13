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

## Context

- cluster-helper has two Fastify servers: internal (port 80) and public (port 3000, `api.senaev.com`). See the comment above `INTERNAL_PORT` in `cluster-helper/src/index.ts`.
- The internal route `POST /telegram/send-message` already sends a message with `TG_TOKEN_SENAEV_COM_BOT`.
- My chat ID is `TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID` (`cluster-helper/src/env.ts`).
- Secrets live in Vault (`senaev-com-kv`) and reach the pod through the External Secrets Operator.
- Client side: the secret path is stored in the Obsidian vault, `@senaev/work_stream/work_stream_workflow.md`, front matter key `send-message-path`.

## Plan

1. ✅ Read the secret path `TELEGRAM_PUBLIC_API_PATH` in `cluster-helper/src/env.ts`; Helm takes it from Vault (`external-secret.yaml`, `cluster-helper.yaml`).
2. ✅ Public route `POST /${TELEGRAM_PUBLIC_API_PATH}` in `cluster-helper/src/telegramPublicApi.ts`:
   - body `{ text: string }`, where `text` is Telegram Rich Markdown, 1–32000 characters (code points); otherwise 400. A rich message takes up to 32768 characters and 500 blocks; the rest is left for the prefix. More than 500 blocks gives 502
   - sent unchanged to `TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID`, so that a script can send a whole Markdown file. Only the owner knows the path, so Markdown injection is not a risk (decision of 2026-11-13)
   - prefix `📨` on its own paragraph, so that a heading on the first line stays a heading
   - the route has `logLevel: 'silent'`, because Fastify logs the URL (the secret) of each request; the route logs only the text length
   - answer 204; 502 when Telegram fails
3. ✅ Unit tests in `telegramPublicApi.test.ts`: wrong path → 404, bad body → 400, good body → unchanged Markdown with the prefix, maximum length counted in code points, Telegram failure → 502, the log has neither the path nor the text.
4. ✅ The Vault key `TELEGRAM_PUBLIC_API_PATH` is in `senaev-com-kv` (2026-11-13). The variable is required, so cluster-helper does not start without it.
5. 📌 Put the same secret into `send-message-path` in the vault file.
6. ✅ No rate limit: the secret path is enough (decision of 2026-11-13).
7. ✅ One fixed path for all scripts. To revoke, rotate the Vault key (decision of 2026-11-13).

## Verification

1. After the deploy, from the laptop:
   ```
   curl -sS -X POST "https://api.senaev.com/$(yq --front-matter=extract '.send-message-path' ~/projects/obsidian-vault/@senaev/work_stream/work_stream_workflow.md)" -H 'content-type: application/json' -d '{"text":"test from laptop"}'
   ```
   The message arrives in my bot chat. To send a Markdown file:
   ```
   jq -Rs '{text: .}' note.md | curl -sS -X POST "https://api.senaev.com/<secret path>" -H 'content-type: application/json' --data-binary @-
   ```
2. `curl -sS -o /dev/null -w '%{http_code}' -X POST https://api.senaev.com/wrong-path` gives `404`.
3. `bash scripts/smoke-test-websites.sh` still passes.
