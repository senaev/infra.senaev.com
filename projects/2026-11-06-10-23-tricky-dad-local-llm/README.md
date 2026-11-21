# 2026-11-06 — tricky-dad on the home llm-server

Make Tricky Dad easier to extend and evaluate whether the home LLM can handle its commands.

## Goal

- Give each action its own prompt, schema, validation, and execution logic.
- Try Qwen3-4B on `senaev-media` first and use OpenRouter when the local model cannot
  produce a usable answer.

## Context

- The [source configuration](../../cluster-helper/src/trickyDad/TrickyDadSource.ts) assigns
  shopping to the Tricky Dad Telegram chat and Alisa, and tasks to the Tasks Telegram chat.
- Each source has one action. OpenRouter extracts that action's arguments. If it returns
  no usable answer, Tricky Dad passes the raw command to that same action.
- Hardware and model experiments are recorded in the
  [home LLM server project](../2026-10-18-16-05-home-development-llm-server/README.md).

## Verification

A [live Alisa request](../2026-11-13-13-16-remove-secrets-from-paths/project-worklog.md) used
OpenRouter and completed `add_shopping_items` on the new webhook. A live check of the
current Telegram paths would confirm that the Tricky Dad chat adds a shopping item and
that the Tasks chat adds a task with its due date to the vault.

## Result

[PR #122](https://github.com/senaev/infra.senaev.com/pull/122/changes) deployed the action
registry and the home-model-first trial. After testing the deployment, the user concluded
that the available home hardware could not run a model that met both Tricky Dad's speed
and answer-quality needs.

[PR #172](https://github.com/senaev/infra.senaev.com/pull/172/changes) switched Tricky Dad to
OpenRouter only. [PR #173](https://github.com/senaev/infra.senaev.com/pull/173/changes) limited
each source to one action. [PR #192](https://github.com/senaev/infra.senaev.com/pull/192/changes)
disabled the home model server. The local-model trial is complete. Shopping-list lookup
and calendar actions remain separate feature ideas.
