# Code review rules

> Only read this file if you are an agent that does code review of a pull request (for example
> Codex on `@codex review`). Any other agent: ignore it, it is not a guide for writing code; the
> conventions are in [`AGENTS.md`](AGENTS.md).

## Secrets and sensitive data

- Flag every secret or piece of sensitive data in the change as P1: a token, key, password or
  personal data in code, configuration, logs, tests or messages, and any access opened wider than
  the change needs.

## Shared library

- For every utility the change adds or changes, check whether the same code already exists
  elsewhere in the repository. If it does, flag it as P1: move the code to `senaev-utils` and reuse
  it from there.
