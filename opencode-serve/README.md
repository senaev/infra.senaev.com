# OpenCode server

The image pins OpenCode 2.2.3. The native web UI and API use port 4096 and
`OPENCODE_PASSWORD`; Telegram connects over localhost. State and credentials
persist in the existing OpenCode data volume.

The `opencodeTelegram` values key and `opencode-telegram` Deployment name are
legacy names for the shared OpenCode pod. MCP endpoints live in the shared
`config/coding-agents.json`; Helm generates the OpenCode server configuration,
and Telegram is a separate client of that server.

## Remote MCP OAuth

OpenCode's web UI starts MCP OAuth through its integration API and opens the
returned authorization URL. In 2.2.3, MCP OAuth still creates a separate HTTP
listener bound to `127.0.0.1`. The main API has no route forwarding browser
callbacks to that listener. Its OAuth `complete` endpoint is for code-entry
flows; MCP uses an automatic flow waiting on the loopback listener.

The chart automatically adds a public `oauth.redirect_uri` and fixed
`oauth.callback_port` to **every remote MCP server** in `coding-agents.json`.
There is no provider allow-list or manual port mapping. For a server named
`example`, the URL is `https://opencode.senaev.com/mcp/oauth/example/callback`.
Ports are derived from server names in the range 10000–49999 and stay stable
when other servers are added or removed. A port collision fails chart rendering
with the conflicting names instead of routing to another server. Setting
`oauth: false` on a server explicitly disables managed OAuth for it.

A small nginx sidecar in the same pod forwards that exact HTTPS callback path
to OpenCode's temporary loopback listener. The existing web/API ingress keeps
its native authentication; the callback needs no OpenCode login cookie because
OpenCode validates its random OAuth state and exchanges the code using PKCE.
Only Traefik may reach the callback proxy. Callback access logging is disabled,
and cookies and Authorization headers are not forwarded. Other paths return 404.
When no authentication attempt is pending, the loopback listener is absent and
the callback returns 502; it is not a health endpoint.

`opencodeTelegram.mcpOAuth.hostname` controls the public hostname. The shared
`coding-agents.json` owns server definitions; adding a remote server there is
sufficient to generate its OpenCode configuration and callback routing on the
next deployment. OpenCode-only settings are not copied into OMP. MCPs added
only through runtime/project-local configuration are outside this chart-managed
inventory and do not automatically acquire a public callback route.
A checksum restarts the pod when the generated proxy mapping changes.

After deployment:

1. If the MCP provider restricts OAuth redirect URLs, allow-list that server's
   generated HTTPS callback URL in the provider's OAuth client/organization settings.
2. Start a **new** MCP authentication attempt from OpenCode's web UI. An old
   authorization URL/code belongs to the old loopback flow and cannot be reused.
3. Confirm the redirect uses the HTTPS callback and MCP reaches connected state.
   Repeat after reconnecting the browser and confirm the credential persists.
4. Confirm unauthenticated web/API requests still fail. Check rollout readiness
   and logs for token-exchange errors without copying codes or tokens.

A previously authorized client registration may still contain an old redirect;
if the provider rejects the new URI, disconnect/remove that saved OAuth
credential and authorize again so OpenCode registers the new callback.

Upstream implementation:
- [MCP OAuth listener and configuration](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/core/src/mcp/oauth.ts)
- [Web UI authentication entry point](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/app/src/providers/connect/mcp.ts)
- [Integration API](https://github.com/anomalyco/opencode/blob/v2.2.3/packages/protocol/src/groups/integration.ts)

Reverting the callback configuration and proxy chart changes restores loopback
OAuth. The state volume and existing credentials are retained.
