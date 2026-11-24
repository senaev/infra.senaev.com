# Worklog

## 2026-11-24 21:25 UTC — Project closed

PR #249 merged (`6034b06`). The user decided the final shape of the rules and of the agent
instructions:

- `CODE_REVIEW.md`: every secret or piece of sensitive data is P1; a duplicated utility is P5 (move
  it to `senaev-utils`). The rules about sensitive nodes, data loss on deploy, tests and the npm
  compatibility of `senaev-utils` were removed. Codex shows only P0 and P1 in GitHub, so the P5
  rule does not appear in reviews.
- `AGENTS.md`: one `## Code Review` chapter with `### Code Review Rules` (the link to
  `CODE_REVIEW.md`) and `### Codex code review` (create pull requests as drafts; comment
  `@codex review` when opening one and when the user asks).

A probe (#301, closed) checked that Codex still follows the link under the `###` heading:

```
P1  Remove or rename the zebra probe file
The new `zebra.ts` file triggers the zebra rule from CODE_REVIEW.md ...
```

Not done: tuning the rules on real reviews, and the other repositories.

## 2026-11-24 20:45 UTC — Automatic review not available; review on request

The automatic review never started: seven probe pull requests (#282, #283, #294, #297, #298, #299,
#300, all closed) with the repository toggle on, the trigger "On PR open", and the GitHub app
reinstalled with only infra.senaev.com selected. Saving "Review: All PRs" fails (from the browser
devtools):

```
{detail: "Reviewing all PRs is not available on this plan"}
```

`@codex review` works every time, in under a minute. So agents ask for the review themselves.

## 2026-11-22 15:30 UTC — Rules moved to CODE_REVIEW.md

The user asked to keep the rules out of `AGENTS.md`, which every agent loads. The rules are now in
the root `CODE_REVIEW.md`, which starts with a note that only an agent doing a code review reads
it; `AGENTS.md` keeps only that note with the link. Probes (#273, #278, closed): before the move,
P1s for a sleeping unit test and a realistic bot token in a fixture; after the move, a marker rule
that exists only in `CODE_REVIEW.md` was applied ("zebra rule from CODE_REVIEW.md"), so Codex
follows the link.

## 2026-11-20 15:00 UTC — Project created; rules for infra.senaev.com

The user asked for a separate project for the Codex code review on GitHub, and to start with
infra.senaev.com only (of about 40 non-archived repositories). The built-in review can be
customized only by the `## Code Review Rules` of `AGENTS.md`, a focus in the `@codex review`
comment, and the trigger settings; it flags only P0 and P1 issues.
