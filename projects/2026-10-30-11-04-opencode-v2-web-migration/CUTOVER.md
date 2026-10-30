# OpenCode 2 cutover

This PR prepares OpenCode 2.2.3 at https://opencode.senaev.com with native password authentication.
Telegram and Groq transcription remain available against the same server. Historical V1 sessions
need not survive; repositories, provider credentials and new V2 state must persist.

## Before merging

1. DNS is added (reported by the user on 2026-10-30). Verify it points to the existing Hetzner ingress.
2. In the existing Vault entry named senaev-com-kv, add OPENCODE_PASSWORD with a generated
   64-character hexadecimal value. Keep it in Vault/password manager, never git, PR output or chat.
   The browser username is opencode. A separate ExternalSecret creates opencode-auth so a missing
   property does not break the shared secret for other services.
3. Inspect the running deployment and credential/config locations before cutover; the PR was
   developed without querying the cluster. Preserve any settings in ephemeral global config in
   the new persistent config directory after stopping OpenCode.
4. Make a protected backup of /projects/git including uncommitted/untracked work, and
   /k3s-cluster/volumes/opencode-data on Hetzner. Record the Helm revision and actual image digests.

Run read-only checks on the personal cluster's control plane, never a workstation work context:

~~~sh
kubectl -n senaev-com get deployment opencode-telegram code-tools
kubectl -n senaev-com get pvc opencode-telegram-git
kubectl -n senaev-com get deployment opencode-telegram -o jsonpath='{range .spec.template.spec.containers[*]}{.name}{" "}{.image}{"\n"}{end}'
kubectl -n senaev-com get pods -l app=opencode-telegram -o jsonpath='{range .items[*].status.containerStatuses[*]}{.name}{" "}{.imageID}{"\n"}{end}'
kubectl -n traefik get pods -l app=traefik,traefik-deployment=hetzner --show-labels
helm -n senaev-com history senaev-com
~~~

Keep revision and digests privately with the backup. Inspect config paths without printing secret
contents. A consistent backup requires pausing writers during the maintenance window; copying a
live database is not a verified backup.

## Release behavior

The server and bot images publish under separate :v2 tags, leaving the previous :latest images
available for rollback. PR builds do not publish or restart services. On merge, the Helm job waits
for this commit's changed OpenCode image workflows to succeed before applying the chart. Existing
service workflows still run their normal rollout checks.

Deployment/PVC names, node selection, Code Tools affinity, SSH secret reference and repository
paths are unchanged. Only Traefik in namespace traefik with the existing Hetzner labels can connect
to port 4096 from other pods. No public backend port or tunnel is added. Traefik provides HTTPS and
its existing HTTP redirect; OpenCode handles login.

Global config and state directories persist in the existing node-local data volume. Server rules
are mounted as global AGENTS.md because V2 discovery can stop at individual repository roots. An
explicit outside-project permission rule retains V1 prompt behavior. OpenRouter/model and Telegram
allowed-user/Groq settings remain unchanged.

## Acceptance

~~~sh
kubectl -n senaev-com get externalsecret opencode-auth
kubectl -n senaev-com rollout status deployment/opencode-telegram --timeout=300s
kubectl -n senaev-com rollout status deployment/code-tools --timeout=180s
curl -I http://opencode.senaev.com/
curl -I https://opencode.senaev.com/
curl -i https://opencode.senaev.com/api/info
~~~

Expected: HTTP redirects to HTTPS; HTTPS serves the sign-in page with a valid certificate;
unauthenticated API requests return 401. Public sign-in assets contain no repository/session data.
Do not use shell arguments containing the real password for authenticated tests.

In a fresh mobile and desktop browser, sign in with opencode and the Vault password: open a
repository, send a prompt, approve a permission request, inspect files, use the terminal, reconnect
after sleeping the phone, and resume a new V2 session. Test Telegram text, voice transcription,
permissions and the same session from both clients. Check Code Tools can still list/read repos.

Verify public IPv4/IPv6 cannot reach backend port 4096, and an unrelated pod is denied while Traefik
succeeds. Test a pod restart and persistence of new sessions/settings. A host reboot is a separate
scheduled test; node-local storage does not survive loss of that node.

Password rotation updates the secret and restarts the deployment via the existing reloader.
Verify an old password/session is rejected and the new one works.

## Rollback

Stop OpenCode before restoring data, keep a copy of V2 state, restore the protected pre-cutover
data/config backup, and restore the recorded V1 server/bot image digests and previous Helm revision.
Do not run V1 against a migrated V2 database. Restore the whole Helm revision only if no intervening
unrelated chart changes would be reverted. PVC/repositories retain their identity. No bot tokens
or shared credentials are revoked by this migration.

Do not mark deployment acceptance complete until browser, Telegram, private-network and restart
checks have passed.

## Credential trust boundary

An isolated test of the exact 2.2.3 foreground server confirmed that a shell child inherits
OPENCODE_PASSWORD. Native authentication protects entry to the service; it does not sandbox
authorized agent tools, terminal commands, plugins or MCP processes from the container's
credentials. This deployment already gives its single authorized user/agent root-level access
and GitHub/provider credentials. Do not use it to run untrusted plugins or serve other users.

Moving the password to another file owned by the same root user would not create process
isolation. Hiding credentials from agent tools would require a separate isolation design;
this PR does not claim that protection. Confirm this trust model before merging.

Network acceptance results should be recorded independently:
- Public IPv4 backend port 4096 is unreachable.
- Public IPv6 backend port 4096 is unreachable (or no public IPv6 route exists).
- Traefik can reach the service; unrelated pods cannot.
- HTTP redirects to HTTPS.
- No alternate ingress or remote tunnel bypasses the intended entry point.
