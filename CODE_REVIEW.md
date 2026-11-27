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
  elsewhere in the repository. If it does, flag it as P5: move the code to `senaev-utils` and reuse
  it from there.

## Re-exports

- Flag every re-export the change adds as P5: `export { x } from './y'`, `export * from './y'`,
  or an import that is only exported again. Importers must import from the file that defines the
  symbol. Barrel `index` files that only re-export are the same.

## Tests

- Flag optional parameters. Make a parameter required, or remove it and use the value directly.
- Flag parameters that exist only for tests (a clock, a TTL, a dependency to swap). The code should use
  the real thing directly, and the test should mock it: timers with `vi.useFakeTimers()` and
  `vi.setSystemTime()`, modules with `vi.mock()`, functions with `vi.spyOn()`.
