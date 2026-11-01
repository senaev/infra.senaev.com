# OpenCode server

The image pins OpenCode 2.2.3. Its native web UI and API use port 4096 and
`OPENCODE_PASSWORD`; Telegram connects over localhost. State and credentials
persist in the existing OpenCode data volume.

The chart uses the `opencode` values key. Existing `opencode-telegram`
Deployment, ConfigMap and PVC names are retained to preserve resource identity
and stored data. MCP endpoints live in the shared `config/coding-agents.json`;
Telegram is a separate client of OpenCode.

OpenCode and its MCP OAuth proxy resources are defined together in
`provisioning/helm/senaev-com/templates/opencode-serve.yaml`.

## Remote MCP OAuth

All remote MCP servers in `coding-agents.json` automatically share:

- Public callback: `https://opencode.senaev.com/mcp/oauth/callback`
- Internal loopback callback port: `4100`

Each shared remote MCP definition supplies a URL and an `oauth` object (empty
when no client-specific options are needed). Client IDs and scopes are preserved.
Callback configuration is applied unconditionally. There is no provider-specific mapping, port
allocation or separate callback URL for each MCP. **Authorize one MCP at a time**:
OpenCode creates a temporary listener for each attempt, so overlapping attempts
cannot bind the same port. OAuth state binds a callback to the pending attempt.

OpenCode's native web UI starts the flow, but in 2.2.3 its backend listener is
bound to `127.0.0.1`. The main API has no forwarding route; its completion API
is for code-entry flows, while MCP uses an automatic listener flow. A small
same-pod nginx sidecar forwards the exact public callback path to the listener.

The web/API keeps native authentication. The callback relies on OpenCode's
OAuth state validation and PKCE; it strips cookies/auth headers and disables
access logging. Only Traefik can reach the proxy. Other paths return 404; when
no attempt is pending, the absent listener means the callback returns 502.

`opencode.mcpOAuth.hostname` and `callbackPort` configure the shared callback.
Adding a remote MCP to `coding-agents.json` is sufficient on the next deployment;
no callback changes are needed. MCPs added only through runtime/project-local
configuration are outside this chart inventory. OMP configuration is unchanged.

After deployment, allow-list the shared callback with any provider that requires
it, then start a **fresh** authentication attempt. Old codes and URLs cannot be
reused. Verify MCP reaches connected state, saved credentials survive browser
reconnection, and unauthenticated web/API requests still fail. An old saved
OAuth client registration may need to be removed and authorized again if its
provider rejects the changed redirect URL.

Reverting the callback/proxy configuration restores loopback OAuth; state and
credentials remain in the existing volume.

Upstream implementation:

- [MCP OAuth listener](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/core/src/mcp/oauth.ts)
- [Web authentication entry point](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/app/src/providers/connect/mcp.ts)
- [Integration API](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/protocol/src/groups/integration.ts)
