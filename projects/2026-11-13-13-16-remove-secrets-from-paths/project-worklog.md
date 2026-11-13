# Project worklog

## 2026-11-13 13:30 UTC — Telegram public API done

The user moved the Telegram public API to a bearer header in its own PR (#170), before its first deploy. Left: Alisa, vpn-subscription, APM.

## 2026-11-13 13:16 UTC — Project created

While building the Telegram public API (`projects/2026-11-12-14-15-public-telegram-notification-path`), we found that Fastify logs `req.url`, so secret paths go to the logs. The user chose to move secrets out of paths in a separate project, instead of only silencing the Alisa route. Found three routes: Alisa, Telegram public API, vpn-subscription. cluster-helper and vpn-subscription have APM injection, so the paths can also be in traces. Not started.
