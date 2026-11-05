# AGENTS.md — projects/

Create a project only at the user's explicit request. Each project is a folder with the
layout below. Apply this workflow only to new projects; do not rename or restructure
existing project folders.

## Folder naming

`YYYY-MM-DD-HH-mm-<short-slug>/` — use the folder creation date and time in UTC:
`HH` is the zero-padded 24-hour hour, `mm` is the zero-padded minute; the slug is 3–5 words.
For example: `2026-10-11-08-35-add-task-creation-time/`.
For an incident, name the symptom, not the cause (the cause is not known yet).

## Layout

```
YYYY-MM-DD-HH-mm-<slug>/
├── README.md                      # the main document of the project
├── project-status.md              # where the project is now
├── project-worklog.md             # decisions and finished stages, for the agent
├── YYYY-MM-DD-HH-mm-<slug>.md     # other documents, if any
├── assets/                        # images and diagrams that the documents link to
└── sources/                       # raw inputs: logs, config snapshots, notes, screenshots
```

Link other files from `README.md` by relative path. Give the files names without spaces.

## `README.md`

The main document of the project. Keep it current: when the plan or the facts change,
update the section — the history is in `project-worklog.md`. Structure:

1. `# YYYY-MM-DD — <title>`, then one line: what the task must achieve.
2. `## Goal` — what we want, or what is wrong. Paste errors and logs verbatim.
3. `## Context` — only the facts needed for this task. Link files by path; do not copy them.
4. `## Plan` — the steps, or for an incident the ranked hypotheses
   (each with the signal that confirms it and the fix).
5. `## Verification` — how to confirm the result end-to-end, from the user's side.
6. `## Result` — added at the end: what was done, the root cause if any, open points.

Skip a section when it does not apply. Keep each one short.

## `project-status.md`

Short, and shows the current state. Start with the status checkbox:
`- [ ] <one line: what the task must achieve>`. Then the stage, what is done, the open
questions, the next steps. Rewrite it, do not append to it. Check the box (`- [x]`) when
the task is done and `## Result` in `README.md` is written.

## `project-worklog.md`

For the agent, to get context back in a new session. Add a record only when a decision is
made or a part of the work is finished — highlights, not every step.

- Each record has a `## YYYY-MM-DD HH:MM UTC — <title>` header and says what was decided
  or finished, and why.
- Put the newest record first.
- Paste the output that supports the record verbatim (cut long output with `...`), and add
  1–2 sentences on what it shows.
- Update `project-status.md` in the same step.
- When the user pastes output that leads to a decision or finishes a step, write the record
  first, then reply in chat.

## Rules

- **Read `project-status.md` and the top of `project-worklog.md`** before you continue work
  on a project.
- **Read-only first** for cluster work and incidents: diagnose before any write, restart,
  or config change. Give exact, copy-pasteable commands; the user runs commands that
  change cluster state.
