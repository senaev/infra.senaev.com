# 2026-10-16 — Obsidian task manager for MCP

- [x] Create and list Obsidian tasks through MCP

> Moved from the vault (`tasks/2026-10-16-16-48-obsidian-task-manager-for-mcp.md`) on 2026-10-17.

## Goal

Add task creation and listing to the Obsidian MCP service, using the same Markdown task format and supported fields as the Obsidian Tasks plugin. The service must work independently of desktop and mobile client plugins.

Support finding, reading and creating tasks with their description, due date, recurrence and other task metadata. Listing results must include the containing file name/path; creation must accept a destination file and default to `@senaev/tasks/tasks_streaming.md`, following the vault's task-creation rules.

Provide two initial listing modes:

1. **All tasks:** a paginated list of every task across the whole vault, including completed tasks, without filters.
2. **Today's tasks:** use the daily note's actual filtering and sorting algorithm, including exclusion of completed tasks and tasks due after today. (Correction 2026-10-17: the real filter keeps tasks completed or cancelled *today*; see Findings.) Inspect the existing implementation rather than infer its behaviour from these examples.

Implement all task parsing, field handling and task creation/serialization logic in code, not in agent instructions.

Combinable filters for date ranges, completion history and folders are future scope—for example, tasks for November 2028 or tasks completed during 2025. (Changed 2026-10-17: due-date, closed-date, status, text and folder filters are in scope; see the Plan.)

This task is currently at the documentation stage. No branch has been created or implementation started; do not start implementation yet. (2026-10-17: implementation started on `main`, see Findings.)

## Plan

Agreed on 2026-10-17 (see Findings for the reasons). Step 1 of the first draft — inspection — is done.

### Task JSON

```jsonc
{
  "path": "work/DataDog/DataDog.md",  // read-only
  "line": 12,                         // read-only, 1-based
  "hash": "…",                        // read-only, hash of the whole file
  "raw": "- [ ] Reimburse mobile phone ⏫ 🔁 every month 📅 2026-11-01", // read-only
  "status": "open",                   // open | done | cancelled
  "description": "Reimburse mobile phone",
  "source": null,                     // "Agent" ⇔ "🌱 Agent" at the end of the description
  "priority": "high",                 // lowest ⏬ | low 🔽 | normal (no emoji) | medium 🔼 | high ⏫ | highest 🔺
  "dueDate": "2026-11-01",            // 📅, YYYY-MM-DD or null
  "closedDate": null,                 // ✅ when done, ❌ when cancelled
  "recurrence": "every month"         // 🔁, verbatim, incl. "when done"
}
```

Serialization order: `- [s] description 🌱 source <priority> 🔁 recurrence 📅 due ✅/❌ closed`.

### Steps

1. **senaev-utils, `obsidianTasks/`** (pure code, no file access):
   - `parseTaskLine` / `serializeTask`: emoji format only; fields parsed from the end of the line; invalid dates are errors.
   - Editable = top-level `- [?] ` line and `serializeTask(parseTaskLine(line)) === line`.
   - Recurrence: validate with `rrule` (`RRule.fromText` after removing ` when done`); `dueDate` is required. Next occurrence as in Tasks: old due + interval, or completion date + interval with `when done`.
   - Daily filter (moved from the vault plugin, plain ISO dates) and sort: priority → path → line.
   - Exclusions: dot-folders and root folders `_templates`, `plugins/senaev-personal-tools`.
   - Publish; then the vault project `obsidian-vault/projects/2026-10-17-09-04-daily-tasks-from-senaev-utils.md`.
2. **obsidian-sync, task scanner:** walk the vault, use remark positions to skip frontmatter, code, HTML; find task lines with the Tasks list-item regex; collect `path`, `line`, `hash`.
3. **Move the text matcher** out of `searchCommand.ts` into a shared module (`queries[]`, `match`, `wholeWord`).
4. **`obsidian-tasks_list`** — filters (all optional, AND): `dailyNote` (`today` or `YYYY-MM-DD`; "today" = Europe/Madrid), `status[]`, `queries`/`match`/`wholeWord` on the description, `dueFrom`/`dueTo`, `closedFrom`/`closedTo`, `priority[]`, `folder`/`glob`, `offset`/`limit`.
5. **`obsidian-tasks_create`** — `path`, `expectedHash`, `afterLine` (0 = top of file), `blankLinesBefore`/`blankLinesAfter` (0–10), task fields (`source` default `Agent`, `status` always `open`). Errors: note missing, line missing, hash mismatch, position inside frontmatter / code / table / HTML.
6. **`obsidian-tasks_update`** — `path`, `line`, `expectedHash`, `changes` (partial; `null` clears). Done/cancelled without `closedDate` → today; reopen → clear `closedDate`. Completing a recurring task adds the next occurrence on the line below. Errors: not a task, not editable (returns expected and actual line), hash mismatch, recurrence without due date.
7. **Write response** (create and update): `{ task, nextOccurrence | null, path, hash, diff }`.
8. **Shared writer:** `POST /tasks` uses the same insert code under `withFileMutation` (`afterLine: 0`, `blankLinesAfter: 1`).
9. **`obsidian-read`:** add `lineNumbers: true`.
10. **Tool descriptions:** the `today` value; the vault rule for `tasks_streaming.md` (`afterLine: 0`, `blankLinesAfter: 1`, `🌱 Agent`); do not edit tasks with `obsidian-patch`.
11. **Vault clean-up** (last): list tasks that fail the round-trip and fix the fixable ones by hand.

## Verification

- Unit tests in senaev-utils: every example in "Examples from the vault" parses to the expected JSON and serializes back to the same line; ➕ and 🏁 inside links stay in the description; invalid date `2027-03-00` is an error.
- Daily filter: the same fixtures give the same result in senaev-utils and in the old plugin code, before the plugin is switched.
- Run the scanner on a copy of the vault: about 10,000 tasks; report how many fail the round-trip (input for step 11).
- Tool tests with `createTestVault`: list filters and paging, create/update errors, recurring completion, hash conflict, the `POST /tasks` regression.
- After deploy, in ChatGPT: list today's tasks and compare with today's daily note in Obsidian; create a task in `tasks_streaming.md`; complete a recurring task and check the new line in Obsidian; check the `🤖 ChatGPT MCP message` logs.

## Examples from the vault

These are existing task lines, copied verbatim. The source file is task-location metadata, not part of the task description. Examples are fenced so they remain documentation rather than new live tasks.

### Basic tasks, due dates and lifecycle dates

Source: `@senaev/tasks/tasks_streaming.md`.

```markdown
- [ ] Поставить новое стекло на телефон

- [ ] починить дверцу в шкафу на кухне 🌱 Alisa

- [ ] Сделать кредитную и поменять дебетовую карту [[Santander]]  🌱 Obsidian Tasks 📅 2026-10-29

- [x] зашить шерстяной носок 🌱 Alisa ✅ 2026-10-10

- [-] check if new tasks logic works at friday 🌱 Obsidian Tasks 📅 2026-07-17 ❌ 2026-07-11

- [-] Купить весы для путешествий 🌱 Obsidian Tasks ❌ 2026-09-30
- ❌ Don't need it, will just change the battery
```

Cover open, completed and cancelled statuses; absent metadata; due, completion and cancellation dates; wiki-links; source labels; and adjacent explanatory text that is not itself a checkbox task.

### Recurrence and combined fields

Source: `work/DataDog/DataDog.md`.

```markdown
- [ ] Reimburse kindergarten 🔁 every 3 months 📅 2026-11-01
- [ ] Reimburse mobile phone ⏫ 🔁 every month 📅 2026-11-01
- [x] Reimburse kindergarten 🔁 every 3 months 📅 2026-05-01 ✅ 2026-06-25
```

Source: `@senaev/My Career/My Career.md`.

```markdown
- [ ] Fill the last quarter [[My Career - raw, handwritten via Self Assessments]] 🔁 every 90 days when done 📅 2026-11-09
```

Preserve the recurrence expression, including `when done`, and keep due dates distinct from completion dates. Completed and open occurrences are separate task records.

### Priority markers and completion without a date

Source: `work/DataDog/DataDog.md`.

```markdown
- [ ] reimburse business trip to Paris 🔺
- [-] Pass Workspaces training https://datadoghq.atlassian.net/wiki/spaces/EE1/pages/4955766785/Workspaces+Training 🔼 ❌ 2026-10-15
```

Source: `@senaev/How to work/How to work.md`.

```markdown
- [ ] Zettelkasten https://t.me/hoolinomics/4155 🔽
- [ ] Pass business negotiations courses ⏬
- [x] Cross cultural communication course 🔽
```

Together with the ⏫ example above, these cover all five explicit priority markers found in the inspected tasks. Tasks without a priority marker must also be supported. A completed checkbox does not necessarily have a completion date.

### Parsing boundaries

- Preserve description content, including wiki-links, URLs, multilingual text and source labels such as `🌱 Alisa`; do not assume these labels are built-in Tasks fields.
- Derive file name/path from the containing note, not from the task line.
- Distinguish checkbox tasks from ordinary bullets and examples inside fenced code blocks.
- Emoji can occur within ordinary text or linked note titles. For example, `periodic/day/2024-11-06.md` contains `- [x] [[📵 More boredom (➕output) = less junk (➖input)]] ✅ 2024-11-06`: the ➕ inside the link is description text, not a created-date field.
- This is a representative sample of vault usage, not a complete specification of every field supported by the Tasks plugin. The searches found no `- [/]`, `- [>]`, `[due::` or `[priority::` occurrences; this does not remove compatibility requirements for formats absent from these examples.

## Findings

### 2026-10-17 — Inspection of the MCP service, the vault and the daily filter

**MCP service in this repo**

- Tool schemas: `senaev-utils/src/obsidianVaultTools/vaultToolDefinitions.ts`. Registry: `obsidian-sync/src/vault-tools/vaultTools.ts`. cluster-helper only forwards `obsidian-*` calls to `POST obsidian-sync/vault/<tool>`.
- Existing tools: list, search, read, links, create, patch (with `expectedHash`), move, diary_append, operations*. Paging convention: `offset`/`limit`/`nextOffset` (`pagingProperties()`, `readPageArguments`).
- Vault access is the local folder `/vault`, kept in sync by the Obsidian Sync headless client (`ob sync --continuous`, conflict strategy `merge`). Dot-folders (so `.trash/`) and `plugins/` are already hidden from tools.
- Writes: `withFileMutation` (process-local path reservation) + `replaceFileAtomically`.
- There is no checkbox parser yet. remark-gfm recognises only `[ ]`/`[x]`, so `[-]` is not a GFM task item: a parser cannot rely on `listItem.checked`.
- A task writer already exists: `obsidian-sync/src/tasks/formatTaskLine.ts` + `prependTaskLine.ts`, used by `POST /tasks` (Telegram, Alisa via webhook-endpoint). `prependTaskLine` does **not** use `withFileMutation`, so it can race with MCP writes to the same file.

**Vault**

- Tasks plugin 8.3.0: emoji format, `globalFilter` empty, `globalQuery` excludes `_templates/` and `plugins/senaev-personal-tools/`. Statuses: ` `, `x`, and custom `-` CANCELLED. `setCreatedDate: false`, `setDoneDate: true`, `setCancelledDate: true`, `recurrenceOnNextLine: true`.
- About 3,600 notes and 10,000 tasks: `[x]` 7,997, `[-]` 1,900, `[ ]` 89. 93% of tasks are in `periodic/`.
- Fields in use: ✅ ❌ 📅 ⏳ 🔁 and all five priorities. ➕ (837) and 🏁 (233) occur only inside wiki-links. One invalid date: `_people/@mom.md`: `📅 2027-03-00`. 62 nested (indented) tasks, 5 block ids, no tags on task lines.
- Task-creation rules (vault root `AGENTS.md`, "Adding tasks"): default file `@senaev/tasks/tasks_streaming.md`; prepend; one blank line between tasks; always add `🌱 Agent`; add `📅` only when the user names a date.

**Daily filter** (`obsidian-vault/plugins/senaev-personal-tools/src/tasks/`)

- Query in every daily note: `filter by function window.senaevPersonalTools.filterTasksForDaily({task, query})` + `sort by function window.senaevPersonalTools.sortKeyForDaily({task})`, plus the global query.
- Filter, for the note date `D`:
  1. exclude tasks in `periodic/`;
  2. DONE/CANCELLED: keep only when the done date (or else the cancelled date) is `D` — so tasks closed today **are** listed;
  3. open: only on the "active" note (`D >= today` or `D` is the latest existing daily note);
  4. open with 📅: keep when due on or before `D` (an invalid date is never kept);
  5. open without 📅: keep when `priorityName` is Normal/Medium/High/Highest. Tasks names "no priority" `Normal`, so only 🔽 and ⏬ undated tasks are hidden.
- Sort: one string key `${priorityNumber}|${filename}|${description}` with `localeCompare(..., {numeric: true})`; priority 0 = Highest, 3 = none, 5 = Lowest.
- "Today" is the device local date; for the server it must be fixed to Europe/Madrid (`todayInTimeZone`).

### 2026-10-17 — Decisions from the first review

- Global query of the Tasks plugin (applies to **every** query, also the daily one): `path regex does not match /(^_templates\/|^plugins\/senaev-personal-tools\/)/`. The other lines are display options only. Obsidian also never indexes dot-folders (`.trash/`, `.obsidian/`). The server must apply the same exclusions to all listing modes.
- Move the pure daily filter and sort into `senaev-utils` (plain ISO dates, no `moment`); the vault plugin imports it from npm.
- `POST /tasks` and the MCP create tool share one writer, guarded by `withFileMutation`.
- Source label: optional `source` argument, default `Agent` → `🌱 Agent`.
- Create in a file other than the default: the "insert after line" argument is required; error when the line does not exist or the note does not exist.
- Create fields: description, due, scheduled, start, priority, recurrence (checked with `rrule`, needs a date); strict date validation; Tasks field order.
- Emoji format only. Scope as in Obsidian: no dot-folders, global-query exclusions, skip code fences, include nested and callout tasks, parse fields from the end of the line, report invalid dates as warnings.
- One task per call. Tools: `obsidian-tasks_list`, `obsidian-tasks_create`, `obsidian-tasks_update`, `obsidian-tasks_delete`. Update and delete take path + line, and fail when that line is not the expected task.
- Listing gets filters: status, text, due date range, completion date range, daily-note date (keyword `today` or `YYYY-MM-DD`).

### 2026-10-17 — Decisions from the second review

- Global-query exclusions are hard-coded in senaev-utils as a list of root folders (`_templates`, `plugins/senaev-personal-tools`), not as a regex. Dot-folders are always excluded.
- Priorities: `lowest` ⏬, `low` 🔽, `normal` (no emoji), `medium` 🔼, `high` ⏫, `highest` 🔺 — the same emojis as the Tasks plugin. No emoji means `normal`.
- Default sort everywhere: priority → file name → description (the daily sort).
- Task JSON: no `source`, `createdDate`, `onCompletion` (always keep), `id`, `dependsOn`, `blockId`.
- Recurrence text is validated on save.
- Text filter: several strings in one request, as in `obsidian-search`; reuse its matcher.
- `today` is not a default: it is a predefined value of the daily-note filter, explained in the tool description.
- "Prepend with a blank line in `tasks_streaming.md`" is a rule for the agent (tool description / vault `AGENTS.md`), not script logic.
- Done/cancelled without a date: the script sets today's ✅/❌ date.
- Completing a recurring task adds the next occurrence on the line below, as the Tasks plugin does.
- No delete tool: a task is done or cancelled instead.

### 2026-10-17 — Decisions from the third review

- `obsidian-read` gets a `lineNumbers: true` option.
- Create takes `blankLinesBefore` / `blankLinesAfter`, 0–10, default 0.
- Task fields: status, description, source (editable, `🌱 <source>`), priority, `dueDate`, `closedDate` (✅ for done, ❌ for cancelled; cleared when reopened), recurrence. No scheduled or start date.
- Strict round-trip rule: if `serialize(parse(line)) !== line`, the task cannot be edited; the tool returns an error.
- `dueDate` is required to create a recurring task and to complete one; otherwise an error.
- Sort: priority → file → line, implemented in senaev-utils. The vault plugin switches to it: vault project `projects/2026-10-17-09-04-daily-tasks-from-senaev-utils.md`.
- Insert position is refused inside frontmatter, code fences, tables and HTML blocks (remark node positions).

### 2026-10-17 — Decisions from the fourth review

- Writes use the file hash (`expectedHash`), as `obsidian-patch` does; no `expectedRaw` / `afterLineText`. Each listed task has a read-only `hash`; the write response returns the new one.
- The text filter searches the description only (not the source). No `recurring` filter; filters on other fields are separate work.
- Sort: priority → **path** → line.
- A task is editable only when it is a top-level `- [?] ` line and `serialize(parse(line)) === line`. Nested, callout and numbered tasks are listed but not editable. The error returns the expected (serialized) and the actual line.
- No `editable` flag in the list output.
- Recurrence: copy the Tasks plugin. Without `when done`, next due = old due + interval; with `when done`, next due = completion date + interval.
- At the end of the project: scan the vault for tasks that fail the round-trip and fix them by hand where possible.
- A task with an invalid date (e.g. `📅 2027-03-00`) is a parse error and is not in the list output. The vault clean-up finds these tasks.

### 2026-10-17 — Implementation (steps 1–10)

Work is on `main`, no branch (user's decision).

- senaev-utils `src/obsidianTasks/`:
  - `taskLine.ts`: parser, serializer, `findTaskEditBlocker`, `findTaskFieldsError`.
  - `taskRecurrence.ts`: rrule validation and the next due date.
  - `dailyTasks.ts`: daily filter, `isActiveDailyDate`, sort key, exclusions.
  - `isoDay.ts`.
  - `rrule` 2.8.1 added to the dependencies.
- How the parser works: it reads every field of the Tasks emoji format (also ⏳ 🛫 ➕ 🏁 🆔 ⛔, trailing `#tags` and block links), as the plugin does. The model keeps only our fields. So a line with an unsupported field, another field order or extra spaces does not serialize back to itself and is not editable. This also prevents a `#tag` after 📅 from hiding the due date.
- A written task must read back as the same fields (`findTaskFieldsError`). For example, a description that ends with `📅 2026-01-01` is refused when nothing follows it. With a source after it, the line reads back the same, as in the Tasks plugin, so it is accepted.
- obsidian-sync:
  - `vault-tools/tasks/`: `findTaskLines` (raw blocks from remark), `scanVaultTasks` (with a per-note cache), `taskFileEdits`.
  - `markdown/rawBlocks.ts`; `textQuery.ts`, which `obsidian-search` now uses too.
  - `tools/tasks{List,Create,Update}{Tool,Command}.ts`; `obsidian-read` has `lineNumbers`.
  - `POST /tasks` uses `serializeTask` and `insertLines` under `withFileMutation`; `formatTaskLine.ts` is removed.
  - cluster-helper needed no code change: its tool list comes from `VAULT_MCP_TOOL_DEFINITIONS`.
- Checks: `npm run simple-checks` passes (lint, typecheck, 1,324 tests, syntax, helm).

Scan of the local vault copy with `scanVaultTasks` (`~/tmp/scan-tasks.ts`):

```
run 1: 2276 ms, files 3630, tasks 9959, parse errors 1
run 2: 438 ms, files 3630, tasks 9959, parse errors 1
not editable: nested/callout/numbered 61, format 32
  _people/@mom.md:46 invalid due date "2027-03-00"
Map(5) { 'block id' => 5, 'double space' => 23, 'trailing space' => 1, 'created' => 2, 'scheduled' => 1 }
```

A cold scan takes 2.3 s, a warm scan 0.4 s (the cache skips remark). Input for step 11: 1 invalid date, 24 whitespace problems (23 of them in `periodic/`), 5 block IDs, 2 ➕ and 1 ⏳.

### 2026-10-17 — Deploy, vault plugin, vault clean-up

- Commit `5cf3ce1` was pushed. All service workflows passed, and senaev-utils was published as `1.0.0-ci.39062759981.1`. The npm metadata CDN showed the old `ci` tag for some minutes; `--prefer-online` found the new version.
- Smoke test after the deploy: `s.senaev.com/1bxsl9` → 302 to `/cv/5min`, the static page → 200, the public note → 200.
- Vault plugin (vault project `projects/2026-10-17-09-04-daily-tasks-from-senaev-utils.md`):
  - The plugin uses `isTaskInDailyNote`, `isActiveDailyDate` and `getTaskSortKey` from senaev-utils.
  - Typecheck, 80 tests and lint pass; `main.js` is rebuilt.
  - The vault is not committed.
- Vault clean-up, step 1: `~/tmp/fix-task-spaces.ts` fixed 26 task lines whose only problem was extra spaces. It changes a line only when collapsing the spaces gives exactly the serialized line.

  Correction: the "2 ➕" above was a mistake of my count. They were whitespace lines with `➕` inside a wikilink, and they are now fixed.

  Scan after the fix:

  ```
  not editable: nested/callout/numbered 61, format 6
  _people/@mom.md:46 invalid due date "2027-03-00"
  ```

  These 6 need a decision from the owner, because a fix would delete data:
  - 5 block IDs (`^2024-11-21T16-49-07` etc.) in `_people/@alex-gran-tc.md`, `_people/@lavrinovich.md`, `_people/@zimarev.md`, `_wiki/Рационализм.md` and `@senaev/How to work/How to hire (find) an employee.md`;
  - ⏳ in `tools/Terminal = Warp + ZSH + Oh My ZSH!.md:48`.

  The invalid date needs the real day. The 61 nested, callout and numbered tasks cannot be edited by design.

### 2026-10-17 — Vault re-check after the owner's fixes

The owner fixed the lines by hand. `~/tmp/scan-context.ts` found this:

```
tasks 9972, parse errors 0
_people/@zimarev.md:212 — expected: - [x] Распланировать траты по [[Air Retail Media]] на [[2025]] ✅ 2024-11-25
> 212: - [x] Распланировать траты по [[Air Retail Media]] на [[2025]] ✅ 2024-11-25 ^2024-11-21T16-38-40
nested/callout/numbered (not editable by design): 61
```

One format problem is left: a block ID. It is linked from `_people/@alex-gran-tc.md:163` (`[[@zimarev#^2024-11-21T16-38-40]]`), so deleting it breaks that link.

The vault plugin no longer re-exports `isActiveDailyDate`; every place imports it from senaev-utils. The plugin is rebuilt.

### 2026-10-17 — Remove the task scan cache

The user decided to remove the in-memory cache from `scanVaultTasks.ts`; a better solution (notes kept in memory, updated on file changes) is for later. Each `obsidian-tasks_list` call now reads and parses every note, and it hashes only the notes that have tasks.

```
run 1: 2054 ms, files 3631, tasks 9972, parse errors 0
run 2: 1929 ms, files 3631, tasks 9972, parse errors 0
```

The cost of the later solution, estimated before the decision:
- The vault has 7.2 MB of note text, which is about 20–40 MB in memory with the parsed data.
- The real cost is change detection: our own writes update the cache, an inotify watcher follows `ob sync`, and an mtime/size check catches missed events.

### 2026-10-17 — Verification by the owner

- The Obsidian plugin works well: the daily note shows the tasks in the new order.
- The ChatGPT tools work well.

## Result

Done. ChatGPT can list, create and change Obsidian tasks through `obsidian-tasks_list`, `obsidian-tasks_create` and `obsidian-tasks_update`. They use the same task format, daily filter and sort as Obsidian.

- Code:
  - senaev-utils `src/obsidianTasks/`: parser, writer, recurrence, daily filter and sort, shared with the vault plugin through npm.
  - obsidian-sync `vault-tools/tasks/` and `tools/tasks*`.
  - `obsidian-read` has `lineNumbers`.
  - `POST /tasks` uses the shared writer under the file lock.
  - Commits: `5cf3ce1`, `58c6b1f` (cache removed); logs in `99b4b38`, `600574a`.
- Vault:
  - The plugin uses senaev-utils, and the sort is priority → path → line (vault task `Tasks/2026-10-17-09-04-daily-tasks-from-senaev-utils.md`).
  - 26 whitespace-only task lines were fixed, and the owner fixed the others by hand. The vault changes are not committed.
- Open points:
  - One line cannot be edited: `_people/@zimarev.md:212` has a block ID that a link in `_people/@alex-gran-tc.md:163` uses.
  - A task scan takes about 2 s without a cache. Notes kept in memory, updated on file changes, are for later.
  - Task detection is not exactly Obsidian's: we use remark plus a regex on each line, and Obsidian uses its metadata cache list items. `%%` comments and `$$` blocks can differ. We can check by comparing the counts with an unfiltered ```tasks``` query.
