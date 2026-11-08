## 2026-11-08 15:52 UTC — Prepare firstvds subscription UUID fix

Changed only the firstvds → freedom subscription entry from seed `6` to seed `4`,
matching the existing firstvds direct-exit client. Server credentials, Vault values,
routing and other profiles are unchanged. Helm lint and rendered comparison passed;
only the subscription environment value changes. Pending review, deployment and a
subscription refresh/test in Happ. This fixes a credential mismatch, not proof that
the separate ISP-related failure is resolved.

## 2026-11-08 15:03 UTC — VPN namespace migration done; ESO incident during cutover

PR #132 is merged and deployed. Xray servers and `vpn-subscription` run in the `vpn`
release/namespace. The user confirmed: VPN works from Happ, `vpn-subscription` works,
the MCP connectors work. Smoke tests pass, including `https://senaev.ru` through the
Xray fallback.

The cutover found an older problem: CI installed a second ESO release in namespace
`external-secrets` (the planner took the namespace from the chart folder), while
`make services` installs it in `vault`. Both releases changed the same cluster-scoped
RBAC and webhook configs, so cert-controller was not ready and the webhook failed with
x509 errors. Fixes in PR #132: CI deploys `external-secrets` to `vault`
(`charts.<chart>.namespace` in `.github/deploy-config.json`), `bootstrap-secrets.sh`
waits until the webhook accepts a dry-run request, and the `Makefile` got a `vpn` target.

Removing the extra release with `helm uninstall` deleted the ESO CRDs, because the
chart has no keep policy. Every ExternalSecret became `Terminating`, and the `datadog`
deploy failed:

```
resource ExternalSecret/datadog/senaev-com-kv-secrets not ready. status: Terminating, message: Resource scheduled for deletion
```

Recovery: removed the finalizers, let the CRDs and owned Secrets go, then a full deploy
recreated all from Vault. PR #133 adds `helm.sh/resource-policy: keep` to the ESO CRDs.
After deploy run 42491488254, all 11 ExternalSecrets log `reconciled secret`, and
Datadog shows no ESO errors after 14:42 UTC.

## 2026-11-08 — Prepare VPN namespace migration

Kept the existing project. Extracted unchanged Xray configuration and subscription
interface into `vpn`. Kept the shared Vault store and old Kubernetes secret unchanged;
the new namespace projects only VPN properties. Preserved the report URL using an
ExternalName alias and a scoped cross-namespace NetworkPolicy peer. Prepared staged
cutover/rollback instructions; no live cluster changes were performed.

The existing seed-6 subscription versus seed-4 server mismatch remains outside scope.
The initial deployment mapping change triggers the planner's full rollout; this and
the website fallback dependency are explicit pre-merge considerations.
