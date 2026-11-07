- [x] Deploy an OpenCode Telegram bot integrated with the Obsidian vault (historical implementation).

## Stage

Completed in June 2026; direct vault access was intentionally superseded by later repository/vault isolation changes.

## Evidence

- Original README marks all steps in the final OpenCode + Telegram implementation as complete, including deployment and an end-to-end Telegram test.
- Current `opencode-serve.yaml` still deploys OpenCode and its Telegram bot.
- Later isolation work removed the vault mount from OpenCode; it now operates on Git repositories instead of having direct vault filesystem access. This is an architectural change, not an unfinished step in the historical project.
