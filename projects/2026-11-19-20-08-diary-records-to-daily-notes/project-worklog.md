# Worklog

## 2026-11-20 — Step 7: remove the stream file and every mention of it

The owner decided to remove `![[daily_note_stream]]` from the template, the stream file itself
and the embed from all past daily notes. The live `@senaev/daily_note_stream.md` is empty
(read through the MCP, size 0). 152 daily notes embed it, all with the same layout: the embed,
the diary text, then the `---` above "Plan the next day":

```
{'hr-after+plan': 152}
```

So the vault PR replaces each embed with a `⬆️ Daily Note ⬆️` line placed before that `---`,
and `diary_append` keeps only the marker as anchor. The vault PR must be merged before this one
is deployed.

## 2026-11-20 18:55 UTC — The template gets the marker under the stream embed

The first real two-day call from ChatGPT landed in the right notes, but on 2026-11-19 the
record went above `![[daily_note_stream]]`, while that day's earlier records were below it
(moved there by hand from the stream file), so the latest event came first. The owner decided
that new daily notes get the `⬆️ Daily Note ⬆️` line. It goes right under the embed, in place
of the blank lines there:

```
---
![[daily_note_stream]]

⬆️ Daily Note ⬆️

---
```

`DIARY_RECORD_MARKER` moved to `dailyNoteTemplate.ts`, so the plugin bundle does not pull in the
server-side error helpers; `diaryRecord.ts` re-exports it. The fixtures were updated in the same way.

## 2026-11-20 — Step 4: plugin uses the shared template (PR senaev/obsidian-vault#6)

The plugin now imports `dailyDateFromPath`, `dailyNotePathForRootNote`, `initializeDailyNote`,
`renderDailyNote` and `DAILY_NOTE_FOLDER` from senaev-utils `1.0.0-ci.44629167422.1`, the
release of #237. `dailyNoteTemplate.ts`, its test and its fixtures were deleted from the plugin;
the initializer tests use blank notes instead of the removed marker. Plugin checks: lint,
typecheck, 89 tests, build; the vault CI, which also checks that the committed `main.js` matches
the build, passed.

## 2026-11-20 — Step 3 done: diary rules live only in the tool description

The owner decided that the vault `AGENTS.md` must not describe the MCP or how daily notes are
created. Removed from its Diary section (live, through obsidian-patch): the sentence about
`_templates/Daily note template.md`, and the whole "Diary staging approach" subsection with its
7 rules for a record; also the deleted template in the plugin section. The three rules that the
`diary_append` description did not have yet moved there, replacing "Follow the Diary section of
the vault's AGENTS.md": do not combine with earlier messages or records; write the edited text in
the reply first, then save exactly that; after saving, reply only with a short confirmation and
the paths.

## 2026-11-19 22:42 UTC — Step 2 done: deployed and verified through the Obsidian MCP

PR #237 was squash-merged (`ffd75d7`); the Deploy run succeeded, and cluster-helper and
obsidian-sync restarted at 22:33 UTC with no errors (only the npm update notice). The live tool
schema has `records: [{ date, text }]`.

Test through the Obsidian MCP from Claude Code, with daily notes in 2027 (none existed before):

1. One record for 2027-01-04: the note was created from the full template (Monday: Leetcode,
   `2027q1`), the record right above `![[daily_note_stream]]`.
2. One call: A and C for 2027-01-05, B for 2027-01-09 (Saturday), D for 2027-02-01 (first of the
   month), interleaved: three notes created with the right template, Jan 5 has A then C.
3. Existing notes: a new record went under the earlier ones on Jan 4 and Jan 5. On Jan 9 a
   `⬆️ Daily Note ⬆️` line was added above the first `---`; records F and G went above it in
   order, not above the embed.
4. Errors, each with no change to any note (the hash of Jan 4 stayed the same):
   - a note without an anchor in a call with a valid day → `conflict`, naming the note;
   - a record containing the marker line → `invalid_arguments`;
   - date `2027-02-30` → `invalid_arguments`.

```
[[2027-01-09|🎙️ 2026-11-19 23:38]]: TEST marker F, should go above the marker. ✍️

[[2027-01-09|🎙️ 2026-11-19 23:38]]: TEST marker G, should go under F. ✍️

⬆️ Daily Note ⬆️
```

The five test notes were removed with obsidian-delete, which moves them to `.trash/mcp/`; each
delete took about 20 s, because it scans all ~3,750 vault files for backlinks.

## 2026-11-19 21:50 UTC — Tool description without Obsidian internals

The owner decided the MCP client must not know how records are placed. The `diary_append`
description no longer names the anchor lines, the ✍️ mark, the order rule, the daily note
template or the `periodic/day/` path. It keeps what the client must do: one record per day the
text is about, send only the user's text, and read the entries before resending after a failed
call with several days. Error messages still name the anchor lines, because the owner has to
fix the note.

## 2026-11-19 21:35 UTC — No retry when a note changed during the call

The owner decided: when a daily note changed between the plan and the write, return the
`conflict` error at once instead of rebuilding up to 3 times (`MAX_WRITE_ATTEMPTS` removed).
The test with an edit at each of the first 8 checkpoints now accepts either outcome: the record
written with the edit kept, or `conflict` with the note exactly as edited. Both occur.

```
 Tests  8 passed (8)   (diaryAppendTool.integration.test.ts)
```

## 2026-11-19 21:20 UTC — Template marker dropped: nothing writes it any more

The owner asked whether `<!-- senaev:daily-note-template -->` is still needed. Nothing in the
vault writes it: the core Daily notes and Templates plugins are off, Templater is not installed,
and the template file that held the marker is in `.trash`. Periodic Notes is still enabled
and still names that file, so it can only create an empty note, which the plugin fills as a
blank note anyway. No daily note contains the marker.

```
.obsidian/core-plugins.json:  "daily-notes": false, "templates": false
.obsidian/plugins/periodic-notes/data.json:  "daily": { "folder": "periodic/day", "template": "_templates/Daily note template.md", "enabled": true }
$ ls _templates
Final Interview template.md  Job Presentation template.md  Yandex AAA Frontend Interview templete.md
$ grep -rl "senaev:daily-note-template" periodic | wc -l
0
```

`DAILY_NOTE_TEMPLATE_MARKER` and its handling were removed from senaev-utils; a note with only
the marker is now left unchanged.

## 2026-11-19 21:00 UTC — CodeRabbit review on PR #237 fixed

All four findings were valid and are fixed:

- A record containing `⬆️ Daily Note ⬆️` or `![[daily_note_stream]]` on its own line is
  rejected; one day's records are inserted at one anchor (`insertDiaryRecords`).
- A stale plan no longer overwrites an edit made meanwhile: the note is read again right
  before the rename, with no yield in between, and rebuilt from the current content when it
  changed. A test makes another writer append a line at each of the first 8 checkpoints of the
  call; the first version lost the edit at checkpoint 7 (between the re-read and the rename).
- A fence line with text after it does not close a fence.
- Anchor lines indented by 4+ spaces or a tab are skipped (a simple rule instead of full
  CommonMark indented-code rules: an indented anchor is never wanted).

```
[test]       Tests  1942 passed (1942)
```

## 2026-11-19 20:10 UTC — Step 1 implemented: records array, writes into daily notes

Branch `diary-records-to-daily-notes`. `diary_append` now takes `records: [{ date, text }]`
and writes into `periodic/day/<date>.md` above `⬆️ Daily Note ⬆️`, else above
`![[daily_note_stream]]`; a missing note is created from the template. The template moved from
the plugin to `senaev-utils/src/obsidianDailyNotes/` unchanged (the plugin fixtures pass), and
`formatDailyNoteDraftRecord` moved there as `diaryRecord.ts`. `diaryDraftPath` was removed from
the obsidian-sync config. cluster-helper needed no code change: it forwards the arguments and
takes the schema from senaev-utils.

```
[test]  Test Files  232 passed (232)
[test]       Tests  1936 passed (1936)
--> │ lint         │ 18,633   │ 0 │ ...
--> │ typecheck    │ 17,371   │ 0 │ ...
```

`npm run simple-checks` passes. Next: deploy and verify (step 2).
