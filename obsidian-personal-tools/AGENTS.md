# AGENTS

## Features

- **Daily note widgets** (`src/dailyNote/`) — injects a header (date heading → nav row → milestones) and a footer (milestones → nav row) into every `periodic/day/YYYY-MM-DD` note, in both Reading view and Live Preview. Needs no markup in the note itself. The milestones logic and config live in `src/milestones/` — see below.
- **Global API for the Tasks plugin** (`src/tasks/`) — see below.
- **Commands** (`src/commands/`) — *Copy public link*, plus three that act on the editor selection: *Copy text to public*, *Search selection in Google*, *Translate selection in Google Translate*. The last three flatten wiki-links first via `src/utils/stripWikiLinks.ts`, because `[[...]]` syntax is meaningless outside the vault.

## Milestones — `src/milestones/`

Milestone types are data, not code. The JSON files are written for external code as well, so that code collecting milestones for a date can read the same rules as the plugin. The folder holds the config and the logic that reads it; only the rendering (`src/dailyNote/milestonesWidget.ts`) is elsewhere.

| File | Purpose |
| --- | --- |
| `milestones.ts` | collects the milestones for a daily note's date and the day after it |
| `milestoneTypes.ts` | reads `milestones.json` and fills templates |
| `milestoneRule.ts` | evaluates calculated dates (RRULE) |
| `calendarDay.ts` | the `CalendarDay` type |
| `milestones.json` | the config: types in display order, the hidden property, the tomorrow emoji, the first year with a known age |
| `milestones.schema.json` | JSON Schema for the config; every field is described there |
| `rule-test-vectors.json` | expected dates for calculated rules, which every consumer should test against |

The plugin bundles `milestones.json` at build time, so an edit there needs `npm run build`. Adding a type needs no change to any `.ts` file:

```json
{
	"property": "birthday",
	"emoji": "🥳",
	"template": "{{FILENAME}} birthday {{AGE}} {{EMOJI}}"
}
```

`types` is an array rather than an object keyed by property, so display order does not depend on how a consumer's JSON parser orders keys.

Every note carrying `property` is scanned, and a milestone is shown when the day and month match the daily note's date or the day after it. The year is ignored for matching and used only for `{{AGE}}`.

### Calculated dates — `ruleProperty`

A type with `ruleProperty` (only `holiday`, as `holiday-rule`) also accepts a date that must be calculated, written as an RFC 5545 RRULE in the note:

```yaml
---
holiday-rule: FREQ=YEARLY;BYMONTH=11;BYDAY=-1SU
---
```

The rule lives in the note, like a fixed date, so a new calculated holiday is just a new note. RRULE was chosen over a readable custom syntax because every language has a library for it, so external code does not need its own parser. See `src/milestones/milestoneRule.ts` (uses the `rrule` package, which grew `main.js` from ~11 KB to ~57 KB). Conventions:

- The rule is evaluated as if `DTSTART` were 1 January of the requested year, 00:00 UTC. `FREQ` is required; `DTSTART` and `COUNT` are rejected, because they would mean something different under that convention.
- An invalid rule never matches and logs a console warning.
- A calculated milestone has no `{{AGE}}`.
- Easter-based dates are not expressible in standard RRULE.

`_wiki/milestones/Mother's Day.md` uses this; it was hard-coded before.

Placeholders (see `renderMilestoneTemplate` in `src/milestones/milestoneTypes.ts`):

| Placeholder | Value |
| --- | --- |
| `{{FILENAME}}` | note name without the extension, e.g. `@mom` |
| `{{AGE}}` | years since the date in parentheses, e.g. `(62)`; empty when the year is ≤1900 |
| `{{EMOJI}}` | the type's `emoji`, or `🔜` when the milestone is tomorrow's |

`{{AGE}}` is empty for a placeholder year such as `0001-12-31`, which the vault uses for dates that recur without a known start. Whitespace runs are collapsed and the result trimmed after substitution, so an empty placeholder leaves neither a double space nor a dangling gap, and a template can be spaced the way it reads best. Deliberate whitespace (a double space, a non-breaking space) does not survive.

Two consequences of the emoji living inside the template:

- It is part of the link text, so clicking it opens the note. It used to sit in its own span outside the link.
- `🔜` replaces the type's emoji for tomorrow's milestones rather than being appended, keeping one emoji per line.

### Hiding a note's milestones — `milestones-hidden`

A note with `milestones-hidden: true` (the config's `hiddenProperty`) in its frontmatter shows none of its milestones, today's or tomorrow's, fixed or calculated. The note keeps its dates; only the widget skips it.

Only the YAML boolean `true` hides. Any other value — `false`, the quoted string `"true"`, `yes`, `1` — is ignored, so a typo shows the milestone instead of silently hiding it.

## Global API — `window.senaevPersonalTools`

The Tasks plugin evaluates `filter by function` / `sort by function` expressions as plain JavaScript, so it can only reach plugin code through a global. `registerTasksGlobals` publishes one on load and deletes it on unload.

Daily notes call it like this:

```tasks
filter by function window.senaevPersonalTools.filterTasksForDaily({task, query})
sort by function window.senaevPersonalTools.sortKeyForDaily({task})
```

`filterTasksForDaily` splits daily notes into two roles:

- A **closed** task (done or cancelled) is listed on the note for the day it was closed on, so every past note stays a record of what was finished that day.
- **Open** tasks are listed only on the *active* note, and only when due on or before its date, or undated and of normal-or-higher priority.

Tasks inside `periodic/` are always excluded so daily notes never echo each other.

`isActiveDailyDate` (`src/tasks/activeDailyDate.ts`) picks the active note: today and any future date, plus the latest existing note when today's note does not exist yet. Both rules collapse into `noteDate >= today || noteDate === latestExistingDate`, because when today's note exists the latest date is already today or later and the second check cannot reach into the past. `YYYY-MM-DD` compares chronologically as a plain string, so no date parsing is needed. A note whose name is not a date — only `_templates/Daily note template.md` — counts as active, so the template still shows open tasks.

Without this scoping every past note repeats the whole open backlog, which is what made 600+ notes render the same list.

`createIsActiveDailyDate` caches the latest existing date, since finding it scans every markdown file while the filter runs once per task per query. The cache is invalidated on vault `create`/`delete`/`rename` of a daily note; a rename checks the old path too. Today's date is read fresh on each call, so midnight needs no invalidation. A past note already open on screen keeps its old list until the Tasks plugin re-renders it, which reopening the note always does.

`sortKeyForDaily` orders by priority (highest first), then file name, then description. All three tiers are packed into one `|`-separated string because the Tasks plugin accepts only a single scalar per `sort by function` and throws when two keys have different types — it has no hook for a real comparator, so a plugin cannot supply one. Details that matter if you change it:

- Priority leads as a single digit (`0` Highest … `5` Lowest), so plain ascending order already means highest-priority-first.
- `|` is the separator because Obsidian forbids it in file names, keeping the file-name tier unambiguous, and because it is ordinary punctuation. A control character would be wrong here: the comparator calls `localeCompare` without `ignorePunctuation`, and control characters are collated away entirely.
- The comparator uses `numeric: true`, so digit runs sort naturally (`task 2` before `task 10`) rather than lexicographically. This is not configurable from a note.
- Descriptions are used raw, so tasks written as `[[Some link]]` group ahead of plain-text ones (`[` sorts before letters). Tasks' own `sort by description` strips the brackets instead, which is why it is not used here.

Renaming this global is a breaking change: ~649 notes and `_templates/Daily note template.md` reference it by name.

## Build

Source lives in `plugins/senaev-personal-tools/src/`. Built artifacts go to `.obsidian/plugins/senaev-personal-tools/`.

Run from the `plugins/senaev-personal-tools/` directory:

```bash
npm install       # first time only
npm run typecheck # TypeScript checks alone
npm run build     # typecheck → tests → src/main.ts → ../../.obsidian/plugins/senaev-personal-tools/main.js
npm test          # tests alone
```

`build` is `tsc -noEmit` → `npm test` → esbuild, so a type error or a failing test leaves the previous `main.js` in place. Typechecking runs first because the test bundler does not check types.

After changing plugin source or bundled configuration, run `npm run build`.

Do not commit plugin changes by default. Commit only when the user asks. When you commit, include the updated `.obsidian/plugins/senaev-personal-tools/main.js` in the same commit as the plugin changes. The vault tracks this installed build so Obsidian can load the updated plugin immediately.

Never edit `main.js` directly.

## Tests

Tests live next to the code they cover as `src/**/*.test.ts`, and use Node's built-in runner (`node:test` + `node:assert/strict`) — no test framework is installed.

`esbuild.tests.mjs` bundles each test into `tests-dist/` (git-ignored) before the runner starts, because the sources use extensionless imports that Node cannot resolve and some import JSON from `src/milestones/`. It clears `tests-dist/` first, so a deleted test cannot keep passing or failing from a stale bundle. The output directory is passed to Node as a quoted glob, since a bare directory argument is loaded as a module instead of being searched.

Only modules free of an Obsidian runtime import can be tested: the `obsidian` package ships types alone, so a module that imports a value from it cannot load outside Obsidian. `milestones.ts` qualifies because it uses `App` as a type only. Where a module does need `App`, tests pass a stub exposing just `vault.getMarkdownFiles` and `metadataCache.getFileCache`.

Calculated rules (`milestoneRule.test.ts`) are checked against every entry of `src/milestones/rule-test-vectors.json`: each real day of the vector's year is generated from a `Date`, and the days the rule matches must equal the expected list exactly. The last Sunday of November is also swept across 1990–2060: exactly one match per year, always a November Sunday between the 24th and the 30th. Days are generated rather than enumerated, so no invented day such as November 31st can roll over into December.

## Project overview

- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `src/main.ts` compiled to `main.js` and loaded by Obsidian.
- Required release artifacts: `main.js`, `manifest.json`, and optional `styles.css`.

## Environment & tooling

- Node.js: use current LTS (Node 18+ recommended).
- **Package manager: npm** (required for this sample - `package.json` defines npm scripts and dependencies).
- **Bundler: esbuild** (required for this sample - `esbuild.config.mjs` and build scripts depend on it). Alternative bundlers like Rollup or webpack are acceptable for other projects if they bundle all external dependencies into `main.js`.
- Types: `obsidian` type definitions.

**Note**: This sample project has specific technical dependencies on npm and esbuild. If you're creating a plugin from scratch, you can choose different tools, but you'll need to replace the build configuration accordingly.

### Install

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

## Linting

- ESLint is preconfigured with `eslint-plugin-obsidianmd` for Obsidian-specific rules.
- Run `npm run lint` to lint the project.
- `.github/workflows/plugin-checks.yml` checks only this plugin on every push and pull request: clean install, lint, TypeScript, tests, build, and committed build consistency.
- `manifest.json` is a symlink to the installed manifest in `.obsidian/plugins/senaev-personal-tools/`, so lint and version tooling share the canonical metadata.
- Node imports are allowed only in test files; test registrations explicitly use `void` because Node's runner manages their completion.

## File & folder conventions

- **Organize code into multiple files**: Split functionality across separate modules rather than putting everything in `main.ts`.
- Source lives in `src/`. Keep `main.ts` small and focused on plugin lifecycle (loading, unloading, registering commands).
- **Example file structure**:
    ```
    src/
      main.ts           # Plugin entry point, lifecycle management
      settings.ts       # Settings interface and defaults
      commands/         # Command implementations
        command1.ts
        command2.ts
      ui/              # UI components, modals, views
        modal.ts
        view.ts
      utils/           # Utility functions, helpers
        helpers.ts
        constants.ts
      types.ts         # TypeScript interfaces and types
    ```
- Do not commit `node_modules/`, `tests-dist/`, or other temporary build files.
- Keep the plugin small. Avoid large dependencies. Prefer browser-compatible packages.
- Generated output should be placed at the plugin root or `dist/` depending on your build setup. Release artifacts must end up at the top level of the plugin folder in the vault (`main.js`, `manifest.json`, `styles.css`).

## Manifest rules (`manifest.json`)

- Must include (non-exhaustive):
    - `id` (plugin ID; for local dev it should match the folder name)
    - `name`
    - `version` (Semantic Versioning `x.y.z`)
    - `minAppVersion`
    - `description`
    - `isDesktopOnly` (boolean)
    - Optional: `author`, `authorUrl`, `fundingUrl` (string or map)
- Never change `id` after release. Treat it as stable API.
- Keep `minAppVersion` accurate when using newer APIs.
- Canonical requirements are coded here: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Testing

- Manual install for testing: copy `main.js`, `manifest.json`, `styles.css` (if any) to:
    ```
    <Vault>/.obsidian/plugins/<plugin-id>/
    ```
- Reload Obsidian and enable the plugin in **Settings → Community plugins**.

## Commands & settings

- Any user-facing commands should be added via `this.addCommand(...)`.
- If the plugin has configuration, provide a settings tab and sensible defaults.
- Persist settings using `this.loadData()` / `this.saveData()`.
- Use stable command IDs; avoid renaming once released.

## Versioning & releases

- Bump `version` in `manifest.json` (SemVer) and update `versions.json` to map plugin version → minimum app version.
- Create a GitHub release whose tag exactly matches `manifest.json`'s `version`. Do not use a leading `v`.
- Attach `manifest.json`, `main.js`, and `styles.css` (if present) to the release as individual assets.
- After the initial release, follow the process to add/update your plugin in the community catalog as required.

## Security, privacy, and compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**. In particular:

- Default to local/offline operation. Only make network requests when essential to the feature.
- No hidden telemetry. If you collect optional analytics or call third-party services, require explicit opt-in and document clearly in `README.md` and in settings.
- Never execute remote code, fetch and eval scripts, or auto-update plugin code outside of normal releases.
- Minimize scope: read/write only what's necessary inside the vault. Do not access files outside the vault.
- Clearly disclose any external services used, data sent, and risks.
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented.
- Avoid deceptive patterns, ads, or spammy notifications.
- Register and clean up all DOM, app, and interval listeners using the provided `register*` helpers so the plugin unloads safely.

## UX & copy guidelines (for UI text, commands, settings)

- Prefer sentence case for headings, buttons, and titles.
- Use clear, action-oriented imperatives in step-by-step copy.
- Use **bold** to indicate literal UI labels. Prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Community plugins**.
- Keep in-app strings short, consistent, and free of jargon.

## Performance

- Keep startup light. Defer heavy work until needed.
- Avoid long-running tasks during `onload`; use lazy initialization.
- Batch disk access and avoid excessive vault scans.
- Debounce/throttle expensive operations in response to file system events.

## Coding conventions

- TypeScript with `"strict": true` preferred.
- **Keep `main.ts` minimal**: Focus only on plugin lifecycle (onload, onunload, addCommand calls). Delegate all feature logic to separate modules.
- **Split large files**: If any file exceeds ~200-300 lines, consider breaking it into smaller, focused modules.
- **Use clear module boundaries**: Each file should have a single, well-defined responsibility.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs if you want mobile compatibility; set `isDesktopOnly` accordingly.
- Prefer `async/await` over promise chains; handle errors gracefully.

## Mobile

- Where feasible, test on iOS and Android.
- Don't assume desktop-only behavior unless `isDesktopOnly` is `true`.
- Avoid large in-memory structures; be mindful of memory and storage constraints.

## Agent do/don't

**Do**

- Add commands with stable IDs (don't rename once released).
- Provide defaults and validation in settings.
- Write idempotent code paths so reload/unload doesn't leak listeners or intervals.
- Use `this.register*` helpers for everything that needs cleanup.

**Don't**

- Introduce network calls without an obvious user-facing reason and documentation.
- Ship features that require cloud services without clear disclosure and explicit opt-in.
- Store or transmit vault contents unless essential and consented.

## Common tasks

### Organize code across multiple files

**main.ts** (minimal, lifecycle only):

```ts
import { Plugin } from 'obsidian';
import { MySettings, DEFAULT_SETTINGS } from './settings';
import { registerCommands } from './commands';

export default class MyPlugin extends Plugin {
	settings!: MySettings;

	async onload() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MySettings>,
		);
		registerCommands(this);
	}
}
```

**settings.ts**:

```ts
export interface MySettings {
	enabled: boolean;
	apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
	enabled: true,
	apiKey: '',
};
```

**commands/index.ts**:

```ts
import { Plugin } from 'obsidian';
import { doSomething } from './my-command';

export function registerCommands(plugin: Plugin) {
	plugin.addCommand({
		id: 'do-something',
		name: 'Do something',
		callback: () => doSomething(plugin),
	});
}
```

### Add a command

```ts
this.addCommand({
	id: 'your-command-id',
	name: 'Do the thing',
	callback: () => this.doTheThing(),
});
```

### Persist settings

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MySettings>);
  await this.saveData(this.settings);
}
```

### Register listeners safely

```ts
this.registerEvent(
	this.app.workspace.on('file-open', (f) => {
		/* ... */
	}),
);
this.registerDomEvent(activeWindow, 'resize', () => {
	/* ... */
});
this.registerInterval(
	window.setInterval(() => {
		/* ... */
	}, 1000),
);
```

## Troubleshooting

- Plugin doesn't load after build: ensure `main.js` and `manifest.json` are at the top level of the plugin folder under `<Vault>/.obsidian/plugins/<plugin-id>/`.
- Build issues: if `main.js` is missing, run `npm run build` or `npm run dev` to compile your TypeScript source code.
- Commands not appearing: verify `addCommand` runs after `onload` and IDs are unique.
- Settings not persisting: ensure `loadData`/`saveData` are awaited and you re-render the UI after changes.
- Mobile-only issues: confirm you're not using desktop-only APIs; check `isDesktopOnly` and adjust.

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
