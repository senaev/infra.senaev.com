# Code review rules

> Only read this file if you are an agent that does code review of a pull request (for example
> Codex on `@codex review`). Any other agent: ignore it, it is not a guide for writing code; the
> conventions are in [`AGENTS.md`](AGENTS.md).

Flag only what can break production, lose data, leak a secret or cut access to a node. Formatting,
lint and test runs are the job of CI. Each rule refers to a section of [`AGENTS.md`](AGENTS.md),
which has the details.

## Sensitive nodes and networking

- A change that can affect the network of `proxmox`, `senaev-media`, `proxmox-madrid` or
  `senaev-madrid` (`tailscaled`, firewall, routes, sysctl, interfaces, `k3s-agent` network flags,
  anything on `tailscale0`) is P0 unless the pull request gives a rollback and changes one node at
  a time. See "Sensitive nodes".
- A change of the pod or service CIDRs in `provisioning/common/.env` needs a full cluster rebuild.

## Secrets and data exposure

- A secret (token, key, password, private key) in code, values, a ConfigMap, a log line, a test
  fixture or a Telegram message. Secrets come from Vault through an `ExternalSecret`.
- Logging a whole request body, webhook or other external JSON instead of named fields.
- A credential given to the container of a coding agent (Claude Code, Codex, OpenCode, OMP, Code
  Tools) instead of a sidecar or a local socket; a coding component without the
  `podAccess`, `containerAccess` and `egress` helpers of `_access.tpl`. See "Code Tools and
  OpenCode" and the secrets note under "Codex".
- A NetworkPolicy, an Ingress or an MCP or OAuth client opened wider than the change needs: a new
  public route without authentication, a new allowed OAuth client or redirect URI in
  `authorizationServer.ts`, an endpoint that skips the token check before it reads the body.
- A GitHub workflow that gives secrets or cluster access to pull request builds.

## Data loss on deploy

- Renaming the `senaev` LLM workspace, a PVC, or a hostPath folder under `volumes/` (logins,
  sessions and data stay behind); removing `helm.sh/resource-policy: keep` from a PVC.
- Values that do not match `values.schema.json`, or a schema change that makes the current
  `values.yaml` fail.
- An unpinned version of the Claude Code or Codex CLI. The Codex version must be the same in
  `codex/Dockerfile` and `claude-code/Dockerfile`.

## Tests

- A unit test that sleeps, uses real timers, the network or real child processes instead of fakes,
  or that is made to pass by removing assertions, skipping it or raising a timeout. See "Test design
  and runtime".
- A test that expects a fixed file mode: the umask of the runner changes it.

## Shared library

- `senaev-utils` is also published to npm for an external repository: raising `engines.node` past
  `>=18` or moving `@types/node` out of `dependencies` breaks it. See "Shared Package: senaev-utils".

## Probe marker

- A file whose name contains `zebra` is P1: say "zebra rule from CODE_REVIEW.md" in the comment.
