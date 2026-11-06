# Worklog

## 2026-11-06 12:35 UTC — Action registry and provider chain implemented

The user asked to make tricky-dad extensible (list items, calendar, other actions) before
the switch to llm-server, and approved this design:

- one file for each action (`trickyDad/actions/`), with its prompt lines, schema
  properties, validation and fallback;
- allowed actions for each source; a source with one action skips the choice;
- one LLM call with an `anyOf` schema, not native tool calling: one round trip, works the
  same on OpenRouter and llama.cpp (grammar), and keeps one prompt prefix in the llm-server
  cache (`--parallel 1`);
- `callLlmJson()` tries llm-server, then OpenRouter; validation errors also fall back;
- when no provider answers, the raw command goes to the fallback action (before, an
  OpenRouter error lost it).

Removed the dead `parseTaskMessageWithOpenRouter.ts`. Not tested against the real models
yet: there is no local access to llm-server or the OpenRouter key.

## 2026-11-06 10:23 UTC — Project created

Created at the user's request as a follow-up of the llm-server project. Only the idea is
written down.
