# AGENTS.md — tasks/

Each file is the working log of one task: a feature, a change, a migration, an incident,
or an investigation. The file is the source of truth; the chat is ephemeral.

## File naming

`YYYY-MM-DD-<short-slug>.md` — the date is when the work started; the slug is 3–5 words.
For an incident, name the symptom, not the cause (the cause is not known yet).

## Document structure

1. `# YYYY-MM-DD — <title>`
2. `## Goal` — what we want, or what is wrong. Paste errors and logs verbatim.
3. `## Context` — only the facts needed for this task. Link files by path; do not copy them.
4. `## Plan` — the steps, or for an incident the ranked hypotheses
   (each with the signal that confirms it and the fix).
5. `## Verification` — how to confirm the result end-to-end, from the user's side.
6. `## Findings` — dated log of the work, appended as it goes.
7. `## Result` — added at the end: what was done, the root cause if any, open points.

Skip a section when it does not apply. Keep each one short.

## Rules

- **Update the file during the session.** When the user pastes output, or a step is done,
  append it under `## Findings` first, then reply in chat.
- **Append, do not rewrite.** Date each entry (`### YYYY-MM-DD — <step>`). To correct an
  earlier section, annotate it.
- **Paste output verbatim** (cut long output with `...`), and add 1–2 sentences on what it shows.
- **Read-only first** for cluster work and incidents: diagnose before any write, restart,
  or config change. Give exact, copy-pasteable commands; the user runs commands that
  change cluster state.
