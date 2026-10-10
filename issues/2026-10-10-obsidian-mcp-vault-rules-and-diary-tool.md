# 2026-10-10 — Obsidian MCP: vault rules from AGENTS.md, diary tool moved into obsidian-sync

> This file is the working log for this task. All design decisions, implementation steps,
> commands run, outputs pasted, blockers hit, and the eventual completion state must be
> appended to this file as we go — so the whole session lives in one place and is
> searchable later.
>
> Format: append new dated sections under ## Findings as work proceeds. Don't rewrite
> earlier sections — annotate them.

## Goal

Follow-up to [`2026-10-09-obsidian-mcp-tools.md`](2026-10-09-obsidian-mcp-tools.md). The
vault's root `AGENTS.md` becomes the single source of vault workflow rules for ChatGPT, and
the diary command stops being special code in cluster-helper.

The improvements are done one by one, and each batch is deployed before the next starts.

## Batch 1 (this deploy)

1. **Vault rules at session start.** On every MCP `initialize`, cluster-helper reads the root
   `AGENTS.md` through the generic `obsidian-read` vault tool and returns it in the
   `instructions` field, after a short fixed header (the most important text must be in the
   first 512 characters, per the OpenAI docs). No timeout and no cache. If the read fails,
   `initialize` still succeeds and `instructions` is only the fallback sentence.
   Each `obsidian-*` tool description gets one fallback sentence: read `AGENTS.md` with
   `obsidian-read` if the vault rules are not in the context.
2. **`obsidian-search` description:** documents the maximum of 20 queries per call, and
   batching the lookups of people, places and concepts in one call before writing. No code
   change, no entity-resolution tool.
3. **Diary command moved into obsidian-sync.** `save_diary_text` becomes the vault tool
   `diary_append` (`POST /vault/diary_append`), exposed as `obsidian-diary_append` and
   forwarded like the other tools. The server still writes the timestamp line (Madrid time)
   and the ` ✍️` suffix to `@senaev/daily_note_draft.md`. Removed: `POST /daily-note-draft`,
   cluster-helper's `appendDailyNoteDraft`, the `saveDiaryText` handler. The draft content is
   not touched.
4. **Vault `AGENTS.md` Diary section** gets the `save_diary_text` rules (fix only typos and
   grammar, keep the language, one new record, no combining or summarising, write the text in
   the reply first, short confirmation). They replace "Don't change the wording or the
   grammar mistakes". The tool description keeps one short sentence of these rules and points
   to the Diary section.

## Later batches (not decided yet)

- Item 4: return a unified diff after writes instead of hashes.
- Item 5: `obsidian-read` returns exact Markdown with frontmatter.

## Findings

*(append results below)*

### 2026-10-10 — How often ChatGPT calls `initialize`

Two questions in one new chat, then two more new chats:

```
$ kubectl -n senaev-com logs deploy/cluster-helper -c cluster-helper --since=1h \
  | grep 'ChatGPT MCP message' \
  | jq -r '[(.time / 1000 | todate), .method, (.tool // "")] | @tsv'
2026-10-10T09:20:02Z	server/discover
2026-10-10T09:20:02Z	initialize
2026-10-10T09:20:02Z	initialize
2026-10-10T09:20:02Z	notifications/initialized
2026-10-10T09:20:03Z	tools/call	obsidian-list
2026-10-10T09:20:10Z	server/discover
2026-10-10T09:20:10Z	initialize
2026-10-10T09:20:10Z	notifications/initialized
2026-10-10T09:20:13Z	tools/call	obsidian-search
2026-10-10T09:20:46Z	server/discover
2026-10-10T09:20:46Z	initialize
2026-10-10T09:20:46Z	notifications/initialized
2026-10-10T09:20:46Z	tools/call	obsidian-list
2026-10-10T09:20:56Z	server/discover
2026-10-10T09:20:56Z	initialize
2026-10-10T09:20:56Z	notifications/initialized
2026-10-10T09:20:57Z	tools/call	obsidian-list
```

- ChatGPT calls `initialize` before every tool call, also inside one chat. So
  `instructions` is fetched fresh each time, and an `AGENTS.md` edit is used on the next
  call without a connector refresh.
- `tools/list` is not called: ChatGPT caches the tool list, so description changes need a
  connector refresh.
- `server/discover` gets "method not found"; ChatGPT continues normally. Left as is.
