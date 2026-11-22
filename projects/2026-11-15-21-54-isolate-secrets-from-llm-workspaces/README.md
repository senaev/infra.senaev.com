# 2026-11-15 — Isolate sensitive secrets from LLM workspaces

Agents in the LLM workspaces can use the credentials they need but cannot read them, so they cannot copy them out of the pod.

## Goal

Agents run commands without approvals as root: Claude Code (`bypassPermissions`), OMP, OpenCode
and the Code Tools commands. An agent can read every file and env var in its own container,
and can send what it reads anywhere through public egress, a commit or a log. Today the
container where the agent runs holds the SSH key, the GitHub token and the LLM API keys.

The aim is to move each secret into a container where no agent runs, such as a sidecar or a
proxy, and to give the agent container only a way to use it: a socket, or a local endpoint
that adds the credential. Where that is not possible, make the secret narrow and short-lived.

What this does not prevent: an agent can still *use* what it is given. For example, it can push
with the SSH key while the pod runs. Limiting that means narrow scopes: per-workspace keys,
fine-grained tokens and repository rules.

## Context

- Templates: `provisioning/helm/senaev-com/templates/llm-workspace/`. Values: `llmWorkspaces`
  in `provisioning/helm/senaev-com/values.yaml`. Vault properties are under `senaev-com-kv`.
- Each component has its own `<name>-<component>-env` Secret with only its keys
  (`_secrets.tpl`). Containers of a pod do not share processes (no `shareProcessNamespace`).
  `containerAccess` drops all capabilities and `podAccess` disables the service-account
  token, so a container cannot read another container's env, files or memory.
- Already separated: the Telegram bot tokens run in containers without an agent
  (`telegram-login` in Claude Code, `opencode-telegram-bot` in OpenCode), and the OMP htpasswd
  is only used by a Traefik middleware.
- SSH key path fix for Claude Code: PR #209 (key mounted in `/root/.ssh`, where ssh looks
  for it as root).
- k3s is `v1.36.5+k3s1` (`provisioning/common/.env`), so native sidecars (init containers
  with `restartPolicy: Always`) are available.

### Secret inventory

"Agent container" is where an agent runs and can read the secret, as on `main` before PR #210.

| Vault property | Workspace | Agent containers that hold it | How | Used by | Plan |
|---|---|---|---|---|---|
| `TELEGRAM_OPENCODE_SSH_PRIVATE_KEY` | senaev | `claude-code`, `opencode-serve`, `code-tools`, `omp-web` | file in `/root/.ssh` (`git-init` copies it for OpenCode and Code Tools) | git over SSH | **Now:** ssh-agent sidecar (PR #210). Future task: one key per component, rotate |
| `GH_TOKEN` | senaev | `claude-code`, `opencode-serve`, `code-tools`, `omp-web` | env `GH_TOKEN` | `gh`, HTTPS git, GitHub API | Future task: fine-grained token limited to the repositories; then decide on a proxy |
| `OPENROUTER_API_KEY` (connector) | senaev, galkin | `opencode-serve`, `omp-web` | env; OMP `models.yml` names the env var | the harness, for the model calls | Future task: local proxy that adds the key |
| `GROQ_API_KEY` (speech to text) | senaev, galkin | `omp-web` (`OMP_WEB_STT_KEY`) | env | OMP voice input | Future task: same proxy |
| `GROQ_API_KEY` (speech to text) | senaev | — (`opencode-telegram-bot`, no agent) | env | bot voice input | Keep. Future task: check the shared `opencode-data` folder |
| `OPENCODE_PASSWORD` | senaev | `opencode-serve` | env | OpenCode's own web authentication | Future task: authenticate at a proxy or Traefik in front |
| `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS` | senaev | `code-tools` | env | Code Tools checks cluster-helper calls | Future task: check the token in a proxy in front |
| `TG_TOKEN_OPENCODE_SENAEV_BOT`, `TG_SENAEV_USER_ID` | senaev | — (`opencode-telegram-bot`) | env | the OpenCode bot | Already separated |
| `TG_TOKEN_CLAUDE_HELPER_BOT`, `TG_SENAEV_USER_ID` | senaev | — (`telegram-login`) | env | the Claude login bot | Already separated |
| `OMP_WEB_HTPASSWD_HASH_WITH_USERNAME`, `GALKIN_OMP_WEB_HTPASSWD_HASH_WITH_USERNAME` | senaev, galkin | — (Traefik middleware) | Secret for Traefik | OMP basic auth | Already separated |

Not in Vault, readable by the agent, and needed by the harness itself. Accepted for now:

- The claude.ai login of Claude Code in `HOME` (`/k3s-cluster/volumes/claude-code`).
- MCP OAuth tokens: Claude Code in `~/.claude/.credentials.json` in `HOME`, OpenCode in
  `/k3s-cluster/volumes/opencode-data`. Their own project:
  [`2026-11-16-20-55-isolate-mcp-credentials`](../2026-11-16-20-55-isolate-mcp-credentials/README.md).
- OpenCode state in `/k3s-cluster/volumes/opencode-data`. The bot folder
  `/root/.config/opencode-telegram-bot` is on the same node folder, so check what the bot
  stores there.
- OMP state in its `state` PVC.

## Plan

### Now: SSH key (PR #210)

A shared helper, `templates/llm-workspace/_ssh-agent.tpl`, used by all four agent containers
that had the key: `claude-code`, `opencode-serve`, `code-tools` and `omp-web` (OMP only when
the workspace has `git`; galkin has none).

- A native sidecar `ssh-agent` (image `alpine/git`, which has `ssh-agent` and `ssh-add`)
  mounts the key, starts `ssh-agent -D` on `/ssh-agent/agent.sock` and loads the key. Its
  startup probe (`ssh-add -l`) holds the agent container until the key is loaded.
- The socket folder is an in-memory `emptyDir`, mounted read-only in the agent container,
  with `SSH_AUTH_SOCK`.
- The `git-init` init containers of OpenCode and Code Tools, which copied the key into
  `/root/.ssh` and ran `ssh-keyscan`, are removed. Their images now have GitHub's published
  host keys in `/etc/ssh/ssh_known_hosts` (from `api.github.com/meta`), as the Claude Code and
  OMP images already do.

### Future tasks

- [ ] **One SSH key per component**, as deploy keys or keys of a limited account. Rotate
  `TELEGRAM_OPENCODE_SSH_PRIVATE_KEY`: it was readable by agents. The user creates the keys in
  GitHub and Vault.
- [ ] **`GH_TOKEN`:** replace it with a fine-grained token limited to the repositories and
  permissions that the workspaces need. Then decide whether a proxy for `api.github.com` is
  worth it: `gh` and HTTPS git need the token in the process.
- [ ] **LLM keys (`OPENROUTER_API_KEY`) and speech-to-text keys (`GROQ_API_KEY`)** in OpenCode
  and OMP: a local proxy sidecar (nginx, as `mcp-oauth-proxy` already is) that adds
  `Authorization` for `openrouter.ai` and `api.groq.com`. The harness gets `baseUrl`
  `http://127.0.0.1:<port>` and a dummy key. Check that OMP and OpenCode accept a dummy key.
- [ ] **`OPENCODE_PASSWORD`:** authenticate at a proxy or Traefik in front of OpenCode, so
  `opencode-serve` does not need it.
- [ ] **`INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS`:** check it in a proxy in front of
  Code Tools.
- [ ] **Shared `opencode-data` folder:** check what `opencode-telegram-bot` stores in
  `/root/.config/opencode-telegram-bot`, which `opencode-serve` can read.

## Verification

SSH, after deploy, in each of `claude-code`, `opencode-serve`, `code-tools` and `omp-web`
(`kubectl -n senaev-com exec deploy/<deployment> -c <container> -- sh -c '<command>'`; the
deployments are `senaev-claude-code`, `senaev-opencode-telegram`, `senaev-code-tools`,
`senaev-omp-web`):

- `ssh -T git@github.com` answers `Hi senaev!`, and `git fetch` in `/code/projects/infra.senaev.com` works.
- `ssh-add -l` shows the key fingerprint `SHA256:utim4eLj…`; `ssh-add -L` shows only the
  public key.
- `/root/.ssh` does not exist, and no private key is on the container's filesystem:
  `grep -rl 'PRIVATE KEY' / --exclude-dir={proc,sys,code} 2>/dev/null` finds nothing.
- `rm /ssh-agent/agent.sock` fails with a read-only file system error.
- All four pods are Ready, with the `ssh-agent` sidecar running and no restarts:
  `kubectl -n senaev-com get pods -o wide | grep -E 'claude-code|opencode|code-tools|omp-web'`.
- The OpenCode, OMP and Code Tools smoke checks still pass (`npm run test:smoke`; a ChatGPT
  `code-*` tool call through cluster-helper).
