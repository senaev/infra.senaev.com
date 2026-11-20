# Worklog

## 2026-11-20 15:00 UTC — Project created; rules for infra.senaev.com

The user asked for a separate project for the Codex code review on GitHub, and to start with
infra.senaev.com only (of about 40 non-archived repositories). The built-in review can be
customized only by the `## Code Review Rules` of `AGENTS.md`, a focus in the `@codex review`
comment, and the trigger settings; it flags only P0 and P1 issues. So the rules list only what can
break production, lose data, leak a secret or cut access to a node, each pointing to the section of
`AGENTS.md` with the details.
