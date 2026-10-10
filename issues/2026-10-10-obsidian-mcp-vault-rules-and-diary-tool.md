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

## Batch 2

1. `obsidian-patch` returns `diff`: a unified diff of the whole file before and after the
   change, frontmatter included, 3 lines of context, made with the `diff` package (jsdiff,
   `createTwoFilesPatch`). It replaces `previousHash` and `hash`; `changed` stays.
2. `obsidian-create` returns `diff` (every line added) instead of `hash`.
3. `obsidian-diary_append` returns the same kind of `diff`.
4. Reads keep `hash`, and `obsidian-patch` keeps requiring `expectedHash`.
5. A diff longer than 20,000 characters is cut, with `diffTruncated: true`.
6. Descriptions: the write tools tell ChatGPT to show the returned diff in a ```diff block;
   `obsidian-patch` says to read the note again before the next edit of it.
7. A too-large `limit` or `offset` (list, search, links) is reduced to the maximum instead
   of failing, and the result reports the `limit` that was used. Wrong types and unknown
   fields stay errors.

## Later batches

- Item 5 (`obsidian-read` returns exact Markdown with frontmatter): skipped by decision on
  2026-10-10. `content` stays the body; frontmatter stays parsed.

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

### 2026-10-10 — Batch 1 implemented

- cluster-helper: `chatGptMcp/vaultInstructions.ts` builds `instructions` from
  `obsidian-read` of `AGENTS.md` (header + full text, or the fallback sentence).
  `save_diary_text`, its rules and `appendDailyNoteDraft` are removed; `obsidian-diary_append`
  is a normal entry in `obsidianTools.ts`. Every tool description ends with the AGENTS.md
  fallback sentence. Two duplicated vault rules were removed from the descriptions (the
  archive-heading rule in `obsidian-patch`, "link only to notes that exist" in
  `obsidian-create`): both are in `AGENTS.md`.
- obsidian-sync: `vault-tools/tools/diaryAppendTool.ts` (draft path in `vaultToolsConfig.ts`,
  same access rules as the other tools, symlinks refused). Removed
  `registerDailyNoteDraftRoutes.ts`, `appendDailyNoteDraftRecord.ts` and the draft constants
  in `vaultPaths.ts`. `formatDailyNoteDraftRecord.ts` is reused, so the record format is
  unchanged.
- Vault `AGENTS.md`, "Diary staging approach": the `save_diary_text` rules replace "Don't
  change the wording or the grammar mistakes", and the section names `obsidian-diary_append`.
  The draft file was not touched.
- Tests (isolated temporary vaults): instructions with the live file and the two fallback
  cases; tool list, names and the fallback sentence in every description; forwarding of
  `obsidian-diary_append` to `diary_append`; `save_diary_text` now rejected; diary append
  keeps existing records, creates a missing draft, rejects blank text and unknown arguments,
  refuses a symlinked folder. `npm run simple-checks`: all pass.

After deploy: refresh the ChatGPT connector, because ChatGPT caches the tool list.

### 2026-10-10 — Batch 1 deploy checks

```
$ gh run list ... ad735e4
obsidian-sync: completed success
cluster-helper: completed success

$ kubectl -n senaev-com get pods -l 'app in (cluster-helper,obsidian-sync)' ...
NAME                             STARTED                RESTARTS
cluster-helper-5c6dbc75b-2vl72   2026-10-10T09:32:17Z   0
obsidian-sync-fb87fd4b-6vzhs     2026-10-10T09:32:38Z   0

$ kubectl ... exec deploy/obsidian-sync -- grep -n 'obsidian-diary_append\|Rules for a diary record' /vault/AGENTS.md
43:When recording diary entries, use the staging file approach: ... use the `obsidian-diary_append` tool ...
45:Rules for a diary record:

# POST /daily-note-draft with a valid token
404

# POST /vault/read {"paths":["AGENTS.md"]}
ok 11450 "# AGENTS"
```

Both images are deployed, the vault `AGENTS.md` change reached production, the old route is
gone, and the read that builds the instructions works.

ChatGPT test (new chat, connector refreshed), as reported by ChatGPT:

```
1  FAIL  Server instructions absent from initial context.
2  FAIL  Tools required discovery; unavailable for the no-tool check.
3  FAIL  Description required discovery. Afterwards verified: maximum 20 queries; look up people, places and concepts together before writing.
4  FAIL  Rules required reading AGENTS.md. Afterwards verified: before 1900 means unknown year; preserve month/day and never calculate age.
5  FAIL  Both notes confirmed, but required two calls.
6  PASS  Exact corrected Spanish shown before saving; short confirmation included senaev/daily_note_draft.md.
7  PASS  Timestamp 2026-10-10 11-37-03, blank line, exact record and  ✍️.
8  PASS  Expected invalid_arguments error.

Unexpected results:
- Server instructions and embedded AGENTS.md were not supplied initially. Reading AGENTS.md confirmed its final heading is When in doubt.
- Discovery exposed all seven expected Obsidian tools, with no Obsidian save_diary_text.
- My first search used limit: 100; the server rejected it because the maximum is 50. The description does not state that maximum. Retrying with 50 succeeded.
```

- Steps 1–4 fail for one reason: this ChatGPT loads connector tools on demand ("tool
  discovery"). Before discovery the model sees neither the tool descriptions nor the server
  `instructions`, so a no-tool question cannot pass. Steps 1–4 tested the wrong thing; this
  is not a server bug.
- Whether `instructions` reach the model after discovery is still not proven: ChatGPT read
  `AGENTS.md` itself, which is what the fallback sentence asks for. So the rules were applied
  either way.
- Step 5: the extra call was a rejected `limit: 100` (schema maximum 50). The schema has
  `maximum: 50`, but ChatGPT did not respect it.
- Steps 6–8: the diary workflow works end to end with the new tool and the `AGENTS.md`
  rules: typos fixed, Spanish kept, text shown before saving, short confirmation, server
  timestamp and ` ✍️`.

### 2026-10-10 — Server logs of the ChatGPT test

cluster-helper (`ChatGPT MCP message`, last column is `isToolError`), first run:

```
2026-10-10T09:33:45Z	server/discover
2026-10-10T09:33:45Z	initialize
2026-10-10T09:33:45Z	initialize
2026-10-10T09:33:45Z	notifications/initialized
2026-10-10T09:33:46Z	tools/list
2026-10-10T09:36:47Z	server/discover
2026-10-10T09:36:47Z	initialize
2026-10-10T09:36:47Z	notifications/initialized
2026-10-10T09:36:47Z	tools/call	obsidian-read
2026-10-10T09:36:50Z	...	tools/call	obsidian-search	true
2026-10-10T09:36:55Z	...	tools/call	obsidian-search
2026-10-10T09:37:03Z	...	tools/call	obsidian-diary_append
2026-10-10T09:37:07Z	...	tools/call	obsidian-read
2026-10-10T09:37:13Z	...	tools/call	obsidian-diary_append	true
2026-10-10T09:37:31Z	... initialize, initialize, notifications/initialized, tools/list
2026-10-10T09:38:00Z – 09:38:25Z	the same sequence a second time
```

obsidian-sync (`Vault tool call`: tool, code, durationMs):

```
2026-10-10T09:36:47Z	read	ok	2
2026-10-10T09:36:47Z	read	ok	7
2026-10-10T09:36:50Z	read	ok	2
2026-10-10T09:36:50Z	search	invalid_arguments
2026-10-10T09:36:55Z	read	ok	8
2026-10-10T09:36:55Z	search	ok	328
2026-10-10T09:37:03Z	read	ok	1
2026-10-10T09:37:03Z	diary_append	ok	44
2026-10-10T09:37:07Z	read	ok	2
2026-10-10T09:37:07Z	read	ok	1
2026-10-10T09:37:13Z	read	ok	3
2026-10-10T09:37:13Z	diary_append	invalid_arguments
...
2026-10-10T09:38:16Z	diary_append	ok	6
2026-10-10T09:38:25Z	diary_append	invalid_arguments
```

Draft tail: two identical test records, `2026-10-10 11-37-03` and `2026-10-10 11-38-16`
("Hoy fuimos al parque con [[@luli]] y [[@fedya]], hizo mucho sol y Fedya se rió mucho. ✍️").
The earlier records are unchanged.

- Every `tools/call` has its own `initialize`, and obsidian-sync logs a `read` (the
  `AGENTS.md` fetch, 1–9 ms) right before each tool. The server sends `instructions` every
  time, and the cost is negligible.
- Correction to the earlier finding: ChatGPT does call `tools/list`, when a chat starts using
  the connector (09:33:46, 09:37:31).
- The first tool call of each run is `obsidian-read` (the second `read` at 09:36:47, 7 ms):
  ChatGPT read `AGENTS.md` itself. So the model did not have the instructions in its context,
  or did not trust them, and the fallback sentence did the work. The rules are applied either
  way; the cost is one extra 11 KB read per chat.
- Both runs show the same `search` `invalid_arguments` (the `limit: 100` from the report)
  before a successful search, which supports clamping too-large limits.
- ChatGPT ran the prompt twice (09:36 and 09:38), so there are two test records to remove.

### 2026-10-10 — Batch 2 implemented

- obsidian-sync: `diff` 9.0.0 (ships CommonJS with types; 0 vulnerabilities).
  `vault-tools/markdown/createNoteDiff.ts` makes the diff (jsdiff's leading "=" banner line
  is removed, 20,000-character cap). `patch`, `create` and `diary_append` return
  `diff`/`diffTruncated`; `patch` and `create` no longer return any hash. A patch that
  changes nothing writes nothing and returns `changed: false` with an empty diff.
  `diary_append` reads the draft before appending, so its diff shows only the new record.
- `optionalCappedInteger` in `toolArguments.ts`: `limit`/`offset` of list, search and links
  are reduced to the maximum; non-integers, `0` and negative values are still errors. The
  three tools now return the `limit` they used.
- cluster-helper descriptions: create and patch say to show the diff in a ```diff block;
  patch says to read again before the next edit; the limit fields say what a larger value is
  reduced to. `obsidian-diary_append` only says that it returns the diff: the `AGENTS.md`
  diary rule "reply only with a short confirmation, do not repeat the text" decides the
  reply, so the description does not ask ChatGPT to show that diff.
- Tests: diff format, context size and truncation; patch diff covers frontmatter and keeps
  an unchanged comment as context; no hash fields in the results; a no-op patch; create diff;
  diary diff adds only the new record; search `limit: 100` gives 50 with `nextOffset: 50`,
  while `0` and `"100"` still fail. `npm run simple-checks`: all pass.

### 2026-10-10 — Batch 2 verified

The owner confirmed in ChatGPT that batch 2 works: writes return a diff, and diary records
work as before (the diff is in the tool result; the `AGENTS.md` rule keeps the reply short).

## Resolution

Done. The vault `AGENTS.md` is the single source of vault rules: it is sent as MCP
`instructions` on every call, and every tool description falls back to reading it. The diary
command is the vault tool `obsidian-diary_append` in obsidian-sync, and cluster-helper only
forwards it. Writes return a unified diff instead of hashes, and too-large paging limits are
reduced to the maximum. Item 5 was skipped.
