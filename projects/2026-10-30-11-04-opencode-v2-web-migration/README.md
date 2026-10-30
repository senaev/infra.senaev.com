# 2026-10-30 — Migrate OpenCode to V2 web access

- [ ] Replace OpenCode 1 and its Telegram bot with persistent OpenCode 2 browser access over authenticated HTTPS, preserving repositories, credentials, configuration and integrations.

## Goal

Access OpenCode from any browser without SSH, through the existing reverse proxy and HTTPS infrastructure. Protect access with a password; never expose the backend directly to the internet. Remove the OpenCode Telegram integration after web acceptance, preserving unrelated Telegram alerts.

Current scope: research and project planning only. No deployment, cluster inspection, secret changes or Telegram removal performed.

## Context

Repository review (desired configuration, not a live cluster audit):
- [Image](../../opencode-serve/Dockerfile) pins OpenCode 1.19.0 with checksum verification and baseline x64 CPU compatibility; [startup](../../opencode-serve/start.sh) runs foreground serve on 0.0.0.0, working directory /projects/git.
- [Deployment](../../provisioning/helm/senaev-com/templates/opencode-serve.yaml) combines OpenCode and Telegram, one replica, Recreate, on hetzner. No OpenCode Service/Ingress; ingress NetworkPolicy denies all. No OpenCode readiness/startup probes.
- [Values](../../provisioning/helm/senaev-com/values.yaml) select OpenRouter and anthropic/claude-haiku-4.5.
- Repositories use PVC opencode-telegram-git. OpenCode state uses a node-local hostPath with opencode-sessions subdirectory; Telegram uses a separate subdirectory. Global ~/.config/opencode is not explicitly persisted.
- GitHub token, OpenRouter key and SSH key are secret references. Preserve their identities and access; never copy values into git.
- [Code Tools](../../provisioning/helm/senaev-com/templates/code-tools.yaml) shares the PVC, config map and SSH secret, is gated by opencodeTelegram.enabled, and requires affinity to app=opencode-telegram.
- [Ingress](../../provisioning/helm/senaev-com/templates/ingress.yaml) already supports Traefik, letsencrypt and middleware. [Unmanic](../../provisioning/helm/senaev-com/templates/unmanic.yaml) demonstrates Vault-backed BasicAuth.
- [OpenCode build](../../.github/workflows/build-opencode-serve.yml) targets deployment opencode-telegram. [Bot build](../../.github/workflows/build-opencode-telegram-bot.yml) must be retired as part of cleanup.

## Plan

- [ ] Confirm an exact available V2 release, archive checksum, CPU compatibility and foreground CLI behavior; pin it. Do not deploy an unverified latest version.
- [ ] Before implementation, inventory running image/version, effective config, plugins/MCP, credentials locations, state/storage and proxy details through an authorized read-only cluster review.
- [ ] Back up repositories (including uncommitted/untracked work), OpenCode state/config and Telegram state securely. Test restoration into isolated storage. Never run V1 and V2 against the same state during validation.
- [ ] Build an isolated V2 candidate; verify OpenRouter, GitHub SSH/gh, agent instructions, permissions, plugins/MCP and historical sessions. Inventory project configuration without printing secrets.
- [ ] Run foreground opencode serve under the existing Kubernetes Deployment, with explicit internal port and Vault-provided OPENCODE_PASSWORD. Verify the pinned release's browser login and cookies behind HTTPS without recurring SSH/pairing.
- [ ] Add a dedicated hostname (proposal: opencode.senaev.com, DNS ownership/routing unverified), ClusterIP Service, existing Traefik/letsencrypt Ingress, and NetworkPolicy allowing only the actual ingress controller identity. No NodePort, hostPort, hostNetwork, public load balancer or OpenTunnel.
- [ ] Prefer native V2 password/session authentication; evaluate existing Traefik BasicAuth only if needed. Test Authorization-header compatibility before layering it; Unmanic's removeHeader setting cannot be copied blindly.
- [ ] Persist all effective state/config paths. Preserve existing PVC identity and hostPath data. Add startup/readiness probes and carefully designed liveness checks that do not kill long agent operations.
- [ ] Decouple Code Tools enablement/config/scheduling from Telegram before changing labels or deployment names. Preserve its existing internal token and NetworkPolicy.
- [ ] After browser acceptance, remove the bot container, dedicated image workflow and unused configuration. Revoke only its dedicated bot token after checking consumers; retain shared SSH/OpenRouter/GitHub/Groq credentials where still used. Archive bot state for the rollback window.
- [ ] Update build/deploy targets, documentation and server instructions. Keep one replica/Recreate until shared-filesystem coordination is solved.
- [ ] Provide exact deployment/rollback commands for user execution; deployment is outside this research task.

## Verification

- Fresh desktop and mobile browser: valid HTTPS; successful password login without SSH; unauthenticated/wrong-password UI, API, terminal and streaming requests disclose nothing.
- Test session creation/resume, project selection, streamed output, terminal, reconnect after sleep/network change and credential rotation/logout.
- Verify backend unreachable via public IPv4 and IPv6, with only Traefik admitted internally; HTTP redirects to HTTPS; no alternate ingress/tunnel bypass.
- Confirm git/gh operations, configured model, project instructions, permission prompts and existing required integrations. Confirm Code Tools/MCP still work.
- Restart pod and, in a separately scheduled maintenance test, reboot host: service returns and repositories/config/credentials/sessions survive. Node-local storage is not node-loss recovery.
- Bot stops accepting commands; unrelated Telegram alerts remain. Restore V1 using its prior image/config and pre-migration state copy in a rollback drill.
- Run repository simple-checks and Helm rendering for implementation, including Code Tools enabled while Telegram is absent.

## Findings

### 2026-10-30 — Initial research

Repository inspection supports reusing Kubernetes, Traefik, letsencrypt, Vault and existing storage rather than adding a host-level supervisor.

Official references reviewed:
- [V2 web/server](https://opencode.ai/v2/docs/cli/web/): foreground serve is suitable for container supervision; V2 uses OPENCODE_PASSWORD and a fixed opencode username. Browser sessions/pairing differ from V1.
- [V1 migration](https://opencode.ai/v2/docs/migrate-v1): plugin/server API changes require explicit compatibility checks; existing supported configuration can be retained initially.

Ideas:
1. Use a dedicated same-origin HTTPS hostname and native browser authentication; keep tunnel-based remote access disabled.
2. Retain storage resource names during the first cutover; remove Telegram branding later to reduce migration coupling.

Improvements:
1. Separate Code Tools lifecycle from the Telegram/OpenCode feature flag and affinity labels.
2. Add health checks, immutable release selection, persistent config coverage and a tested backup/restore procedure.

Concerns:
1. This is a browser-accessible shell with GitHub/provider credentials and root execution in the container; password compromise has substantial impact. Review least privilege, login throttling and logging without exposing secrets.
2. Web replacement may lose Telegram voice transcription, notifications or file-browser conveniences. Inventory what is actually needed; do not assume feature parity.

What can go wrong:
1. Removing/renaming the old chart resources can delete the shared PVC or leave Code Tools unschedulable. Preserve storage identity, update dependencies together and inspect Helm changes before deployment.
2. State/schema migration or missing config mounts can lose sessions or credentials. Validate copies first and restore the pre-migration copy for rollback.
3. Wrong proxy policy, auth headers or timeouts can cause bypasses, login loops or broken streams. Test every route and long-running operations through the public hostname.
4. Concurrent browser agents and Code Tools can modify the same checkout; existing shared trees have no cross-process lock. Coordinate work or use isolated worktrees.

Open points: exact V2 release/artifact, real runtime drift, historical session compatibility, persisted credential paths, browser password-login behavior, hostname/DNS, ingress controller selectors and required Telegram feature replacements.

## Result

Research and migration task created. Implementation remains open. No runtime settings changed.
