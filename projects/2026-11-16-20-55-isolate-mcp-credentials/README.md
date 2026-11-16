# 2026-11-16 — Isolate MCP credentials from the agent runtime

Agents in the LLM workspaces use the OAuth-protected MCP servers, but cannot read their tokens.

## Goal

The MCP OAuth tokens are files in the container where the agent runs without approvals, so a
session can read them and send them anywhere:

- Claude Code: `~/.claude/.credentials.json` in `HOME` (`/k3s-cluster/volumes/claude-code`). The
  same file holds the claude.ai login. `claude mcp login` in the `telegram-login` container writes
  the tokens there, because both containers share `HOME`.
- OpenCode: its state in `/k3s-cluster/volumes/opencode-data`, readable by `opencode-serve`.
- OMP: not known whether it stores MCP tokens; check its `state` PVC.

A Datadog token reads the logs, metrics and traces of the whole organization. A Grafana token
for `mcp.senaev.com/grafana` has Editor rights in Grafana, and its refresh token lives 90 days.

The aim is the same as for the other secrets in
[`2026-11-15-21-54-isolate-secrets-from-llm-workspaces`](../2026-11-15-21-54-isolate-secrets-from-llm-workspaces/README.md):
the agent gets a way to use an MCP server, not its credential. It can still *use* the tools
while the pod runs; that is limited only by the scopes of the servers.

## Context

- MCP list: `agent.mcp` of the workspace in `provisioning/helm/senaev-com/values.yaml`; Claude
  Code gets it as `WORKSPACE_MCP_SERVERS`, written into `~/.claude.json` by `claude-code/start.sh`.
- Logins: the Telegram MCP panel in `claude-code/telegram-login/` (`mcpDialog.ts`) runs
  `claude mcp login --no-browser` and `claude mcp logout`. See the Claude Code section of
  `AGENTS.md` and [`2026-11-15-18-42-claude-code-remote-control`](../2026-11-15-18-42-claude-code-remote-control/README.md).
- Servers today: Datadog (`mcp.datadoghq.eu`, OAuth with DCR) and Grafana through cluster-helper
  (`mcp.senaev.com/grafana`, our own authorization server in `cluster-helper/src/oauth/`).
- A container cannot read another container's files or env in these pods: no shared process
  namespace, all capabilities dropped. Only shared volumes leak, such as `HOME` of Claude Code.
- The claude.ai login must stay readable by Claude Code: the harness needs it. It is out of scope.

## Plan

Ranked options. Decide before building.

1. **MCP proxy sidecar.** A container without an agent holds the tokens on its own volume,
   refreshes them, and serves each server on `http://127.0.0.1:<port>/<name>` without
   authentication. The agent config points at these local URLs, with no OAuth.
   - The login moves out of `claude mcp login`: the `telegram-login` container, or the proxy
     itself, runs the OAuth flow and writes to the proxy volume, not to `HOME`. Same Telegram
     panel; the redirect URL is still pasted back, or the proxy gets a public callback, like
     `mcp-oauth-proxy` of OpenCode.
   - One proxy can serve Claude Code and OpenCode. Check that both accept a local HTTP MCP
     server without OAuth, and that streaming (SSE) passes through.
   - Signal it works: no token in the agent container, and the tools still answer.
2. **cluster-helper servers without OAuth inside the cluster.** For `mcp.senaev.com/*`, the proxy
   from option 1 can use a workspace credential that cluster-helper checks, for example a
   NetworkPolicy plus a token that only the proxy has. That removes the OAuth login for our own
   servers. Datadog still needs option 1.
3. **Narrow and short-lived only.** Keep the tokens where they are and reduce the damage: a
   Datadog role with read-only scopes for MCP, and a shorter refresh token lifetime in
   cluster-helper. This is a fallback if the proxy is not possible.

Tasks after the decision:

- [ ] Check whether OMP stores MCP tokens, and where.
- [ ] Choose the option, and the place of the login (the `telegram-login` container or the proxy).
- [ ] Build it for Claude Code, then OpenCode.
- [ ] Log out of the old tokens (`claude mcp logout`, `opencode mcp logout`) once the proxy works.

## Verification

- In `claude-code`, `opencode-serve` and `omp-web`, no MCP access or refresh token is readable:
  `grep -rlE 'refresh_token|access_token' / --exclude-dir={proc,sys,code} 2>/dev/null` finds only
  the claude.ai login of Claude Code.
- A new Claude Code session lists the Grafana dashboards and queries `up`; a Datadog log search
  works. The same in OpenCode.
- The Telegram MCP panel still logs in and out, and shows the status of each server.
