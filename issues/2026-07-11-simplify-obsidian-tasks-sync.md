# 2026-07-11 — Simplify Obsidian tasks sync architecture

> This file is the working log for this task. All design decisions, implementation steps,
> commands run, outputs pasted, blockers hit, and the eventual completion state must be
> appended to this file as we go — so the whole session lives in one place and is
> searchable later.
>
> Format: append new dated sections under ## Findings as work proceeds. Don't rewrite
> earlier sections — annotate them.

## Goal

Remove Supabase as the intermediary for the Obsidian task-sync flow. Previously,
webhook-endpoint inserted rows into a Supabase `public.tasks` table, and the Obsidian
plugin (`senaev-personal-tools`) polled + subscribed to that table via Realtime and wrote
the results into the vault. This adds a direct HTTP write path instead: webhook-endpoint
calls a new HTTP API on the existing `obsidian-sync` container, which writes straight to
the vault file. The plugin's "receive tasks" feature is removed entirely.

## Architecture

**Before:**
```
Telegram (Obsidian Tasks / Tricky Dad chats) ─┐
Alisa voice skill ─────────────────────────────┼─▶ webhook-endpoint
                                                     │ insert row
                                                     ▼
                                          Supabase `public.tasks`
                                                     │ poll on startup + realtime subscribe
                                                     ▼
                                    Obsidian plugin (TasksSyncService)
                                                     │ vault.modify / vault.create
                                                     ▼
                              @senaev/tasks/tasks_streaming.md (vault file)
```

**After:**
```
Telegram (Obsidian Tasks / Tricky Dad chats) ─┐
Alisa voice skill ─────────────────────────────┼─▶ webhook-endpoint
                                                     │ POST /tasks {title, due_date}
                                                     ▼
                                    obsidian-sync (http://obsidian-sync:8080)
                                                     │ fs write, prepend line
                                                     ▼
                              @senaev/tasks/tasks_streaming.md (vault file)
```

Both `webhook-endpoint` and `obsidian-sync` already run in the same namespace/cluster
(`vps: hetzner`), so plain ClusterIP DNS (`http://obsidian-sync:8080`) is reachable —
same pattern already used by `nextjs-app`'s `NOTES_REMOTE_URL` env var. No Ingress exists
for `obsidian-sync`, so the new endpoint is not internet-reachable, matching the existing
(unauthenticated) GET `?note=`/`?file=` API's security model.

## Implementation plan

- [x] `obsidian-sync/server.js`: add `POST /tasks` route, writing directly to
  `${OBSIDIAN_VAULT_PATH}/@senaev/tasks/tasks_streaming.md`
- [x] `webhook-endpoint`: add `OBSIDIAN_SYNC_URL` env var + Helm wiring
- [x] `webhook-endpoint`: add `addObsidianTask()` client helper
- [x] `webhook-endpoint`: replace both `insertSupabaseRows("tasks", ...)` call sites in
  `processAlisaCommand.ts` with `addObsidianTask()`
- [x] `senaev-personal-tools`: delete `src/tasks-sync/` entirely, drop from `main.ts`,
  remove `@supabase/supabase-js` dependency

## Findings

### 2026-07-11 — obsidian-sync: added POST /tasks

Added to `obsidian-sync/server.js`, self-contained (no new npm dependencies — still just
`http`/`fs`/`path`/`url` built-ins, matching the container's existing style). Request
body: `{ "title": string, "due_date"?: string | null }`. Formats the same
Obsidian-Tasks-compatible checkbox line the plugin used to produce
(`- [ ] {title} 📅 {due_date}`) and prepends it to the tasks file, creating the file/
folders on first write. Validates `title` (required, non-empty after trim) and `due_date`
(must be `string | null | undefined`). Existing GET `?note=`/`?file=` routes are
untouched — the pathname is still never checked for GET requests (pre-existing behavior,
not something this change alters).

Smoke-tested locally by running `node server.js` with `OBSIDIAN_VAULT_PATH` pointed at a
throwaway temp directory and hitting it with `curl`:
- title-only and title+due_date creation, prepend ordering (newest task on top,
  blank-line separated)
- validation errors: missing title, empty/whitespace title, non-string `due_date`,
  malformed JSON body
- fresh-file creation when the tasks file/folder doesn't exist yet
- regression check: existing `?note=`/`?file=` GET routes still work unchanged

Bug found + fixed during smoke testing: the oversized-payload rejection path called
`req.destroy()` before writing the error response. Since the response socket is shared
with the request socket, this silently dropped the connection instead of returning a
proper `400` — curl only ever saw the interim `100 Continue`. Fixed by draining the
stream (bounding memory by discarding already-buffered data past the limit, without
tearing down the socket) and only responding once `'end'` fires.

### 2026-07-11 — webhook-endpoint: switched task writes to obsidian-sync

Added `src/obsidianSyncApi.ts` (`addObsidianTask({ title, due_date })`, mirrors the
existing `insertSupabaseRows` fetch/error-handling style) and `OBSIDIAN_SYNC_URL` env var
(hardcoded to `http://obsidian-sync:8080` in the Helm chart, no new secret needed).

Both call sites in `processAlisaCommand.ts` (`processShoppingOrTaskCommand` for the Alisa
skill / Tricky Dad chat, and `processObsidianTaskCommand` for the Obsidian Tasks chat)
now call `addObsidianTask()` instead of `insertSupabaseRows("tasks", ...)`. The grocery
list path (`addItemsToSupabaseGroceryList` → Supabase `notes_items`) is untouched, so
`SUPABASE_PROJECT_URL`/`SUPABASE_PUBLISHABLE_KEY` are still required env vars.

While doing this, noticed `HandleTrickyDadRequestResult.supabaseResponseTime` /
`supabaseErrorString` (and the corresponding Telegram report labels "Время Supabase" /
"Supabase Error" in `sendTrickyDadReport.ts`) would become misleading, since the task
write path no longer touches Supabase at all while the grocery path still does. Renamed
to destination-agnostic `writeResponseTime`/`writeErrorString` and updated the report
labels to generic "Время записи" / "Write Error".

`npm run typecheck` passes.

### 2026-07-11 — senaev-personal-tools: removed tasks-sync feature

Deleted `src/tasks-sync/` (`TasksSyncService.ts`, `constants.ts`, `types.ts`,
`schema.sql`) and its wiring in `main.ts` (field, `initialize()` call in `onload`,
`destroy()` call in `onunload` — `onunload` itself was removed since nothing else used
it). Ran `npm uninstall @supabase/supabase-js` since nothing in `src/` references
Supabase anymore. `npm run build` passes; confirmed the bundled
`.obsidian/plugins/senaev-personal-tools/main.js` no longer contains any Supabase
references.

Pre-existing, unrelated issues noticed while running `npm run lint` in that repo (not
touched by this change): 3 lint errors in `src/settings.ts` (empty interface, manual HTML
heading, non-sentence-case UI text) and a missing top-level `manifest.json` (the
`eslint-plugin-obsidianmd` plugin warns about this on every run). Flagging here rather
than fixing, since they predate this task and fixing `manifest.json` requires plugin
id/version decisions outside this task's scope.

## Not done / follow-ups

- Supabase `public.tasks` table itself was not dropped — nothing writes or reads it
  anymore after this change, but the table and its existing rows still exist in the DB.
  Left alone since dropping data wasn't requested.
- No auth added to `POST /tasks` — intentionally matches the existing GET API's security
  model (ClusterIP-only, no Ingress).
- No locking against concurrent writers on the tasks file — same read-then-write race
  that existed in the original plugin's `prependTaskToFile`; not a regression, just
  carried over as-is.
- Nothing committed or pushed in either repo — pending explicit go-ahead (repo git
  discipline: never stage/commit/push without an explicit request).
