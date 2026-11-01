# OpenCode server

The image pins OpenCode 2.2.3. The native web UI and API use port 4096 and
`OPENCODE_PASSWORD`; Telegram connects over localhost. State and credentials
persist in the existing OpenCode data volume.

## Remote MCP OAuth

OpenCode's web UI starts MCP OAuth through its integration API and opens the
returned authorization URL. In 2.2.3, MCP OAuth still creates a separate HTTP
listener bound to `127.0.0.1`. The main API has no route forwarding browser
callbacks to that listener. Its OAuth `complete` endpoint is for code-entry
flows; MCP uses an automatic flow waiting on the loopback listener.

The chart configures Datadog with:

```json
{
  "oauth": {
    "redirect_uri": "https://opencode.senaev.com/mcp/oauth/datadog/callback",
    "callback_port": 4100
  }
}
```

A small nginx sidecar in the same pod forwards that exact HTTPS callback path
to OpenCode's temporary loopback listener. The existing web/API ingress keeps
its native authentication; the callback needs no OpenCode login cookie because
OpenCode validates its random OAuth state and exchanges the code using PKCE.
Only Traefik may reach the callback proxy. Callback access logging is disabled,
and cookies and Authorization headers are not forwarded. Other paths return 404.
When no authentication attempt is pending, the loopback listener is absent and
the callback returns 502; it is not a health endpoint.

`opencodeTelegram.mcpOAuth` in chart values owns the public hostname and a map
of server names to distinct callback ports. The shared `coding-agents.json`
continues to own MCP endpoint definitions; the chart adds OpenCode-only OAuth
settings without changing OMP configuration. A checksum restarts the pod when
the proxy mapping changes.

After deployment:

1. If Datadog restricts OAuth redirect URLs, allow-list the exact HTTPS URL above
   in Organization Settings → MCP OAuth Redirect URLs.
2. Start a **new** Datadog authentication attempt from OpenCode's web UI. An old
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
