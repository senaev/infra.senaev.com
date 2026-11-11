# Coding-agent instances

`values.yaml` contains one enabled entry: `codingAgentInstances.senaev`.
Each entry renders OpenCode (web/API plus Telegram and MCP OAuth proxy), OMP Web
and, when enabled, Code Tools. The existing senaev-com release continues to own
all resources. This is one reusable set of templates, not a copy per server.

The entry name is the prefix of every resource name, label and selector of the
instance: entry `senaev` renders `senaev-opencode-telegram`, `senaev-opencode-telegram-git`,
`senaev-omp-web-state`, `senaev-code-tools` and so on. Renaming an entry replaces
all its resources, including its PVCs, so it needs the data migration below.
cluster-helper calls `http://senaev-code-tools:8080`, so the `senaev` entry must keep Code Tools enabled.

## Existing installation

The `senaev` entry keeps the OpenCode host directory
(`/k3s-cluster/volumes/opencode-data`), domains, credentials, images and node.
The former top-level `opencode` and `ompWeb` values now live under this entry.
No second instance or server is provisioned here.

### Migration from the unprefixed names

The first deploy of this change deletes the unprefixed resources and creates the
`senaev-` ones with empty PVCs. The OpenCode sessions and credentials are on the
host directory and are not affected. Copy the PVC data by hand:

1. Before the merge, keep the repository PVC. Helm does not delete a removed
   resource whose live object has the `keep` policy; `omp-web-state` already has it:

   ```
   kubectl -n senaev-com annotate pvc opencode-telegram-git helm.sh/resource-policy=keep
   ```

2. Merge and let CI deploy. Check that `opencode-telegram-git` and `omp-web-state`
   still exist and that the `senaev-` PVCs are `Bound`.
3. Stop the new workloads:

   ```
   kubectl -n senaev-com scale deploy senaev-opencode-telegram senaev-omp-web senaev-code-tools --replicas=0
   ```

4. Copy the data with a one-off pod on the same node (`hetzner`): mount
   `opencode-telegram-git` and `senaev-opencode-telegram-git`, and `omp-web-state`
   and `senaev-omp-web-state`, then run `cp -a /old/. /new/` for each pair.
5. Scale the three Deployments back to 1, and check OpenCode, Telegram, OMP Web and
   the cluster-helper `code-*` tools.
6. When everything works, delete the two old PVCs by hand.

To roll back, revert the change: the old PVCs still have their Helm ownership
metadata, so the previous chart takes them over again.

## Adding an instance later

Add a complete entry alongside `senaev`; entries do not inherit its
credentials, instructions, Git identity, node, data paths or MCP configuration.
The `senaev` entry is the reference for the required structure.

| Setting | Meaning |
| --- | --- |
| Entry name | Unique lowercase DNS name, e.g. `family`, at most 30 characters; with `-` added it prefixes resources, selectors, PVCs and authentication resources. |
| `opencode.vps` | Application node's existing `vps` label, independently of the ingress node. |
| `ingress.className` | Ingress class watched by the chosen Traefik. |
| `ingress.namespace`, `ingress.traefikDeployment` | Namespace and `traefik-deployment` label of the Traefik pods allowed by NetworkPolicies. |
| `ingress.entrypoints`, `ingress.certResolver` | HTTPS entrypoint and certificate resolver configured in that Traefik. |
| `opencode.hostname` | Unique public OpenCode domain. |
| `opencode.mcpOAuth.hostname`, `callbackPort` | Public callback host and pod-local callback port; normally reuse the OpenCode hostname. Register the new callback with the relevant MCP providers. |
| `ompWeb.hostname` | Independent OMP domain, served by the same selected Traefik. |
| `opencode.dataPath` | Absolute, separate host directory for OpenCode state and saved credentials. Overlapping paths are rejected. |
| `opencode.projectsStorageSize`, `ompWeb.storageSize` | Sizes of this instance's new project and OMP state PVCs. |
| `secrets.name` | Existing Kubernetes Secret containing this instance's runtime credentials. Provision it separately, normally through External Secrets. |
| `secrets.githubToken`, `sshPrivateKey`, `telegramToken`, `telegramAllowedUser`, `codeToolsToken` | Key names inside that runtime Secret. Code Tools token is unused when Code Tools is disabled. |
| `secrets.storeName`, `storeKind`, `vaultPath` | External Secrets store and Vault path for the generated web-auth Secrets. |
| `secrets.opencodePassword`, `ompHtpasswd` | Vault property names for OpenCode's password and OMP's `username:bcrypt-hash` entry. These are references, never password values. |
| `owner` | Git author/committer name and email for this instance. |
| `instructionsPath` | Chart-relative folder containing this instance's `AGENTS.md` and `CLAUDE.md`. Create appropriate instructions instead of giving relatives the senaev server rules. |
| `agentConfigFile` or `agent` | Chart-relative JSON config file, or an inline config object: MCPs, model, connectors and transcription. |
| `codeTools.enabled` | Set `false` for the future family instance. `cluster-helper` only calls `senaev-code-tools` with the `senaev` token; enabling Code Tools for another instance renders a Service with no configured client routing to it. |

`agentConfigFile` currently points to `config/coding-agents.json` for `senaev`.
For a second instance, use a separate config file or inline `agent` with its own
MCP allowlist. Connector `apiKeyEnv` chooses the application's environment
variable; optional `secretKey` chooses the corresponding key inside `secrets.name`
(default: the same as `apiKeyEnv`). The same override is available for
`speechToText.secretKey`. This permits a separate OpenRouter key without changing
the application environment variable. No actual tokens belong in values/config.

All three applications within one instance intentionally share its repository
PVC at `/projects/git`. Other instances receive different PVC names and directories.
Helm rejects invalid entry names, duplicate web domains and overlapping state paths. OMP and optional Code Tools have affinity only to their own OpenCode pod.
The workloads still give their authorized users shell access and share credentials
within an instance; this does not introduce per-user sandboxing.

## A new VPS behind the .ru Traefik

This implementation targets another **K3s worker in the existing cluster**.
Join the new VPS through the existing worker provisioning/Tailscale setup, label
it appropriately, then choose that label in `opencode.vps`. Set `ingress` to the
existing .ru Traefik, and point the new public domains at that Traefik.
Kubernetes Services route to the pods on the new worker; the existing cluster's
cross-node networking uses Tailscale. Application placement and ingress placement
are independent. No fixed public or Tailscale IP belongs in these templates.

Check that the selected Traefik watches this namespace/ingress class and that
its node can reach the new worker through the established cluster network.
Provision separate runtime secrets and storage before enabling the entry.
Do not move the existing local volumes to another node by changing `vps`;
existing data needs a separate migration. Disk backups remain an operational task.

A standalone Docker VPS outside K3s would require an explicit Traefik external
upstream and a separate deployment mechanism; this PR does not implement that mode.

## Validation

`npm run check:helm` lints every chart and runs real Helm rendering integration
tests. They cover the existing installation, two simultaneous instances with
independent VPS/Traefik/credentials/storage, optional Code Tools, OAuth callbacks,
resource references and rejection of unsafe naming/storage collisions.
Before merging a change to these templates, compare the rendered resource objects
with the base revision, and check that only the intended objects change.
