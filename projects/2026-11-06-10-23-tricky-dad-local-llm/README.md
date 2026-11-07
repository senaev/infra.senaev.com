# 2026-11-06 — tricky-dad on the home llm-server

Make tricky-dad easy to extend with new actions, and make it use the home `llm-server`
first, with OpenRouter as the LLM provider fallback.

## Goal

- tricky-dad must be able to do more than add items: for example, list items or add
  calendar events. A new action must be one new file, not changes in five places.
- tricky-dad sends its LLM requests to `llm-server` (Qwen3-4B on `senaev-media`). When
  `llm-server` does not answer, times out, or returns an invalid answer, the same request
  goes to OpenRouter.

## Context

- Entry points: the Tricky Dad and Tasks Telegram chats
  (`cluster-helper/src/trickyDad/processTrickyDadChatMessage.ts`) and the Alisa voice skill
  (`cluster-helper/src/trickyDad/handleAlisaRequest.ts`). Alisa answers at once with a funny
  phrase; the command runs in the background, and Telegram gets a message only on failure.
- Before this project, one OpenRouter call returned `{type: shopping|task|error, items,
  tasks, error}`, and an `if` chain wrote the result. Each new action needed changes in the
  prompt, the schema, the `if` chain, the result type and the report.
- `llm-server`: `http://llm-server:8080/v1/chat/completions` (OpenAI-compatible), already
  allowed for cluster-helper by its NetworkPolicy. It runs with `--parallel 1`, so its prompt
  cache keeps one prompt prefix. See
  [`2026-10-18-16-05-home-development-llm-server`](../2026-10-18-16-05-home-development-llm-server/README.md).

## Plan

1. **Action registry** (`cluster-helper/src/trickyDad/actions/`). An action has a type,
   "when to use" prompt lines, argument prompt lines, argument JSON schema properties,
   `parseArgs()` (validation) and `fromRawCommand()` (command fallback). Now: `add_shopping_items`,
   `add_tasks`.
2. **Sources** (`trickyDad/TrickyDadSource.ts`): each source has its allowed actions and its
   command fallback action. The Obsidian Tasks chat allows only `add_tasks`, so the model only fills
   the task arguments.
3. **One LLM call** (`trickyDad/planTrickyDadCommand.ts`): for a source with several
   actions, the schema is `{actions: [anyOf one variant per action], error}`. One message can
   now do several actions. The date is the last line of the system prompt, so the rest stays
   the same prefix for the llm-server prompt cache.
4. **LLM provider fallback** (`cluster-helper/src/llm/`): `callLlmJson()` asks `llm-server` (90 s
   timeout, `max_tokens` 1024), then OpenRouter. A failed request, invalid JSON, or arguments
   that `parseArgs()` rejects give the request to the next provider. `LLM_SERVER_URL` is set by
   Helm only when `llmServer.enabled`.
5. **Command fallback**: when no provider gives a usable answer, the raw command goes to the
   command fallback action of the source. Before, an OpenRouter error lost the command.
6. **Report**: the LLM attempts (`llm-server 90000ms ❌ → openrouter 900ms ✅`), each
   action and its time, and all errors.
7. Next actions (separate PRs): `list_shopping_items`, calendar events.

## Verification

After the deploy:

1. In the Tricky Dad chat, send "купи хлеб и молоко". The report must show
   `🛒 add_shopping_items` and `🤖 LLM: llm-server …ms ✅`.
2. Send "папа, завтра позвони в банк". The task must appear in the vault with a due date,
   and the report must come to both chats.
3. Send "купи хлеб, а папа пусть позвонит в банк". Both actions must run.
4. In the Obsidian Tasks chat, send any task. Only `add_tasks` may run.
5. Scale llm-server to 0 and send a message. The report must show
   `llm-server … ❌ → openrouter … ✅`. Scale it back to 1.
6. Ask Alisa to add an item. It must appear in the grocery list, with no Telegram message.
