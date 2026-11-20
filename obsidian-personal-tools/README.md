# Obsidian Sample Plugin

## Daily-note creation

The daily-note template lives in the `senaev-utils` npm package
(`src/obsidianDailyNotes/dailyNoteTemplate.ts` in infra.senaev.com), shared with obsidian-sync,
which creates a missing daily note the same way before it writes a diary record into it. It
generates the habits, Tasks query, date-dependent tasks, quarterly achievements link and daily
stream embed. The note filename supplies the calendar date; the current clock, time zone and
Moment locale do not affect scheduling. Header/footer widgets remain separate. To change the
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


This is a sample plugin for Obsidian (https://obsidian.md).

This project uses TypeScript to provide type checking and documentation.
The repo depends on the latest plugin API (obsidian.d.ts) in TypeScript Definition format, which contains TSDoc comments describing what it does.

This sample plugin demonstrates some of the basic functionality the plugin API can do.

- Adds a ribbon icon, which shows a Notice when clicked.
- Adds a command "Open modal (simple)" which opens a Modal.
- Adds a plugin setting tab to the settings page.
- Registers a global click event and outputs a Notice on click.
- Registers a global interval which logs 'setInterval' to the console.

## First time developing plugins?

Quick starting guide for new plugin devs:

- Check if [someone already developed a plugin for what you want](https://obsidian.md/plugins)! There might be an existing plugin similar enough that you can partner up with.
- Make a copy of this repo as a template with the "Use this template" button (login to GitHub if you don't see it).
- Clone your repo to a local development folder. For convenience, you can place this folder in your `.obsidian/plugins/your-plugin-name` folder.
- Install NodeJS, then run `npm i` in the command line under your repo folder.
- Run `npm run dev` to compile your plugin from `src/main.ts` to `main.js`.
- Make changes to `src/main.ts` (or create new `.ts` files). Those changes should be automatically compiled into `main.js`.
- Reload Obsidian to load the new version of your plugin.
- Enable plugin in settings window.
- For updates to the Obsidian API run `npm update` in the command line under your repo folder.

## Releasing new releases

- Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`

## Adding your plugin to the community plugin list

- Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
- Publish an initial version.
- Make sure you have a `README.md` file in the root of your repo.
- Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin.

## How to use

- Clone this repo.
- Make sure your NodeJS is at least v18 (`node --version`).
- `npm i` to install dependencies.
- `npm run dev` to start compilation in watch mode.

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Improve code quality with eslint

- [ESLint](https://eslint.org/) is a tool that analyzes your code to quickly find problems. You can run ESLint against your plugin to find common bugs and ways to improve your code.
- This project already has eslint preconfigured, you can invoke a check by running`npm run lint`
- Together with a custom eslint [plugin](https://github.com/obsidianmd/eslint-plugin) for Obsidan specific code guidelines.
- A GitHub action is preconfigured to automatically lint every commit on all branches.

## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
	"fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:

```json
{
	"fundingUrl": {
		"Buy Me a Coffee": "https://buymeacoffee.com",
		"GitHub Sponsor": "https://github.com/sponsors",
		"Patreon": "https://www.patreon.com/"
	}
}
```

## API Documentation

See https://docs.obsidian.md
