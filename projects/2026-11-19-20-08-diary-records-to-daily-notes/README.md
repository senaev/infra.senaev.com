# 2026-11-19 — Diary records straight into daily notes

`obsidian-diary_append` writes each record into the daily note of its day instead of the
shared stream file, and can write records for several days in one call.

## Goal

Today every diary record goes to `@senaev/daily_note_stream.md`, and the owner moves the
records into daily notes by hand. Instead:

- The MCP tool takes an array of records, each with a `date` (`YYYY-MM-DD`) and a `text`.
- Each record is written into `periodic/day/<date>.md`:
  1. right above the line `⬆️ Daily Note ⬆️`, if the note has it;
  2. else right above the line `![[daily_note_stream]]` (the embed of the old stream file,
     which the daily note template has).
  Each next record of a day lands under the previous one, so the order is kept.
- A missing daily note is created exactly as the Obsidian plugin creates it.
- When a daily note cannot be created or has no place for a record, the call fails with an
  explicit error.
- The daily note template is shared by the plugin and obsidian-sync via senaev-utils.

## Context

Path of a call: MCP client → cluster-helper `/obsidian` (tool schema from senaev-utils, passed
through unchanged) → obsidian-sync `POST /vault/diary_append` → vault files.

| Part | Where |
|---|---|
| Tool schema and description | `senaev-utils/src/obsidianVaultTools/vaultToolDefinitions.ts` (`diary_append`) |
| Argument keys, limits | `senaev-utils/src/obsidianVaultTools/vaultCommands.ts`, `vaultToolLimits.ts` (`DIARY_APPEND_LIMITS`) |
| Daily note template (shared) | `senaev-utils/src/obsidianDailyNotes/dailyNoteTemplate.ts` |
| Record format and insertion (shared) | `senaev-utils/src/obsidianDailyNotes/diaryRecord.ts` |
| Command | `obsidian-sync/src/vault-tools/tools/diaryAppendCommand.ts`, `diaryAppendTool.ts` |
| Plugin that creates daily notes today | `senaev/obsidian-vault`: `plugins/senaev-personal-tools/src/dailyNote/dailyNoteTemplate.ts` |
| Vault rules for the diary | `senaev/obsidian-vault`: `AGENTS.md`, section "Diary" |

Decisions in step 1:

- The tool keeps its name `diary_append`; only its arguments change: `{ records: [{ date, text }] }`
  (1 to 20 records). The old `text` argument is rejected.
- A record keeps the format of the stream file without the surrounding blank lines:
  `[[<date>|🎙️ <time of writing, Europe/Madrid>]]: <text> ✍️`. It is one paragraph with a
  blank line before and after it.
- The marker and the embed count only as a whole line, indented by at most 3 spaces, outside
  fenced code blocks (CommonMark fences: a closing fence has nothing but spaces after it). The
  marker matches with or without the emoji variation selector and wins when the note has both.
- A record whose text contains one of these lines is rejected (`invalid_arguments`): a later
  record would be inserted in the middle of it. The records of one day in a call are inserted
  together, at one anchor.
- An existing note is read again right before it is replaced; if Obsidian changed it since the
  plan, the call fails with `conflict` and that note is not written (no retry). Notes written
  earlier in the same call keep their records. Only the file system time of the write itself
  is unprotected against another process.
- All notes of a call are read and changed in memory first; if any of them has no anchor,
  nothing is written (`conflict` error naming the note). A blank existing daily note, or one
  with only frontmatter, is filled from the template, as the plugin does.
- The template marker `<!-- senaev:daily-note-template -->` was dropped from the shared code:
  nothing writes it any more (see the worklog of 2026-11-19 21:20 UTC).
- The template was ported unchanged; the fixtures captured from the old Templater template
  (`dailyNoteTemplate.fixtures.ts`) prove the output is identical. It uses calendar fields of
  the date in UTC, so the server time zone does not matter.
- Since 2026-11-20 the template has a `⬆️ Daily Note ⬆️` line under the stream embed, in place of
  the blank lines there, so the records of a new note go below the embed, where the owner keeps
  the diary text.

## Plan

1. **infra.senaev.com: MCP, obsidian-sync and shared code** — done in this branch:
   shared template and record insertion in senaev-utils, new tool schema, new command, tests.
2. **Deploy and verify** — done on 2026-11-19: PR #237 merged and deployed; tested through the
   Obsidian MCP with test notes in 2027, then removed (see the worklog).
3. **Vault rules** — done on 2026-11-20: the owner removed the diary-recording rules and the
   note-creation text from the vault `AGENTS.md`; the `diary_append` tool description now holds
   all the rules for a record.
4. **Plugin** — PR senaev/obsidian-vault#6: the plugin imports the template from senaev-utils
   `1.0.0-ci.44629167422.1`; its own copy, fixtures and the template marker are removed, and
   `main.js` is rebuilt. After the merge, check a new daily note in Obsidian.
5. **Marker in the template** — the template gets the marker line under the embed (this PR).
   After the senaev-utils `ci` release, raise its version in the plugin and rebuild `main.js`.
6. **Clean-up**: decide on the open points below.

## Verification

- Ask an MCP client to record a diary entry about today and one about yesterday in one call.
  Both daily notes get the record above `⬆️ Daily Note ⬆️` (or above `![[daily_note_stream]]`),
  in order; a missing note is created with the full template.
- A daily note without either line returns an error and nothing is written.
- A daily note created by the plugin and by obsidian-sync for the same date is identical.

## Open points

- Periodic Notes is still enabled, and its daily template points at the deleted
  `_templates/Daily note template.md`. Clear that setting, or disable Periodic Notes if only the
  calendar needs it.
- Retire `@senaev/daily_note_stream.md` and its embed once the records are no longer written
  there (the embed is still the fallback anchor).
- A record links to its own daily note (`[[<date>|🎙️ …]]`); drop the link and keep only the
  time if that looks redundant in the note.
