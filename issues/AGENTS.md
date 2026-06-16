# AGENTS.md — issues/

This folder contains working debug logs for infrastructure incidents and investigations.

## Purpose

Each file is a **single living document** for one incident. It starts with a structured
diagnosis plan and grows as the investigation proceeds — commands run, outputs pasted,
hypotheses confirmed or refuted, fixes applied. The file is the source of truth; the
chat conversation is ephemeral.

## File naming

`YYYY-MM-DD-<short-slug>.md` — date is when the investigation started, slug is
3–5 words describing the symptom (not the cause, since the cause is unknown at the time).

Examples:
- `2026-06-10-debug-vpn-connection.md`
- `2026-06-16-prowlarr-sqlite-readonly-empty-search.md`

## Document structure

Every issue file follows this structure (in order):

### 1. Title — `# YYYY-MM-DD — <symptom>`

### 2. Preamble blockquote
```
> This file is the working log for the investigation. All findings, command outputs,
> screenshots, hypotheses confirmed/refuted, and the eventual fix must be appended to
> this file as we go — so the whole debug session lives in one place and is searchable later.
>
> Format: append new dated sections under ## Findings as work proceeds. Don't rewrite
> earlier sections — annotate them.
```

### 3. `## Symptom`
One paragraph: what the user observes. Paste raw log lines, error messages, or HTTP
responses verbatim — don't paraphrase.

### 4. `## Context (architecture refresher)`
The minimal architecture facts needed to interpret the symptom. Reference `AGENTS.md`,
`values.yaml`, or other files by path rather than duplicating content.

### 5. `## Hypotheses, ranked`
List hypotheses from most to least likely. Each entry must include:
- Short label in bold: `**(A) Name**`
- One sentence explaining why this hypothesis fits the symptom
- `Signal:` — what a positive result looks like in the diagnostic data
- `Fix:` — the concrete remediation if this hypothesis is confirmed

### 6. `## Collaboration model`
Explain that Claude proposes commands and the user runs them.
All commands in the first round must be **read-only** (no writes, no restarts) until the
fault is localised. Repeat this constraint explicitly so future agents don't skip it.

### 7. `## Round N diagnostic commands`
A numbered bash code block with copy-pasteable commands. Follow with a table mapping
each command's result to a hypothesis. Keep commands self-contained (no unexplained
env vars).

### 8. `## Fix options (pending Round N output)`
List the specific fix command for each hypothesis. Gate each fix on the Round N output —
do not propose fixes before the fault is localised.

### 9. `## Verification`
How to confirm the fix worked end-to-end (not just "no errors" — include a user-facing
test, e.g. "send a search query and expect results").

### 10. `## Findings`
Empty section with `*(append results below)*` placeholder. All actual investigation
output goes here in dated subsections appended during the session.

## Writing rules

- **Never rewrite earlier sections** — only append under `## Findings`.
- **Paste outputs verbatim** — don't summarise command output; paste the actual text.
  Truncate with `...` if it's very long, but keep the key lines.
- **Date every finding** — `### YYYY-MM-DD — Round N results` or `### YYYY-MM-DD HH:MM`.
- **Interpret immediately** — each pasted output block should be followed by 1–2 sentences
  of interpretation: what does this confirm or refute?
- **One hypothesis per finding** — state which hypothesis each result supports or kills.
- **Add a `## Resolution` section** when the fix is confirmed — include root cause, fix
  command, and result. If the fix didn't work, annotate the fix option with "did not help"
  and move to the next hypothesis.

## MANDATORY: update the issue file during the session

**Every time the user pastes command output, Claude MUST immediately append it to the
issue file under `## Findings` before responding.** Do not wait until the end of the
session — the chat is ephemeral, the file is not.

Checklist after each user message with command output:
1. `Edit` the issue file — append the output and interpretation under `## Findings`.
2. Then respond to the user in chat.

When the fix is applied, append a `### Fix applied — YYYY-MM-DD` subsection with the
exact command used and the result. When the investigation is complete, append a
`## Resolution` section summarising root cause, fix, and any open questions.

## Collaboration model (for agents)

You propose; the user runs. Never run `kubectl exec`, SSH, or any command that modifies
cluster state yourself. Provide exact, copy-pasteable commands. Wait for the user to
paste output before proposing the next step or any fix.

**Read-only until localised.** The first round of commands must be non-destructive
(get, logs, exec with read-only operations). Only propose writes, restarts, or
config changes after a specific hypothesis is confirmed by the diagnostic data.
