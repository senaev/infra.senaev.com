# VPN namespace migration

Move three Xray instances and the subscription/web interface into release/namespace
`vpn`. Preserve protocol, profiles, keys, images, ports, nodes and website fallback.
No host networking, firewall, Tailscale or Vault changes. The existing ClusterSecretStore
projects five properties from the same `senaev-com-kv` store into the new namespace.
Leave the old shared secret unchanged to avoid reloader restarts of unrelated services.

## Staged cutover — before merge

Do not merge before staging and verification. A plain merge removes the old VPN resources
and installs the new ones, which can interrupt VPN **and root websites** relying on Xray's
Reality fallback. Staging avoids depending on deployment order or first-install success.
These are user-run commands on the personal cluster management host using its personal
kubeconfig, from a checkout of this PR. Never use a local/work kubeconfig.
Preparing this PR does not execute or authorize the live migration.

Record the pre-migration commit and current release revision:

```bash
git rev-parse origin/main
helm history senaev-com -n senaev-com
helm list -n vpn
```

Stop if an unexpected `vpn` release exists. Prepare workloads without public routes:

```bash
helm upgrade --install vpn provisioning/helm/vpn -n vpn --create-namespace \
  -f provisioning/helm/common-values.yaml -f provisioning/helm/vpn/values.yaml \
  --set ingress.enabled=false --wait --timeout 300s
kubectl -n vpn wait --for=condition=Ready externalsecret/senaev-com-kv-secrets --timeout=120s
kubectl -n vpn get deployments,pods,services,endpointslices
kubectl -n vpn logs deployment/xray-vpn-firstvds --all-containers --tail=50
kubectl -n vpn logs deployment/xray-vpn-hetzner --all-containers --tail=50
kubectl -n vpn logs deployment/xray-vpn-senaev-media --all-containers --tail=50
kubectl -n vpn logs deployment/vpn-subscription --tail=50
```

Verify all workloads ready, init containers successful, endpoints present, the Xray
configurations equal the old ones, and internal SOCKS names resolve within `vpn`.
Do not publish secrets or rendered private keys. Before exposing routes, request normal
HTTPS through each new Xray service from inside the cluster, preserving SNI `senaev.ru`
or `senaev.com` and port 443. Confirm the Reality fallback returns the same website as
the old service. Check new subscription HTML and Happ content using existing credentials.
Helm readiness alone does not prove these paths work.

Allow reports from the new subscription service during overlap. Inspect the live policy
first: the following patch assumes ingress rule 1 is the internal TCP/80 rule; stop if
its order differs.

```bash
kubectl -n senaev-com get networkpolicy cluster-helper -o yaml
kubectl -n senaev-com patch networkpolicy cluster-helper --type=json -p='[{"op":"add","path":"/spec/ingress/1/from/-","value":{"namespaceSelector":{"matchLabels":{"kubernetes.io/metadata.name":"vpn"}},"podSelector":{"matchLabels":{"app":"vpn-subscription"}}}}]'
```

Send a report through the new service and verify Telegram delivery. Then publish routes:

```bash
helm upgrade vpn provisioning/helm/vpn -n vpn \
  -f provisioning/helm/common-values.yaml -f provisioning/helm/vpn/values.yaml \
  --wait --timeout 300s
curl --fail --silent --show-error --output /dev/null https://senaev.com
curl --fail --silent --show-error --output /dev/null https://senaev.ru
```

Both namespaces briefly advertise the same hosts with equivalent backends. Verify Traefik
accepts the new routers, both root websites, subscription HTML, Happ import, reports and
a previously working VPN path. Old resources remain available for recovery. There is no
zero-downtime guarantee for router reconciliation or existing VPN sessions.

Only then merge. CI removes old VPN resources through Helm and updates the prepared
`vpn` release. Wait for CI, inspect readiness and Traefik/Xray/subscription logs, repeat
the public checks and confirm old VPN resources are gone from `senaev-com`.

Adding `.github/deploy-config.json` triggers the existing planner's full deployment on
this first merge: all images/charts, not just VPN. Schedule and monitor accordingly.
Subsequent VPN chart or subscription source changes select the `vpn` release.

## Rollback

Before merge, the old release remains intact. If new routes are enabled, upgrade `vpn`
with `--set ingress.enabled=false` using the preparation command above. Verify the old
websites/subscription recover. Keep new workloads for diagnosis.

After merge, restore the old chart from the recorded pre-migration checkout on the
management host, before disabling the new routes:

```bash
helm upgrade senaev-com /path/to/pre-migration/provisioning/helm/senaev-com -n senaev-com \
  -f /path/to/pre-migration/provisioning/helm/common-values.yaml \
  -f /path/to/pre-migration/provisioning/helm/senaev-com/values.yaml --wait --timeout 300s
```

Verify the restored services and website fallbacks, then disable new routes as above.
Revert the migration through a PR so CI agrees with recovery; coordinate to prevent
another deploy overwriting the manual restoration. Do not uninstall namespaces as a
first recovery step. No host networking/Tailscale changes are involved.

## Existing issue outside migration scope

First subscription entry derives UUID seed `6`; firstvds accepts seeds `1` and `4`.
This predates migration and is preserved for the later VPN investigation.
