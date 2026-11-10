# Coding-agent instances

`values.yaml` contains one enabled entry: `codingAgentInstances.personal`.
Each entry renders OpenCode (web/API plus Telegram and MCP OAuth proxy), OMP Web
and, when enabled, Code Tools. The existing senaev-com release continues to own
all resources. This is one reusable set of templates, not a copy per server.

## Existing installation

The personal instance retains the existing resource names, Deployment selectors,
PVCs (`opencode-telegram-git`, `omp-web-state`), OpenCode host directory
(`/k3s-cluster/volumes/opencode-data`), domains, credentials, images and node.
Do not change its empty `resourcePrefix`, `opencode.ingressName` or storage paths
when deploying this refactor. No second instance or server is provisioned here.
The former top-level `opencode` and `ompWeb` values now live under this entry.

## Adding an instance later

Add a complete entry alongside `personal`; entries do not inherit personal
credentials, instructions, Git identity, node, data paths or MCP configuration.
The `personal` entry is the reference for the required structure.

| Setting | Meaning |
| --- | --- |
| `resourcePrefix` | Unique DNS prefix ending in `-`, e.g. `family-`; prefixes resources, selectors, PVCs and authentication resources. Empty is reserved by convention for the existing installation. |
| `opencode.vps` | Application node's existing `vps` label, independently of the ingress node. |
| `ingress.className` | Ingress class watched by the chosen Traefik. |
| `ingress.namespace`, `ingress.traefikDeployment` | Namespace and `traefik-deployment` label of the Traefik pods allowed by NetworkPolicies. |
| `ingress.entrypoints`, `ingress.certResolver` | HTTPS entrypoint and certificate resolver configured in that Traefik. |
| `opencode.hostname`, `opencode.ingressName` | Unique public OpenCode domain and unique Kubernetes ingress name. |
| `opencode.mcpOAuth.hostname`, `callbackPort` | Public callback host and pod-local callback port; normally reuse the OpenCode hostname. Register the new callback with the relevant MCP providers. |
| `ompWeb.hostname` | Independent OMP domain, served by the same selected Traefik. |
| `opencode.dataPath` | Absolute, separate host directory for OpenCode state and saved credentials. Overlapping paths are rejected. |
| `opencode.projectsStorageSize`, `ompWeb.storageSize` | Sizes of this instance's new project and OMP state PVCs. |
| `secrets.name` | Existing Kubernetes Secret containing this instance's runtime credentials. Provision it separately, normally through External Secrets. |
| `secrets.githubToken`, `sshPrivateKey`, `telegramToken`, `telegramAllowedUser`, `codeToolsToken` | Key names inside that runtime Secret. Code Tools token is unused when Code Tools is disabled. |
| `secrets.storeName`, `storeKind`, `vaultPath` | External Secrets store and Vault path for the generated web-auth Secrets. |
| `secrets.opencodePassword`, `ompHtpasswd` | Vault property names for OpenCode's password and OMP's `username:bcrypt-hash` entry. These are references, never password values. |
| `owner` | Git author/committer name and email for this instance. |
| `instructionsPath` | Chart-relative folder containing this instance's `AGENTS.md` and `CLAUDE.md`. Create appropriate instructions instead of giving relatives the personal server rules. |
| `agentConfigFile` or `agent` | Chart-relative JSON config file, or an inline config object: MCPs, model, connectors and transcription. |
| `codeTools.enabled` | Set `false` for the future family instance. |

`agentConfigFile` currently points to `config/coding-agents.json` for personal.
For a second instance, use a separate config file or inline `agent` with its own
MCP allowlist. Connector `apiKeyEnv` chooses the application's environment
variable; optional `secretKey` chooses the corresponding key inside `secrets.name`
(default: the same as `apiKeyEnv`). The same override is available for
`speechToText.secretKey`. This permits a separate OpenRouter key without changing
the application environment variable. No actual tokens belong in values/config.

All three applications within one instance intentionally share its repository
PVC at `/projects/git`. Other instances receive different PVC names and directories.
Helm rejects duplicate prefixes, web domains, ingress names and overlapping state
paths. OMP and optional Code Tools have affinity only to their own OpenCode pod.
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
Before merging this refactor, compare rendered resource objects with the base
revision; only template source locations should change for the current values.
