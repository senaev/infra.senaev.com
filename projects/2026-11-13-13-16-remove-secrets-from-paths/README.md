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
| `POST /${ALISA_WEBHOOK_SECRET}` | cluster-helper (`cluster-helper/src/index.ts`) | Vault `ALISA_WEBHOOK_SECRET` | Yandex Dialogs webhook | ❓ |
| `GET\|POST /${TELEGRAM_PUBLIC_API_PATH}/:method` | cluster-helper (`cluster-helper/src/telegramPublicApi.ts`) | Vault `TELEGRAM_PUBLIC_API_PATH` | my scripts (work-log on the laptop) | yes |
| `GET\|POST /:secret` | vpn-subscription (`vpn-subscription/src/index.ts`) | Vault `VPN_SUBSCRIPTION_SECRET` | Happ and other VPN apps, browser (instructions page) | ❓ probably not: a subscription is one URL |
| `POST /telegram-webhook` | cluster-helper | header `x-telegram-bot-api-secret-token` | Telegram | ✅ already a header |

- The Telegram public API route sets `logLevel: 'silent'`, so the Fastify request log does not have its URL. The APM traces still have it.
- No Traefik access log is configured in `provisioning/` (no `accessLog`).

## Plan

1. 📌 Telegram public API: take the secret from `Authorization: Bearer <secret>`, compared with `timingSafeEqual` as in `cluster-helper/src/llm/llmEndpoint.ts`. Route `/telegram-api/:method`. Rename the Vault key to `TELEGRAM_PUBLIC_API_TOKEN`, make a new value, and update `send-message-path` in the vault file.
2. ❓ Alisa: does Yandex Dialogs send a header that we can check, or a field in the body (`session.skill_id`, `session.user.user_id`)? If yes, move the route to a fixed path and check that value. If no, keep the secret path, add `logLevel: 'silent'`, and hide the path in APM (step 4).
3. ❓ vpn-subscription: can Happ send a header for a subscription? If no, keep the secret path, add `logLevel: 'silent'` (or a request serializer that hides the path), and hide the path in APM (step 4).
4. ❓ APM: how to hide the paths that stay secret — `DD_TRACE_RESOURCE_RENAMING_ENABLED`, a dd-trace `blocklist`, or no tracing for these routes? Check which of the routes are in the traces now.
5. 📌 After each route is fixed, rotate its secret: the old value is already in the logs and traces. For Alisa, change the webhook URL in the Yandex Dialogs console at the same time.

## Verification

1. Datadog Logs and Loki: search for each new secret value after the deploy — no results.
2. Datadog APM: the resource names and `http.url` of these routes have no secret.
3. Each client still works: a work-log notification arrives, Alisa answers, Happ updates the subscription.
