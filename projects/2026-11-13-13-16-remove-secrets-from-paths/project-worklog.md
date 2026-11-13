# Project worklog

## 2026-11-13 16:20 UTC — vpn-subscription: keep the secret path, hide it from logs and APM

The Happ docs have no header or Basic auth for a subscription: it is one URL, as with other VPN subscription providers. The user chose to keep the secret in the path and stop writing it: a Fastify `req` serializer logs only the method, the route pattern and the client IP, and APM is turned off for the pod (`admission.datadoghq.com/enabled: "false"`). The real VPN keys (VLESS UUIDs) are in the response body, not in the URL, so the leak was only to our own Datadog and Loki. Rotation is a separate decision: one shared secret means every user adds the subscription again; per-user tokens or Happ `new-url` (needs a Provider ID) are the options.

## 2026-11-13 16:05 UTC — Alisa done

The user deleted the Vault key `ALISA_WEBHOOK_SECRET`. The Alisa part of the project is finished. Still open: vpn-subscription, APM, secret rotation, and the full-body logs in `cluster-helper/src/index.ts`.

## 2026-11-13 16:01 UTC — Old Alisa route removed and verified

PR #174 (`ded8e9dd`) deployed (run `43457251711`), with two healthy rollouts and no errors. A real Alisa command at 16:00:37 UTC came as `POST /alisa-webhook`, passed the check (200), was planned by OpenRouter as `add_shopping_items`, and ran. Left for Alisa: the user deletes the Vault key `ALISA_WEBHOOK_SECRET`.

## 2026-11-13 15:55 UTC — Alisa on the new path, old route removed

The user changed the skill Webhook URL to `https://api.senaev.com/alisa-webhook` and checked that Alisa works (commands at 15:47 UTC ran on the new code). A new PR removes the `/${ALISA_WEBHOOK_SECRET}` route, the env variable and its Helm and ExternalSecret mappings. The Vault key is deleted only after that deploy: a key that the ExternalSecret still lists but Vault does not have blocks the whole `senaev-com-kv-secrets` sync.

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
