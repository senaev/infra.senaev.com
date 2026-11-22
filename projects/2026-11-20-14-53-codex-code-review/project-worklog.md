# Worklog

## 2026-11-20 15:00 UTC — Project created; rules for infra.senaev.com

The user asked for a separate project for the Codex code review on GitHub, and to start with
infra.senaev.com only (of about 40 non-archived repositories). The built-in review can be
customized only by the `## Code Review Rules` of `AGENTS.md`, a focus in the `@codex review`
comment, and the trigger settings; it flags only P0 and P1 issues. So the rules list only what can
break production, lose data, leak a secret or cut access to a node, each pointing to the section of
`AGENTS.md` with the details.

## 2026-11-22 — Rules moved to CODE_REVIEW.md

The user asked to keep the rules out of `AGENTS.md`, which every agent loads. The rules are now in
the root `CODE_REVIEW.md`, which starts with a note that only an agent doing a code review reads
it. The `## Code Review Rules` section of `AGENTS.md` keeps only the same note with the link, so
Codex still finds it. Before the move, a probe pull request (closed) got a P1 for a sleeping unit
test and a P1 for a realistic bot token in a fixture, each citing the rule. Probe again after the
move to check that Codex follows the link.
