# Senaev Personal Tools

## Daily-note creation

The daily-note template lives in the `senaev-utils` npm package
(`src/obsidianDailyNotes/dailyNoteTemplate.ts` in infra.senaev.com), shared with obsidian-sync,
which creates a missing daily note the same way before it writes a diary record into it. It
renders reminders from vault note properties alongside the Tasks query and the
`⬆️ Daily Note ⬆️` line, above which diary records are inserted. Use
`morning-reminder`, `day-reminder`, or `evening-reminder` for checkbox text. The matching
`*-reminder-order` property sets ascending numeric order. A daytime reminder can specify an
RRULE in `day-reminder-schedule`. The daily note filename supplies the calendar date.
Header/footer widgets remain separate. To change the
template, change senaev-utils, wait for the `ci` release, and update the exact version in
`package.json`, as for the Tasks rules below.

There is no template file: `_templates/Daily note template.md` was deleted.
`registerDailyNoteCreation.ts` handles vault create/modify/rename and workspace file-open
events after layout readiness, so direct file creation, calendar/Periodic Notes actions, full-path
links, untitled-note renaming and opening notes synced from another device all work.
Only direct `periodic/day/YYYY-MM-DD.md` files with real calendar dates qualify. A date-named
note created elsewhere must first be moved into this folder. No whole-vault startup scan occurs.
The active note is checked once at layout readiness.

Initialization fills whitespace-only files and frontmatter-only files, preserving frontmatter.
Any other content, including existing body text and checked tasks, is left unchanged. Opening an
old empty daily note intentionally initializes it. A nonempty note is never regenerated on rename.
`Vault.process` atomically rechecks content before writing; a preliminary read avoids no-op modify
loops. Per-file jobs serialize overlapping events and recheck changes received during a write.
Unload cancels pending work; failed work can be retried by reopening the note.

The command **Senaev Personal Tools: Open or create today’s daily note** works without Periodic
Notes and creates missing folders. Existing Periodic Notes commands and shortcuts keep working.
The old Templater daily folder rule and `dailyBody.js` are removed. Templater stays enabled for
manual insertion of the three static interview templates; their migration is a separate change.
The manifest requires Obsidian 1.4.0 for the atomic processing and folder APIs.

Validation: run lint, typecheck, tests and build. The template itself is tested in senaev-utils,
against fixtures captured from the retired template/script. For manual desktop
and mobile QA, create a daily note via Periodic Notes/calendar, a full-path link, file explorer,
rename/move, and the personal command; reopen it and check that task completion persists.
Also open a synced note with diary content and verify that it is untouched.


## Install with BRAT

Install and enable BRAT in Obsidian. Under **Settings → BRAT → Add Plugin**, enter
`senaev/infra.senaev.com` and select **Latest version**. Enable **Senaev Personal Tools**
under **Community plugins**. Use BRAT’s update command or enable automatic updates.

## Build and release

From `obsidian-personal-tools/`, run `npm ci`, `npm run lint`, `npm run typecheck`,
`npm test`, and `npm run build`. The build stages `main.js`, `manifest.json`, and
`styles.css` in `dist/`. For local testing, copy those files into
`<vault>/.obsidian/plugins/senaev-personal-tools/`.

Run `npm version patch --no-git-tag-version` or choose the appropriate version bump.
When the version lands on infra main, GitHub Actions checks the plugin, publishes the
release assets under the manifest version, and sends a Telegram notification. The
repository’s release list is also the BRAT feed, so publish unrelated releases elsewhere.
