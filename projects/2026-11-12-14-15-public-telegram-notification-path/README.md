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

1. 📌 Add the Vault key `PUBLIC_NOTIFICATION_PATH_SECRET` (a long random string) and read it in `cluster-helper/src/env.ts`.
2. 📌 Add a public route `POST /${PUBLIC_NOTIFICATION_PATH_SECRET}` to `publicServer`:
   - body `{ text: string }`, only plain text, at most 2000 characters; otherwise 400
   - send to `TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID` with no parse mode, so the text cannot inject Markdown
   - add a fixed prefix (for example `📨`) so that I can see that the message came from this path
   - log the call without the path and without the text
   - answer 204
3. 📌 Unit tests: a wrong path gives 404, a bad body gives 400, a good body calls `sendTelegramMessage` with the owner chat ID.
4. 📌 Put the same secret into `send-message-path` in the vault file.
5. ❓ Rate limit: do we need one (for example 30 messages per hour), in case the path leaks or a script loops?
6. ❓ Do we accept one fixed path for all my scripts, or one path for each client, so that I can revoke one client?

## Verification

1. After the deploy, from the laptop:
   ```
   curl -sS -X POST "https://api.senaev.com/$(yq --front-matter=extract '.send-message-path' ~/projects/obsidian-vault/@senaev/work_stream/work_stream_workflow.md)" -H 'content-type: application/json' -d '{"text":"test from laptop"}'
   ```
   The message arrives in my bot chat.
2. `curl -sS -o /dev/null -w '%{http_code}' -X POST https://api.senaev.com/wrong-path` gives `404`.
3. `bash scripts/smoke-test-websites.sh` still passes.
