- [ ] Verify the deployed Tricky Dad action registry and home llm-server-first provider chain across the planned end-to-end scenarios.

## Stage

PR #122 merged on 2026-11-07; implementation deployed. Partial production acceptance verified, full matrix remains open.

## Completed

- Action registry, source-specific allowed actions and fallback provider implementation are in `main`.
- Alisa shopping-list command reached production and the `add_shopping_items` action finished successfully.
- The same request exercised llm-server error handling and fallback to OpenRouter, as seen in Datadog logs on 2026-11-07.

## Remaining verification

- Confirm native llm-server success, task due dates and task/chat routing, multi-action command handling, and the Tasks-only source via the original README acceptance tests.
- Separate follow-ups: `list_shopping_items` and calendar actions are outside the original implementation.
