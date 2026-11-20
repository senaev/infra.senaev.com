# 2026-11-20 — Codex code review for the repositories

Turn on the built-in Codex code review on GitHub, with review rules written for each repository, starting with infra.senaev.com.

## Goal

- Codex reviews the pull requests of the repositories by itself, and on `@codex review`.
- Each repository has its own `## Code Review Rules` in its `AGENTS.md`, so the review checks what can really break there.
- First infra.senaev.com; the other repositories after the review quality is checked (decision of the user, 2026-11-20).

## Context

- Docs: https://learn.chatgpt.com/docs/third-party/github and https://learn.chatgpt.com/use-cases/github-code-reviews.
- Codex cloud must be set up for the repository; then code review is turned on per repository at `chatgpt.com/settings/code-review`. Automatic review ("Review trigger") needs push or admin permission on the repository.
- `@codex review` in a pull request comment starts a review; `@codex review for <focus>` adds a focus for one review; `@codex security review` asks for a security review (research preview).
- Codex flags only P0 and P1 issues in GitHub. The docs do not say that this can be changed.
- Rules: a `## Code Review Rules` section in the `AGENTS.md` closest to the code they govern, grouped by `###` headings. Codex applies the root rules and the more specific ones for each changed file.
- Not documented: which plans include it (the user has Plus), the usage limits, whether new pushes to a pull request trigger a new review, draft pull requests, the model.
- This runs in OpenAI's cloud, not in the cluster; it is separate from the Codex container of [`2026-11-19-21-17-codex-remote-control`](../2026-11-19-21-17-codex-remote-control/README.md).

## Plan

1. ⏳ Rules for infra.senaev.com: `## Code Review Rules` in the root `AGENTS.md`, from the conventions already there (sensitive nodes, secrets, data loss on deploy, tests, the published library). One PR.
2. The user: connect infra.senaev.com to Codex cloud (chatgpt.com/codex), then turn on code review for it at `chatgpt.com/settings/code-review`. Note what the plan allows and the "Review trigger" options.
3. Test: `@codex review` on an open pull request, and the automatic review on a new one. Check that the review follows the rules, and what a new push does.
4. Tune the rules after a few reviews (too noisy, or missing real problems).
5. The other repositories: pick the next ones from the active list (obsidian-vault, dotfiles, senaev.com, supabase-list-notes, rclone-share, senaev-opencode-config, mitmproxy), write their rules, turn the review on.

## Verification

- A pull request in infra.senaev.com gets a Codex review with no comment, and on `@codex review`.
- A pull request that breaks a rule on purpose (for example, a secret in a test fixture, in a draft branch that is closed afterwards) gets a P0 or P1 comment that names the rule.
