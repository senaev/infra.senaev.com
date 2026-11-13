# Project worklog

## 2026-11-13 15:25 UTC — Log only used fields, never a whole body

The user decided: never log a whole request body or other external JSON, only the fields that the code uses. The Alisa handler now logs only `{ command }`; the rule is in the repository `AGENTS.md`. Three other full-body logs remain in `cluster-helper/src/index.ts` (`/telegram/send-message`, `/qbittorrent/torrent-event`, the Telegram webhook update); the user has not yet chosen whether to fix them in #171 or in a separate PR.

## 2026-11-13 15:10 UTC — Alisa PR #171 opened

PR https://github.com/senaev/infra.senaev.com/pull/171 adds `POST /alisa-webhook` with the skill and user check; the old secret path still works. The user added the Vault key `ALISA_ALLOWED_USER_IDS` (`session.user.user_id`, not the legacy `session.user_id`, which is per app instance). All pre-push checks pass. Next: merge, deploy, change the Webhook URL in the Yandex Dialogs console, then remove the old route.

## 2026-11-13 14:30 UTC — Alisa: fixed path with a body check

Yandex Dialogs has only a "Webhook URL" field: no custom headers and no request signature. It sends `Authorization: Bearer` only with account linking (a user OAuth token from our own OAuth server). The user chose a fixed path `/alisa-webhook` that accepts a request only when `session.skill_id` is our skill and `session.user.user_id` is in the Vault allowlist `ALISA_ALLOWED_USER_IDS`. The old secret path stays until the skill URL is changed. Separate PR.

All 28 Alisa requests in the last 30 days have the same skill and the same user, and all of them have `session.user`:

```
skill_id: e456585c-55dc-435e-9294-5312dc94b497
user:
    user_id: <64 hex characters>
```

`handleAlisaRequest` logs the full body, so the user ID is in the logs since 2026-11-01. It cannot be rotated (it is fixed for the user and skill pair), so the log must stop writing it.

## 2026-11-13 13:30 UTC — Telegram public API done

The user moved the Telegram public API to a bearer header in its own PR (#170), before its first deploy. Left: Alisa, vpn-subscription, APM.

## 2026-11-13 13:16 UTC — Project created

While building the Telegram public API (`projects/2026-11-12-14-15-public-telegram-notification-path`), we found that Fastify logs `req.url`, so secret paths go to the logs. The user chose to move secrets out of paths in a separate project, instead of only silencing the Alisa route. Found three routes: Alisa, Telegram public API, vpn-subscription. cluster-helper and vpn-subscription have APM injection, so the paths can also be in traces. Not started.
