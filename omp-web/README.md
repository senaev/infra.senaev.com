# OMP Web

Server-side OMP 18.14.0 with [kahme247/ompweb](https://github.com/kahme247/ompweb)
0.6.0. The image includes Node.js 24, Bun, Git/SSH, gh, Python, Helm and the
existing coding utilities. OMP's release binary is verified against its SHA-256.
The image build exercises new sessions, model switching, a harmless shell command,
and saved settings after restarting the web server, without calling a model.

## Deployment

The existing senaev-com Helm chart owns the Deployment, Service, state PVC,
NetworkPolicy, ingress and Traefik Basic Auth middleware. It is disabled by default
until these prerequisites are ready:

1. Build/publish the image through the `omp-web` workflow. The image uses
   `ghcr.io/senaev/opencode-serve:omp-web`, reusing the existing registry package.
2. Point `omp.senaev.com` at the same ingress as `opencode.senaev.com`.
3. Add `OMP_WEB_HTPASSWD_HASH_WITH_USERNAME` to Vault's `senaev-com-kv`.
   Its value is an htpasswd entry (`username:bcrypt-hash`), generated interactively
   with `htpasswd -nB <username>`. Do not commit it or use a plaintext password.
4. Set `ompWeb.enabled: true` in the chart values through a reviewed PR.
   Normal Helm CI deploys it; no cluster changes are part of this implementation.
5. Open `https://omp.senaev.com`, select a directory under `/projects/git`,
   and create a session. Select the full tool preset when you need subagents.

Traefik authenticates every route and removes the Authorization header before
proxying. A small nginx sidecar forwards to OMP Web on pod-local loopback, so
OMP Web needs no internal password or trusted-header secret. Only the selected
Traefik pods can reach nginx; the application port is not exposed by the Service.
Do not remove this NetworkPolicy or publish either container directly.

`/api/sessions` health probes make no model calls. nginx forwards the external
host and protocol, disables response buffering and allows long-lived streams.
The image runs under tini so shutdown signals reach child processes.
OMP Web explicitly permits its first image release before its Deployment exists;
other service releases still fail if their Deployment is missing. Chart-only
changes validate/deploy Helm without rebuilding or explicitly restarting OMP Web.

## Configuration and persistence

- The existing repository PVC is mounted at `/projects/git`, on the existing
  OpenCode node. OMP state has its own 8 GiB PVC at `/root/.omp`.
- OpenRouter uses the existing Vault API key and the deployed OpenCode model,
  `anthropic/claude-haiku-4.5`. Git identity, gh token, SSH key and server
  `/AGENTS.md` follow the existing deployment.
- Native `config.yml` and `mcp.json` are seeded only when absent. Browser edits,
  OAuth credentials, plugins and sessions survive pod replacement. A later
  ConfigMap update does not overwrite an existing seeded file; change it in the
  browser or deliberately update the persisted file.
- Shell execution needs approval initially (`tools.approvalMode: write`).
  OMP cannot reproduce OpenCode's permission schema by copying its JSON.
- The existing personal config's Atlassian and Datadog remote MCP definitions
  are translated to native OMP format. Authorize them from OMP Web; an OAuth
  provider's loopback callback may need SSH forwarding from your laptop.
- Laptop-only Trajectory, Datadog workspace plugins, Warp and custom OpenCode
  tools are not installed on the server. They use OpenCode APIs or workstation
  paths and need separate adaptation if wanted. OpenCode sessions are not converted.
  The server's deployed configuration, rather than laptop-specific paths and
  Jira conventions, is the baseline for this service.
- In-app version updates are disabled; change the pinned versions and rebuild.

The app runs as root inside the pod to preserve access to existing root-owned
repositories. It has no service-account token, added Linux capabilities, host
filesystem mounts or Docker socket. It still has the mounted repositories and
the explicitly provided credentials: this is a trusted single-user agent.

## Acceptance and rollback

Before activation, require a green image build (including the runtime smoke test)
and chart checks. After deployment check:

- No/wrong Basic Auth credentials return 401, including API and streaming URLs;
  correct credentials open the UI without a second login.
- A new session can select a model, run a command, use MCP and render approvals.
  Verify browser Origin handling through the real HTTPS ingress.
- Close/reopen the browser during work; confirm task completion and reconnect.
  Restart the pod separately and confirm saved settings and conversation history.
  In-flight commands and model turns are not guaranteed to recover after restart.
- Inspect available Datadog/Grafana readiness, restarts, memory and error logs.
  Confirm OpenCode and Telegram still work.

Disable `ompWeb.enabled` to remove its running resources. The state PVC has
Helm's `keep` policy and remains for reactivation; deletion is a separate manual
action. Back up the volume independently. For a version rollback, retain the
state PVC and restore the previous image build; back up first because upstream state migrations may not be reversible.
