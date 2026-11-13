# 2026-11-13 — Remove secrets from URL paths

Stop using secrets in URL paths, so that logs and traces cannot leak them.

## Goal

Some public routes are protected only by a secret in the URL path. A URL is written to many places that are not made for secrets:

- the Fastify request log (`incoming request` with `req.url`), which goes to Datadog and Loki;
- the Datadog APM traces (`http.url`, resource names): cluster-helper and vpn-subscription have `admission.datadoghq.com/enabled: "true"`, and dd-trace removes query strings, not path segments;
- proxy access logs, browser history, and shell history on the clients.

A secret must go in a header (`Authorization: Bearer …`) or in the body, as the Telegram webhook already does (`x-telegram-bot-api-secret-token`).

## Context

| Route | Service | Secret | Client | Can the client send a header? |
|---|---|---|---|---|
| `POST /alisa-webhook` (was `POST /${ALISA_WEBHOOK_SECRET}`) | cluster-helper (`cluster-helper/src/index.ts`) | none: body check of the skill ID and Vault `ALISA_ALLOWED_USER_IDS` | Yandex Dialogs webhook | ❌ only a "Webhook URL" field; `Authorization` only with account linking |
| `GET\|POST /telegram-public-bot-api/:method` | cluster-helper (`cluster-helper/src/telegramPublicApi.ts`) | header `Authorization: Bearer`, Vault `TELEGRAM_PUBLIC_API_SECRET` | my scripts (work-log on the laptop) | ✅ already a header |
| `GET\|POST /:secret` | vpn-subscription (`vpn-subscription/src/index.ts`) | Vault `VPN_SUBSCRIPTION_SECRET` | Happ and other VPN apps, browser (instructions page) | ❌ a subscription is one URL; the [Happ docs](https://www.happ.su/main/dev-docs/app-management) have no header or Basic auth |
| `POST /telegram-webhook` | cluster-helper | header `x-telegram-bot-api-secret-token` | Telegram | ✅ already a header |

- No Traefik access log is configured in `provisioning/` (no `accessLog`).

## Plan

1. ✅ Telegram public API: done before its first deploy, in PR #170 — `Authorization: Bearer <TELEGRAM_PUBLIC_API_SECRET>` on `/telegram-public-bot-api/:method`. The secret was never in a deployed path, so it needs no rotation.
2. Alisa: Yandex Dialogs cannot send a custom header ([publish settings](https://yandex.ru/dev/dialogs/alice/doc/ru/publish-settings), [request format](https://yandex.ru/dev/dialogs/alice/doc/ru/request)), so we check fields in the body.
   1. ✅ Add `POST /alisa-webhook`: accept only when `session.skill_id` is our skill and `session.user.user_id` is in the Vault allowlist `ALISA_ALLOWED_USER_IDS` (comma-separated); otherwise 401. The old `POST /${ALISA_WEBHOOK_SECRET}` route keeps working. Stop logging the user and application IDs of the body. PR #171.
   2. ✅ Add the Vault key `ALISA_ALLOWED_USER_IDS` before the merge: cluster-helper does not start without it.
   3. ✅ After the deploy, set the skill "Webhook URL" to `https://api.senaev.com/alisa-webhook` in the Yandex Dialogs console and check that Alisa answers.
   4. ✅ Remove the old route and the env variable `ALISA_WEBHOOK_SECRET` from the code and Helm (PR #174). No rotation needed: the old secret stops working.
   5. ✅ Delete the Vault key `ALISA_WEBHOOK_SECRET`.
3. ✅ vpn-subscription (PR #175): Happ cannot send a header, so the secret stays in the path, as with other VPN subscription providers. `vpn-subscription/src/requestLogging.ts` turns off the Fastify request logging (`LogController` with `disableRequestLogging`): all its request lines (incoming, completed, not found, errored) contain the URL. An error handler logs only the error of a failed request (5xx).
4. ✅ APM (PR #175): after step 2, vpn-subscription is the only service with a secret path. It gets `admission.datadoghq.com/enabled: "false"`: dd-trace writes the full path to `http.url`, and the traces of this small service have almost no value.
5. ✅ After each route is fixed, rotate its secret: the old value is already in the logs and traces. The Telegram public API and Alisa need no rotation (see steps 1 and 2.4). The user rotated `VPN_SUBSCRIPTION_SECRET` in Vault on 2026-11-13.
6. ✅ cluster-helper (PR #176): never log a whole request body (`AGENTS.md` rule). `/telegram/send-message` logs only `chatId` and the text length, `/qbittorrent/torrent-event` only `event` and `name`, and the Telegram webhook only the update ID and types (`describeTelegramUpdate`), after the secret check.

## Verification

1. Datadog Logs and Loki: search for each new secret value after the deploy — no results.
2. Datadog APM: the resource names and `http.url` of these routes have no secret.
3. Each client still works: a work-log notification arrives, Alisa answers, Happ updates the subscription.
