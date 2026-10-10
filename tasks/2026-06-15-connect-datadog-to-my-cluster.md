# Add Datadog Agent to the K3s cluster

## Context

We want maximum observability over **both** the media stack (Jellyfin,
qBittorrent, Unmanic, Prowlarr, media-server-helper, etc. on the `senaev-media`
node) **and the K3s control-plane node (`hetzner`) plus the services running on
it** (traefik, vault, external-secrets, the vm-* telemetry stack, cluster-helper,
webhook-endpoint, etc.): Kubernetes insights/telemetry, infrastructure metrics,
and — most importantly — container **logs**. The cluster already runs a
VictoriaMetrics stack in the `telemetry` namespace; Datadog will run alongside it
(not replace it) as a SaaS backend giving a richer UI, log search, live
processes, and the Orchestrator Explorer.

Note: `senaev-media` and `hetzner` are **node labels** (`vps: <name>`). The
media workloads run in the `senaev-com` namespace pinned to `senaev-media`; the
control-plane services run on `hetzner`. Datadog's node Agent is a DaemonSet, so
we scope it by node affinity to land on both nodes.

### Host metrics (senaev-media + hetzner)
Because the node Agent DaemonSet runs on **both** nodes, host/system metrics are
collected automatically on each — CPU, memory, load, disk (including the media
node's `/mnt/sdb1` storage volume), network, IO, and uptime — via the Agent's
built-in system core checks. No extra configuration is required; these ship on
by default with the node Agent.

### Control-plane coverage (hetzner)
- The node Agent DaemonSet runs **on hetzner**, so it collects host metrics +
  all container logs for every service scheduled there.
- The **Cluster Agent + kube-state-metrics run on hetzner**, providing
  cluster-wide K8s object metrics and the Orchestrator Explorer.
- **K3s caveat:** K3s bundles apiserver/scheduler/controller-manager into one
  process (not separate static pods), so Datadog's stock "control-plane
  components" integration won't auto-discover the scheduler/controller-manager.
  The kube-apiserver is still scrapeable. Optionally add a kube_apiserver_metrics
  check via `datadog.clusterAgent` cluster checks if apiserver metrics are
  wanted; scheduler/controller-manager metrics are not separately exposed by
  default on K3s and are out of scope.

### Confirmed decisions
- **Datadog site:** `datadoghq.eu` (EU1).
- **Node Agent DaemonSet scope:** two nodes only — `senaev-media` and `hetzner`
  (via `nodeAffinity` on the `vps` label). Cluster Agent + kube-state-metrics
  pinned to `hetzner` (matches the existing operator-pinning convention).
- **APM:** not now. Infra + logs first; APM is a possible fast-follow.
- **Keys:** API key only (no App key; no Datadog-metric HPA).
- **Chart choice:** the plain `datadog/datadog` Agent Helm chart (NOT the
  operator) — no CRDs, matches the repo's vendored-subchart pattern.

## Approach

Add a new vendored wrapper chart `provisioning/helm/datadog/`, sync the DD API
key from Vault via External Secrets, and deploy through the existing Makefile /
`upgrade-namespace.sh` flow into a `datadog` namespace.

### 1. New wrapper chart `provisioning/helm/datadog/`

**Vendor the upstream chart** (one-time, on workstation; commit the `.tgz`):
```
helm pull datadog/datadog --version <latest-stable> \
  --repo https://helm.datadoghq.com \
  -d provisioning/helm/datadog/charts/
```
Produces `provisioning/helm/datadog/charts/datadog-<version>.tgz`. The `--repo`
flag avoids a persistent `helm repo add` (no `helm repo add` exists in this
repo). `rsync` ships `provisioning/` to the control plane, so the `.tgz` travels
automatically.

**`provisioning/helm/datadog/Chart.yaml`** — thin wrapper, mirroring
`vm-stack/Chart.yaml`:
```yaml
apiVersion: v2
name: datadog
description: Datadog Agent (node DaemonSet + Cluster Agent + KSM) for full cluster observability.
type: application
version: 0.1.0
appVersion: "1"
kubeVersion: ">=1.25.0"
dependencies:
  - name: datadog
    version: "<version>"
    repository: "./charts/datadog-<version>.tgz"
```

**`provisioning/helm/datadog/values.yaml`** — overrides nested under the
`datadog:` subchart key:
```yaml
datadog:
  datadog:
    site: datadoghq.eu
    clusterName: senaev-k3s
    apiKeyExistingSecret: datadog-secrets      # k8s Secret key 'api-key' (see §2)

    # --- K3s specifics ---
    kubelet:
      tlsVerify: false                       # K3s kubelet uses a self-signed serving cert
    criSocketPath: /run/k3s/containerd/containerd.sock  # K3s embedded containerd

    # --- Kubernetes insights / infra metrics ---
    kubeStateMetricsEnabled: true
    kubeStateMetricsCore:
      enabled: true
    orchestratorExplorer:
      enabled: true                          # K8s resource topology (needs Cluster Agent)

    # --- LOGS (priority) ---
    logs:
      enabled: true
      containerCollectAll: true
      containerCollectUsingFiles: true

    # --- Live processes + containers ---
    processAgent:
      enabled: true
      processCollection: true

    # APM left disabled for now (fast-follow). dogstatsd available for custom metrics.
    dogstatsd:
      port: 8125
      useHostPort: true
      nonLocalTraffic: true

  clusterAgent:
    enabled: true
    replicas: 1
    nodeSelector:
      vps: hetzner                           # singleton -> control plane (matches vm-operator/vault)

  agents:
    enabled: true
    # DaemonSet restricted to senaev-media + hetzner via node affinity on the vps label.
    affinity:
      nodeAffinity:
        requiredDuringSchedulingIgnoredDuringExecution:
          nodeSelectorTerms:
            - matchExpressions:
                - key: vps
                  operator: In
                  values: [senaev-media, hetzner]
    tolerations:
      - operator: Exists                     # defensive: survive future taints

  kube-state-metrics:
    nodeSelector:
      vps: hetzner
```
K3s notes: `kubelet.tlsVerify: false` (self-signed kubelet cert) and
`criSocketPath: /run/k3s/containerd/containerd.sock` (non-standard socket path)
are both required or kubelet metrics / live containers fail.

### 2. Sync the API key from Vault (External Secrets)

The `ClusterSecretStore` `vault-cluster-secret-store` is cluster-scoped, so an
`ExternalSecret` in the `datadog` namespace can use it directly (same pattern as
`provisioning/helm/senaev-com/templates/external-secret.yaml`). We reuse the
existing `kv/senaev-com-kv` bag and add a `DD_API_KEY` property to it. The
Datadog chart expects a Secret whose key is named `api-key`, so we remap via
`secretKey`.

**`provisioning/helm/datadog/templates/external-secret.yaml`:**
```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: datadog-secrets
  namespace: {{ .Release.Namespace }}
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-cluster-secret-store
    kind: ClusterSecretStore
  target:
    name: datadog-secrets              # matches apiKeyExistingSecret
    creationPolicy: Owner
    deletionPolicy: Delete
  data:
    - secretKey: api-key            # key name the datadog chart reads
      remoteRef:
        key: senaev-com-kv
        property: DD_API_KEY
```
The existing `external-secrets-reader-acl-policy` already grants `read,list` on
`kv/data/*` + `kv/metadata/*`, so the new property is readable with no policy
change.

### 3. Add `DD_API_KEY` to Vault (manual, via the UI)

`DD_API_KEY` is a **regular app secret** — it has no cluster-bootstrap
dependency, so it is NOT threaded through the Makefile / `bootstrap-secrets.sh` /
`bootstrap-vault.sh`. (Only `TG_TOKEN_SENAEV_COM_BOT` is, because the bootstrap
script itself uses that token to send the Vault root token to Telegram.) Instead,
add it the same way as every other app secret (WEBDAV passwords, XRAY keys,
`OPENROUTER_API_KEY`, etc.):

- Open the Vault UI at `https://vault.senaev.com/ui/vault/secrets/kv/kv/senaev-com-kv/details/edit`
- Add a property `DD_API_KEY` = your Datadog API key (EU org), save.

The `ExternalSecret` (§2, refresh 1h) then syncs it into the `datadog-secrets`
Secret in the `datadog` namespace.

### 4. Makefile target + deploy chain

Add a `datadog` target (mirroring the `telemetry` target) and register it in
`.PHONY`:
```make
datadog:
	@$(MAKE) rsync
	$(REMOTE) "$(DEPLOY) datadog datadog"
```
Insert into the `services` chain after `telemetry`:
`traefik → secrets → telemetry → datadog → senaev-com`. No change to the
`secrets` target is needed.

### 5. CRDs

None. Do **not** create `provisioning/helm/datadog/crds/` — the plain Agent
chart needs no CRDs. (`DatadogMetric` CRD only matters for external-metrics HPA,
which is out of scope since we use API key only.)

## Critical files

- `provisioning/helm/datadog/Chart.yaml` (new)
- `provisioning/helm/datadog/values.yaml` (new)
- `provisioning/helm/datadog/templates/external-secret.yaml` (new)
- `provisioning/helm/datadog/charts/datadog-3.223.1.tgz` (vendored, new)
- `Makefile` (`.PHONY` + new `datadog` target + `services` chain)

No changes to `bootstrap-secrets.sh`, `bootstrap-vault.sh`, or `.env` — the API
key is a regular Vault secret added via the UI (§3).

## Verification

1. Add `DD_API_KEY` to `kv/senaev-com-kv` in the Vault UI (§3).
2. `make datadog` → creates `datadog` namespace + helm install.
3. On the control plane:
   - `kubectl get externalsecret -n datadog` → `SecretSynced`.
   - `kubectl get secret datadog-secrets -n datadog` → has `api-key`.
   - `kubectl get ds -n datadog` → DESIRED == 2 (senaev-media + hetzner),
     READY == 2.
   - `kubectl get deploy -n datadog` → cluster-agent Ready on hetzner.
   - `kubectl logs -n datadog ds/datadog -c agent` → no kubelet TLS / containerd
     socket errors.
4. In the Datadog EU app (app.datadoghq.eu):
   - Infrastructure → host map shows 2 hosts (senaev-media + hetzner).
   - Logs → live tail shows container logs from both the media stack and the
     control-plane services.
   - Orchestrator Explorer → pods/deployments/nodes visible.
   - Processes → live process list from both nodes.

## Possible fast-follow (not in this plan)
- **APM** via Single Step Instrumentation (Cluster Agent admission controller,
  `datadog.apm.instrumentation.enabled` scoped to `senaev-com`) — no code
  changes. Or manual `dd-trace` in the Node.js services.
- Add `DD_APP_KEY` + `clusterAgent.metricsProvider` if Datadog-metric HPA is
  ever wanted.
- `kube_apiserver_metrics` cluster check for K3s apiserver metrics.
- Watch Datadog ingestion billing (logs are billed by volume; `containerCollectAll`
  collects everything — can later exclude noisy containers via
  `containerExclude`).
