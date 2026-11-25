# Worklog

## 2026-11-25 07:45 UTC — Verified on the pull request: warnings in the log, 0 annotations

A temporary commit (`4abe1656`, then removed) added an unused variable to
`obsidian-personal-tools/src/settings.ts` and to `senaev-utils/src/obsidianDailyNotes/ruleOccursOn.ts`.
Both lint jobs passed, with the warning in the log and no annotation:

```
check: completed success annotations=0
  31:7  warning  'unusedForAnnotationCheck' is assigned a value but never used  @typescript-eslint/no-unused-vars
check / Lint, Typecheck, Test, Syntax: success annotations=0
[lint]   37:7  warning  'unusedForAnnotationCheck' is assigned a value but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars
```

Before this change, the same kind of warning in the plugin gave annotations (the
`obsidianmd/validate-license` warnings on #305).

## 2026-11-25 07:15 UTC — Changed: disable ESLint annotations everywhere

The user changed the goal: no ESLint annotations at all, including the plugin. The branch was
reset to `main` (dropping the formatter and its temporary verification commit) and now removes
the `eslint-stylish` and `eslint-compact` matchers of `setup-node` in `check.yml` and
`obsidian-personal-tools.yml`. The owners come from `actions/setup-node@v6`:

```
.github/eslint-compact.json   "owner": "eslint-compact"
.github/eslint-stylish.json   "owner": "eslint-stylish"
.github/tsc.json              "owner": "tsc"
```

## 2026-11-25 07:10 UTC — First version: annotations for the root lint (replaced)

The first version added an ESLint formatter that wrote workflow commands to a file, printed by a
CI step after `simple-checks`. A temporary unused variable gave one annotation in CI:

```
success annotations=1
warning senaev-utils/src/obsidianDailyNotes/ruleOccursOn.ts:37-37 [@typescript-eslint/no-unused-vars] 'unusedForAnnotationCheck' is assigned a value but never used. Allowed unused vars must match /^_/u.
```

It showed why the root lint had no annotations: the `[lint] ` prefix of `concurrently`.

```
[lint] > eslint .
[lint] npm run lint stopped at 2026-11-24 22:34:26.517 after 46,808ms
```
