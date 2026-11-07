- [x] Give OpenCode access to persistent, cloned Git repositories.

## Stage

Implemented and deployed, verified against current infrastructure configuration.

## Evidence

- Current `opencode-serve.yaml` contains `git-init`, the persistent `opencode-telegram-git` PVC and `/projects/git` mounts for OpenCode and its Telegram bot.
- Code Tools successfully accesses checked-out Git repositories on the shared infrastructure.

## Note

The original deployment-verification checklist in README was never checked off line by line; this audit is based on the current deployed architecture and working repository tooling rather than claiming those historical commands were rerun.
