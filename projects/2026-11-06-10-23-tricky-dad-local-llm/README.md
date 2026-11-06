# 2026-11-06 — tricky-dad on the home llm-server

Make tricky-dad use the home `llm-server` first, and OpenRouter only as a fallback.

## Goal

tricky-dad sends its LLM requests to `llm-server` (Qwen3-4B on `senaev-media`). When
`llm-server` does not answer, times out, or returns an invalid answer, the same request
goes to OpenRouter.

## Context

- tricky-dad lives in cluster-helper: `cluster-helper/src/processTrickyDadChatMessage.ts`,
  `cluster-helper/src/sendTrickyDadReport.ts`, `cluster-helper/src/TrickyDadSource.ts`.
  OpenRouter calls: `cluster-helper/src/openrouter.ts`.
- `llm-server`: `http://llm-server:8080/v1/chat/completions` (OpenAI-compatible), already
  allowed for cluster-helper. See
  [`2026-10-18-16-05-home-development-llm-server`](../2026-10-18-16-05-home-development-llm-server/README.md).
