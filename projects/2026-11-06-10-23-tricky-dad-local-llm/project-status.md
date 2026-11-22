- [x] Deploy the Tricky Dad action registry and evaluate the home LLM for production commands.

## Stage

Local-model trial complete. After deployment tests, the user concluded that the available
home hardware could not deliver both the response speed and answer quality Tricky Dad needs.

## Completed

- PR #122 deployed the action registry and the local-model-first trial with OpenRouter fallback.
- PR #172 switched Tricky Dad to OpenRouter only. PR #173 assigned one action per source.
- A live Alisa shopping command succeeded with OpenRouter after those changes.
- PR #192 disabled the home model server and its deployment passed.

## Follow-up verification for the current setup

- If still unverified, check one shopping message in the Tricky Dad Telegram chat and one
  dated task in the Tasks Telegram chat. These checks cover the current one-action routing.
