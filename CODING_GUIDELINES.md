# Coding guidelines

## Secrets and sensitive data

- Keep secrets and sensitive data out of code, checked-in configuration, logs, tests, and
  messages. This includes tokens, private keys, passwords, and personal data.
- Limit access to what the change needs.

## Shared library

- Check `senaev-utils` before writing a new utility. Reuse an existing helper if it does what
  you need.

## Imports and exports

- Keep exports with their definitions. Import symbols directly from the files that define them.

## Early exits

- Prefer early exits that simplify control flow, such as guard clauses that reduce nesting.

## Function parameters

- Prefer required parameters.
- Keep production function parameters limited to what production callers need. Mock
  dependencies such as timers in tests.
