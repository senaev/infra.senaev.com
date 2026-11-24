# 2026-11-20 — Codex code review for the repositories

- [x] Codex reviews the pull requests of infra.senaev.com on `@codex review`, with review rules written for the repository.

## Goal

- Codex reviews the pull requests of infra.senaev.com on `@codex review`; the agent that opens a pull request asks for it.
- The repository has its own review rules, so the review checks what matters there.
- First infra.senaev.com; the other repositories after the review quality is checked (decision of the user, 2026-11-20).

## Context

- Docs: https://learn.chatgpt.com/docs/third-party/github and https://learn.chatgpt.com/use-cases/github-code-reviews.
- Setup: the GitHub app "ChatGPT Codex Connector" installed on the repository (only infra.senaev.com is selected), and code review turned on for it at `chatgpt.com/settings/code-review`.
- `@codex review` in a pull request comment starts a review, also on a draft; `@codex review for <focus>` adds a focus for one review. The review takes under a minute.
- Codex posts a GitHub review with the state "commented": it does not approve or request changes, so it cannot block a merge. It flags only P0 and P1 issues in GitHub.
- Rules: Codex reads `AGENTS.md` and follows links from it. Ours are in `CODE_REVIEW.md`, linked from `### Code Review Rules` under `## Code Review` in `AGENTS.md`; the link works under a `###` heading too.
- The automatic review does not start on the user's plan (Plus): saving "Review: All PRs" fails with `Reviewing all PRs is not available on this plan`, and no probe pull request got an automatic review.
- This runs in OpenAI's cloud, not in the cluster; it is separate from the Codex container of [`2026-11-19-21-17-codex-remote-control`](../2026-11-19-21-17-codex-remote-control/README.md).

## Plan

1. ✅ Rules for infra.senaev.com in `CODE_REVIEW.md` (PR [#249](https://github.com/senaev/infra.senaev.com/pull/249)): every secret or piece of sensitive data is P1; a utility duplicated in the repository is P5 (move it to `senaev-utils`).
2. ✅ The user connected the repository and turned on code review (2026-11-22; app reinstalled on 2026-11-24).
3. ✅ Test on probe pull requests (all closed): `@codex review` works, and Codex follows the rules in `CODE_REVIEW.md`. The automatic review does not start (plan limit), so `AGENTS.md` tells agents to create pull requests as drafts and comment `@codex review` when they open one, and when the user asks.
4. ➡️ Not done: tune the rules after a few real reviews.
5. ➡️ Not done: the other repositories (obsidian-vault, dotfiles, senaev.com, supabase-list-notes, rclone-share, senaev-opencode-config, mitmproxy).

## Verification

- ✅ `@codex review` on a pull request in infra.senaev.com gets a review within a minute.
- ✅ A probe pull request that broke a rule got a P1 that names the rule from `CODE_REVIEW.md`.

## Result

Done on 2026-11-24: Codex reviews infra.senaev.com on request, with the rules of `CODE_REVIEW.md`; agents open pull requests as drafts and ask for the review. Open points: no automatic review on the current plan; the rules are not tuned on real reviews yet; the other repositories are not set up.
