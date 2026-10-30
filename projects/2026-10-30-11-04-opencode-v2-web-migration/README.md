# 2026-10-30 — Migrate OpenCode to V2 web access

- [x] Migrate OpenCode 1 to persistent OpenCode 2 browser access over authenticated HTTPS, preserving repositories, credentials, configuration and integrations, including Telegram.

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


### 2026-10-30 — Scope clarification and Telegram compatibility

This entry supersedes earlier removal/session/concurrency requirements:
- Dedicated hostname accepted (opencode.senaev.com remains the proposed spelling).
- Keep Telegram as an additional client if validation succeeds; removal and bot-token revocation are no longer planned by default.
- Historical V1 sessions may be lost. Session-history migration is not an acceptance requirement. Preserve repositories, credentials/configuration and persistence of new V2 sessions.
- Simultaneous checkout coordination is explicitly out of scope. Health checks are required.

Compatibility verified in upstream release v0.26.0 and source tag v0.26.4 (the version already pinned in our bot Dockerfile):
- v0.26.0 release title/body declares V2 support.
- src/config.ts reads OPENCODE_SERVER_VERSION and server credentials.
- src/opencode/client.ts selects createV2OpencodeClient when configured v2 and sends HTTP Basic credentials.
- src/opencode/v2/client.ts implements the V2 adapter.
- Sources: https://github.com/grinev/opencode-telegram-bot/releases/tag/v0.26.0 and https://github.com/grinev/opencode-telegram-bot/tree/v0.26.4/src/opencode

Our entrypoint writes an .env file but does not forward version/password settings; implementation must supply OPENCODE_SERVER_VERSION=v2, OPENCODE_SERVER_USERNAME=opencode, OPENCODE_SERVER_PASSWORD from the same Vault secret as server OPENCODE_PASSWORD, and explicit internal API URL. Keep Kubernetes as supervisor; bot auto-restart of OpenCode remains disabled. Test prompts, streams, permissions and Groq voice transcription against the selected V2 release.

HTTPS is transport encryption, not a password scheme. Native OpenCode authentication and Traefik BasicAuth can both work over HTTPS. Prefer native authentication for one credential mechanism shared by web/API/bot, not because it is intrinsically stronger. V2 documents browser cookie sessions via pairing and Basic auth for other HTTP clients; validate fresh-browser password access through Traefik before claiming the no-SSH experience is complete. Do not add two independent BasicAuth layers without testing Authorization handling.

Storage names mean Kubernetes PVC opencode-telegram-git, its claimName references, and the existing hostPath/subPath locations. Removing only the bot container does not delete this storage. Removing the whole Helm template or disabling opencodeTelegram.enabled would omit its PVC from the rendered release; Helm could then delete the PVC, and the storage reclaim policy determines whether backing data is removed. Keep the PVC resource declared and preserve its identity regardless of client choice. Code Tools also depends on the old labels/config/flag.

Voice alternatives:
1. Keep Telegram/Groq voice input alongside the web interface.
2. Use Android/Gboard or desktop OS dictation in the browser prompt field.
3. Evaluate native V2 voice: current API docs expose experimental voice models/session routes and upstream dev contains packages/app/src/voice. Availability and providers in the exact pinned release still need testing; do not equate this automatically with Telegram's record-and-transcribe workflow.
4. A custom record/transcribe control using the existing Groq service is possible but adds frontend maintenance; defer unless the options above fail.

Validation for this follow-up: upstream tagged bot source inspected; documentation-only change, diff whitespace check. No runtime changes.


### 2026-10-30 — Authentication preference and source review

User prefers reverse-proxy authentication only if OpenCode authentication can be completely disabled. Authentication remains undecided.

Current upstream dev source reviewed: packages/cli/src/server-process.ts generates a password when one is not supplied and rejects an empty password with "Missing server password". packages/server/src/auth.ts has a lower-level optional-auth configuration, but the normal CLI startup does not expose that as a supported disable switch. Therefore proxy-only authentication with native authentication disabled is not currently established as supported; verify against the exact release before implementation.

A proxy could authenticate the browser and inject backend Basic credentials, leaving OpenCode authentication enabled. This is a different arrangement from the requested complete disablement, requires explicit Authorization-header replacement and browser/streaming tests, and has not been selected. No authentication change or deployment performed.

Separate Pi project created with requirements only; OpenCode remains the active focus.


### 2026-10-30 — Native authentication selected

User selected native OpenCode authentication. This supersedes the earlier undecided/proxy-only preference. Traefik remains responsible for HTTPS and routing, without a second password prompt. Keep the server password in Vault and supply it to the Telegram client internally.

Before implementation, verify the pinned release supports fresh-browser access without an SSH-dependent pairing workflow. Remaining implementation research: exact V2 release/artifact and compatibility, live-versus-repository drift, effective credential/config paths, DNS/ingress routing and authentication-aware health checks. No need to preserve historical V1 sessions or solve simultaneous checkout coordination.

Proposed defaults for the user: opencode.senaev.com, retain existing OpenRouter/model settings and Telegram/Groq, single-user access, generated strong Vault-managed password, brief planned cutover interruption. These defaults are proposals, not additional user decisions.


### 2026-10-30 — Implementation and first review

Confirmed hostname opencode.senaev.com, Telegram/Groq, existing OpenRouter settings, single-user access and brief downtime. User reports DNS record added. Native authentication selected.

Implemented pinned/checksummed OpenCode 2.2.3, native sign-in, Vault-backed password shared with Telegram, private Service and Traefik-only NetworkPolicy, persistent global config/state and authenticated startup/readiness/liveness probes. Retained deployment/PVC/Code Tools identity. Added Telegram V2 configuration and integration checks.

Review corrections: isolate the password ExternalSecret from the shared application secret; retain V1 tags and use separate V2 tags to avoid image/manifest mismatch; wait for image workflows before chart cutover; preserve outside-project permission prompts and mount global AGENTS.md; restrict permissions of existing Telegram .env files before rewriting them.

Validation so far: verified official archive checksum and exact binary version; ran isolated real V2 server with the existing OpenRouter config shape and dummy credentials; confirmed web shell 200, authenticated API 200 and missing/wrong-password API 401. Rendered chart assertions confirm private backend, ingress selector, probes and preserved shared PVC/Code Tools. Process integration tests cover credential handling and probe failure modes. Full repository checks and final review pending.

No cluster inspection or deployment performed. [Cutover and acceptance guide](CUTOVER.md) records prerequisites and post-deploy checks. The new Vault property must exist before merge/cutover.


### 2026-10-30 — Second review and validation

Reviewed the complete implementation again across image build, startup/authentication, Helm release ordering, ingress/network policy, secrets, persistence, Telegram and Code Tools dependencies. No remaining code-level blocker found. Live deployment acceptance remains separate.

All local repository checks passed: lint, typecheck, 193 test files / 1,661 tests (full suite, one worker, 167.93 seconds), Python/shell syntax and Helm lint. Three added process integration tests passed (~3.2 seconds). Rendered chart security/storage assertions passed. The image workflow gate was exercised with successful and failed build results. DNS for opencode.senaev.com resolves.

Checks ran sequentially on the 2 GiB Code Tools container to avoid exhausting its memory; the pre-push duplicate full-suite run is excluded after this successful validation. CI still runs the normal concurrent checks and both PR container builds.

Ready for CI review. Before merge: populate Vault OPENCODE_PASSWORD, inspect live credential/config paths and take a consistent backup. No cluster changes made.


### 2026-10-30 — CI and credential boundary review

CI passed the repository checks and both server/bot container builds on implementation commit ddc12cb. PR builds did not publish or restart services.

Evaluated the review concern about credentials in child environments using an isolated 2.2.3 server and a dummy password. The shell API confirmed password inheritance without printing a credential. Native authentication is access control, not an agent sandbox; same-root file/service storage would not isolate secrets either. Documented this single-user trusted-agent limitation in CUTOVER.md for user confirmation before merge. No unsupported credential-isolation workaround was added.

The initial combined network acceptance item is superseded by independent IPv4, IPv6, internal policy, redirect and bypass checks in CUTOVER.md.

Implementation and self-review complete; no runtime changes. Awaiting user confirmation of the documented credential trust boundary, Vault password provisioning and live preflight/backup before merge. Automated review may still be pending.

### 2026-10-30 — User confirmation and Vault password

User explicitly accepts the single-user trusted-agent model, including agent shell access to the OpenCode server password. This resolves the outstanding user decision about the credential trust boundary.

User confirms OPENCODE_PASSWORD has been added to Vault. Recorded as user-confirmed; the secret was not read or independently verified.

User requested only this project update. No merge, deployment, live preflight or other changes are authorized by this message.


### 2026-10-30 — Simplify CI/CD and reuse latest images

At the user request, removed the V2 image tags and restored the existing latest tags for both server and bot. Removed the entire cross-workflow image polling step and its additional Actions permissions/token/repository variables; update-helm-charts.yml is restored to the main-branch version. Also removed the newly added duplicate Telegram check job. Kept bot PR build validation and its no-publish/no-restart condition, plus focused runtime tests in the existing shared checks.

This supersedes the earlier release-gate/tag decisions. The existing independent build/deploy workflows can have temporary version mismatches during cutover; no synchronization mechanism is added. Missing password or probe script fails startup/readiness. Preserve old image digests for rollback since latest is overwritten. Updated cutover guidance, including copying ephemeral configuration before merge/restart. No merge or deployment performed.


### 2026-10-30 — Remove the additional runtime test

At the user request, removed opencode-serve/test-runtime.py and its additional CI step. Production startup/readiness/liveness probes and healthcheck.cjs remain unchanged. The shared check workflow is restored to its original version. No merge or deployment performed.


### 2026-10-30 — Use the native OpenCode health command

Replaced the custom healthcheck.cjs script with opencode --server http://127.0.0.1:4096 api get /api/info in all three Kubernetes probes. Removed the script and its Dockerfile copy. Explicit --server targets the existing process without starting a background service; the command reads OPENCODE_PASSWORD from the existing environment.

Verified the exact 2.2.3 binary with isolated storage and dummy credentials before replacement: correct password exits 0, wrong password and stopped server exit nonzero, no background service registration created, approximately 0.25 seconds per request. Probe timings remain unchanged. No merge or deployment performed.


### 2026-10-30 — Merged, deployed and checked

Merged PR #112 as 7e97945cdfa493c107991a50accfaaec7de9b318 at 15:26 UTC. All four merge workflows completed successfully: Check, opencode-serve, opencode-telegram-bot and Update Helm Charts.

Saved a protected repository backup on the existing shared volume at /projects/git/.migration-backups/opencode-2026-10-30/repositories.tar (excluding reproducible node_modules). Direct SSH preflight was unavailable because the Code Tools container had no trusted host key for hetzner; verification remained enabled. No live hostPath/global-config backup or secret read was performed, so do not assume the repository archive is a complete V1 runtime rollback backup.

Post-deploy checks using Grafana MCP, Datadog MCP and public HTTP/TLS requests:
- Both OpenCode containers ready; deployment available replicas 1; Code Tools available replicas 1. The final pod had zero container restarts at the observed sample.
- HTTPS / returns 200 with a trusted Let's Encrypt certificate. HTTP redirects to HTTPS.
- Unauthenticated /api/info returns 401. Native authenticated readiness probes pass.
- Public IPv4 and configured IPv6 port 4096 refuse connections. The Code Tools pod also cannot connect directly to the internal OpenCode Service.
- All three existing smoke URLs returned their expected redirect/content with HTTP 200.
- Datadog logs confirm the V2 server became ready and Telegram started. No ongoing error logs found after 15:30:40 UTC through the final observation window around 15:32 UTC.

Representative observed results:

~~~text
https://opencode.senaev.com/ 200
https://opencode.senaev.com/api/info 401
[OpenCodeReady] OpenCode server is ready: reason=startup
~~~

Transient V1/V2 mismatch warnings and certificate issuance resolved during the independent release jobs. One retained Telegram session still references the obsolete /projects/vault path and logged attach warnings; select a current repository/new session in Telegram. Historical-session continuity was explicitly out of scope.

Not exercised: authenticated browser interaction, a model request, Telegram voice round trip, credential rotation or host reboot. No messages were sent through Telegram. Deployment and monitoring checks passed; those manual/end-to-end acceptance items remain open.


### 2026-10-30 — User acceptance complete

User confirmed all suggested end-to-end checks passed: correct and incorrect password handling in Incognito, web agent responses, reconnection/session continuity, shared web/Telegram sessions, Telegram voice transcription and web permission prompts. Migration accepted and marked complete. Credential rotation and a host reboot were not part of these checks and remain optional separate maintenance verification; no success is claimed for them.

## Result

Complete. OpenCode 2 is deployed via PR #112 with native authentication, persistent storage and the retained Telegram/Groq integration. Automated deployment/monitoring checks passed, and the user confirmed end-to-end acceptance. Credential rotation and host-reboot testing were deferred to separate maintenance verification.
