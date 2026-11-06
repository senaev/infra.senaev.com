# 2026-11-06 — Personal LLM connector

One connector of my own, through which I request any LLM, including the home `llm-server`.

## Goal

A single endpoint and a single list of models. When I add a new LLM to it, the model
appears automatically in my harness (OpenCode) and my other interfaces, with no change
in each client.

## Context

- Home model: `llm-server` (llama.cpp, OpenAI-compatible API). See
  [`2026-10-18-16-05-home-development-llm-server`](../2026-10-18-16-05-home-development-llm-server/README.md).
- cluster-helper already has a provider chain (llm-server, then OpenRouter):
  `cluster-helper/src/llm/`.
