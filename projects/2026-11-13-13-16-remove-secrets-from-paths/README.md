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
| `POST /${ALISA_WEBHOOK_SECRET}` | cluster-helper (`cluster-helper/src/index.ts`) | Vault `ALISA_WEBHOOK_SECRET` | Yandex Dialogs webhook | ❌ only a "Webhook URL" field; `Authorization` only with account linking |
| `GET\|POST /telegram-public-bot-api/:method` | cluster-helper (`cluster-helper/src/telegramPublicApi.ts`) | header `Authorization: Bearer`, Vault `TELEGRAM_PUBLIC_API_SECRET` | my scripts (work-log on the laptop) | ✅ already a header |
| `GET\|POST /:secret` | vpn-subscription (`vpn-subscription/src/index.ts`) | Vault `VPN_SUBSCRIPTION_SECRET` | Happ and other VPN apps, browser (instructions page) | ❓ probably not: a subscription is one URL |
| `POST /telegram-webhook` | cluster-helper | header `x-telegram-bot-api-secret-token` | Telegram | ✅ already a header |

- No Traefik access log is configured in `provisioning/` (no `accessLog`).

## Plan

1. ✅ Telegram public API: done before its first deploy, in PR #170 — `Authorization: Bearer <TELEGRAM_PUBLIC_API_SECRET>` on `/telegram-public-bot-api/:method`. The secret was never in a deployed path, so it needs no rotation.
2. Alisa: Yandex Dialogs cannot send a custom header ([publish settings](https://yandex.ru/dev/dialogs/alice/doc/ru/publish-settings), [request format](https://yandex.ru/dev/dialogs/alice/doc/ru/request)), so we check fields in the body.
   1. 📌 Add `POST /alisa-webhook`: accept only when `session.skill_id` is our skill and `session.user.user_id` is in the Vault allowlist `ALISA_ALLOWED_USER_IDS` (comma-separated); otherwise 401. The old `POST /${ALISA_WEBHOOK_SECRET}` route keeps working. Stop logging the user and application IDs of the body.
   2. ✅ Add the Vault key `ALISA_ALLOWED_USER_IDS` before the merge: cluster-helper does not start without it.
   3. 📌 After the deploy, set the skill "Webhook URL" to `https://api.senaev.com/alisa-webhook` in the Yandex Dialogs console and check that Alisa answers.
   4. 📌 Then remove the old route and the Vault key `ALISA_WEBHOOK_SECRET`. No rotation needed: the old secret stops working.
3. ❓ vpn-subscription: can Happ send a header for a subscription? If no, keep the secret path, add `logLevel: 'silent'` (or a request serializer that hides the path), and hide the path in APM (step 4).
4. ❓ APM: how to hide the paths that stay secret — `DD_TRACE_RESOURCE_RENAMING_ENABLED`, a dd-trace `blocklist`, or no tracing for these routes? Check which of the routes are in the traces now.
5. 📌 After each route is fixed, rotate its secret: the old value is already in the logs and traces. For Alisa, change the webhook URL in the Yandex Dialogs console at the same time.

## Verification

1. Datadog Logs and Loki: search for each new secret value after the deploy — no results.
2. Datadog APM: the resource names and `http.url` of these routes have no secret.
3. Each client still works: a work-log notification arrives, Alisa answers, Happ updates the subscription.
