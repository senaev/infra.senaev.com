## 2026-11-22 16:49 UTC — Verify the first BRAT update

Infra PR #280 published `0.1.2` and deployed the shared reminder-link renderer.
The vault owner verified the update in Obsidian by creating a new daily note.

```text
Updated plugins and now everything works. I tried to create new note and now the logic of reminders works correctly
```

The update and daily-note checks complete the migration.

## 2026-11-22 16:29 UTC — Verify the BRAT cutover after vault sync

Release `0.1.1` published all three assets, and the infra deployment passed its
five public smoke tests. Vault PR #10 merged with the BRAT configuration and Telegram
sync state in place. The vault owner confirmed the plugin works after syncing.

```text
Everything works after this sync
```

The cutover is complete. The next release will exercise the BRAT update path.

## 2026-11-22 15:47 UTC — Prepare the plugin migration PR

Imported 31 plugin commits into infra and prepared the first release as `0.1.1`.
The plugin and Obsidian Sync now use the milestone configuration from senaev-utils.

```text
ℹ tests 89
ℹ pass 89
ℹ fail 0
```

The local build produced the three release assets. BRAT installation and updates
will be verified after the first release is published.

## 2026-11-21 18:27 UTC — Verify the reminder prerequisite in the live vault

The first attempt created the daily-note layout with zero reminders. The live vault
was missing the merged frontmatter changes. After applying the exact changes to the
15 source notes, all 15 file hashes matched the merged vault revision.

The rerun used January 1–4, 2027. All four notes had the expected reminder sections,
the direct Work achievements link, the Tasks query, and the diary marker.

```text
[true,true,true,true]
custom.durationMs: 1748
```

Obsidian Sync created the four notes in one request. The trace measures the full request.
All four original paths returned `not_found` after recoverable cleanup.

## 2026-11-21 12:03 UTC — Prepare the plugin history import

The local branch joins the filtered plugin history to infra. It excludes the installed
plugin directory and vault sync state. The manifest is a regular file and the bundle
is generated under an ignored dist directory.

```text
Merge made by the 'ort' strategy.
```
