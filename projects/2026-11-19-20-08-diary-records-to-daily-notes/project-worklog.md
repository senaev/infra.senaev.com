# Worklog

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
