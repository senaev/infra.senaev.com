- [ ] tricky-dad has an action registry, and uses the home llm-server first and OpenRouter as the LLM provider fallback

Stage: implemented in a PR, not deployed yet.

Done:
- Action registry, source configs, one LLM call with a union schema, provider chain
  (llm-server → OpenRouter), command fallback that saves the raw command, new report. Unit tests.

Open questions:
- How well Qwen3-4B follows the multi-action prompt. Check with the verification steps in
  `README.md` after the deploy.
- Which calendar the calendar action must use.

Next: merge the PR, run the verification steps, then add `list_shopping_items`.
