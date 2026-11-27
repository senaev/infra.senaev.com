# VPN Architecture

Xray VPN with VLESS+Reality protocol, deployed across 3 nodes. Clients receive connection configs via the `vpn-subscription` web service.

Key generation: see `XRAY_VPN.md`.

## Components

### Xray VPN servers (3 instances)

Each instance runs as a Kubernetes Deployment in the `vpn` namespace (release `vpn`, chart `provisioning/helm/vpn`) on its respective node:

Inter-instance routing uses internal Socks proxies (port 1080). Instances chain traffic to each other before exiting to the internet.

### Hysteria2 servers (UDP)

`xrayHysteria.instances` (`templates/xray-hysteria.yaml`): one Deployment `xray-hysteria-<name>` per
enabled instance, on its node (`vps`), one Hysteria2 (QUIC) inbound per port through a UDP `hostPort`.
TLS uses the Let's Encrypt certificate that Traefik keeps on the same node for `serverName`: the
`certificate-init` init container and the `certificate-refresh` sidecar copy it from `acme.json`
(hostPath `xrayHysteria.acmeStoragePath`, read-only) into an `emptyDir`; Xray reloads certificate files
every hour. If the certificate is missing, only that pod fails. `hostNetwork: true` (on `firstvds`)
runs the pod on the node's network: the pod MTU (~1280, flannel VXLAN over tailscale0) is smaller
than QUIC's handshake packets (1280 bytes of UDP payload, 1308 on the wire; Xray cannot lower it),
so in the pod network the server never sent its certificate. On the host network the port goes
through the node's INPUT chain, so the node firewall must allow it (`ufw allow 47443/udp` on firstvds). A client without the user password gets
`https://<serverName>/` through the masquerade proxy. `exit` is where traffic leaves: `freedom` when it
is the instance's own node, otherwise the SOCKS inbound (1080) of the xray-vpn instance on that node,
over the cluster network (Tailscale), as profile 1 does.

| Instance | Profiles | Port | State |
|---|---|---|---|
| `hetzner` | 6 (UDP 47443, salamander), 7 (UDP 443) | Hetzner, exit Hetzner | **off since 2026-11-26**: the home ISP drops both; profile 6 worked only from outside Russia |
| `firstvds` | 10 `hysteria2://{XRAY_USER_UUID:10}@senaev.ru:47443?sni=senaev.ru&obfs=salamander&obfs-password={XRAY_USER_UUID:10-obfs}` | FirstVDS UDP 47443, salamander, exit Hetzner | added 2026-11-27 (round 9), **recommended from home** since round 10; profile 9 (the same on UDP 443 without salamander) is off: its QUIC handshake replies were dropped on the way home |

The password is the UUID derived from the profile's seed, like the VLESS users; the salamander
password (`finalmask.udp`, set when an inbound has `obfsPasswordMacro`) the UUID of seed `6-obfs` (`10-obfs` for profile 10).
Server and probe log at `info`: Xray logs Hysteria errors only at that level.

- The `vpn-probe` NetworkPolicy allows public egress on TCP 443 and on the UDP ports of the enabled
  instances (and `xrayWireguard.port`) only. A probe for a new UDP transport needs its port there, or
  its packets are dropped inside the cluster and the route looks blocked.
- `vpnProbe.remoteSources` runs the probe of a profile also on another node
  (`vpn-probe-<index>-<vps>`, profile name with ` (from <vps>)`), to tell a home ISP block from
  a server-side problem. None run now: firstvds (1 vCPU, 1 GB) was swapping, and probe
  restarts during a deploy made senaev.ru (its Traefik) time out (2026-11-25). The XHTTP
  source-control probe runs only on `vpnXhttpExperiment.sourceControlNodes` (hetzner).

### WireGuard server (UDP, probe only)

**Off since 2026-11-26** (`xrayWireguard.enabled: false`, entry 8 removed): no packet of profile 8
reached Hetzner from home.

`xray-wireguard` (`templates/xray-wireguard.yaml`, values `xrayWireguard`) is a separate
Deployment on hetzner: Xray's WireGuard inbound on UDP 41642 (`hostPort`), in user space (gVisor
netstack, no tun device or `NET_ADMIN`), exit there. Profile 8,
`wireguard://{XRAY_WIREGUARD_PRIVATE_KEY:8}@senaev.com:41642?publickey={XRAY_WIREGUARD_PUBLIC_KEY:8-server}&address=10.0.0.2/32&mtu=1280`,
is a diagnostic (added 2026-11-25): Happ cannot import WireGuard, so the entry has
`subscription: false` and only the probes use it.

- Keys: `{XRAY_WIREGUARD_PRIVATE_KEY:<seed>}` is `sha256("<XRAY_USER_UUID>:wireguard:<seed>")`,
  clamped for X25519, base64url without padding; `{XRAY_WIREGUARD_PUBLIC_KEY:<seed>}` its public
  key. The render script derives both with Node.js crypto when included with
  `(dict "wireguard" true)` (other callers keep the script unchanged); `vpn-probe` derives the
  private key in Python and the public key with `xray x25519 -i`. The probe image build checks
  that both give the same key pair. vpn-subscription does not know these macros.
- An entry with `subscription: false` is probed but not sent to subscription clients.
- Each probe source needs its own peer in `xrayWireguard.peers` (home: seed `8`, `10.0.0.2`), and
  a remote source its own link (`remoteSources[].link`): two clients with one key would take over
  each other's endpoint (WireGuard roaming).

### VPN alerts

Group `vpn` in `provisioning/helm/senaev-com/templates/alerts.yaml`, to the cluster Telegram chat:

- `vpn-profile-failing` (per `profile_index`, profiles 10 and 1; was `vpn-profile-1-failing`
  until round 10): more than half of a profile's parity checks fail through the VPN in 30
  minutes, counting only the checks whose direct twin mostly passes in the same window (for 10
  minutes), so a target outage does not fire it.
- `vpn-firstvds-stalled`: the mean smokeping RTT over Tailscale to firstvds from all nodes is above
  0.5 s (normally 17–70 ms) for 5 minutes. On 2026-11-26 19:40–21:30 UTC the VM stalled at the
  provider (pings 0.5–16 s, CPU minutes with no time accounted) and profile 1 failed ~75 %.

### vpn-subscription service

Node.js/Fastify service at `vpn-subscription.senaev.com`. Authenticated by a secret URL path (`VPN_SUBSCRIPTION_SECRET`).

**GET `/:secret`** — returns connection config or HTML instructions based on `User-Agent`:
- VPN apps (HiddifyNext, Happ): subscription body with the VLESS entries and the Hysteria2 entry
- Browsers: HTML page with setup instructions and deep links

**POST `/:secret`** — receives error reports from clients, forwards to Telegram via `cluster-helper`.


## Network flow

Port 443 on each VPS serves both the public website and VPN clients. Traefik routes by SNI: TLS connections that match the VPN SNI are passed through raw to Xray (Reality terminates TLS); everything else has TLS terminated by Traefik (Let's Encrypt) and is forwarded plain HTTP to the Next.js app.

```mermaid
flowchart TD
    Client["Client :443\nSNI = senaev.com / senaev.ru"]
    Xray["Xray inbound"]
    Cond{"valid uTLS fingerprint\n+ VLESS UUID?"}
    Reality["Reality terminates TLS\nrouting by user UUID"]
    Socks["Socks proxy :1080\n→ another Xray instance"]
    Freedom["Freedom\n→ public internet"]
    Traefik2["Traefik\nwebsecure-xray :8443\nterminates TLS (Let's Encrypt)"]
    NextJS["Next.js app :3000\nplain HTTP"]

    Client --> Xray
    Xray --> Cond
    Cond -->|YES| Reality
    Reality --> Socks
    Reality --> Freedom
    Cond -->|NO — forward raw connection| Traefik2
    Traefik2 --> NextJS
```

## Config rendering

Xray config is generated at pod start by an initContainer (node:22-alpine):

1. ConfigMap holds the config template with placeholders: `{XRAY_REALITY_PRIVATE_KEY}`, `{XRAY_USER_UUID:seed}`
2. InitContainer substitutes secrets from environment variables
3. UUID derivation: `SHA256(baseUUID:seed).substring(0,32)` formatted as UUID — same logic used in both Xray config and `vpn-subscription`
4. Final config written to `/etc/xray/config.json`

## Secrets

All secrets live in HashiCorp Vault under key `senaev-com-kv`, synced to the `vpn` namespace via the existing ClusterSecretStore and ExternalSecrets operator.
The Vault store and property names are unchanged. The new namespaced Kubernetes secret
contains only VPN properties; the old shared secret is left unchanged during migration
to avoid reloader restarts of unrelated services.

The subscription service posts its Telegram error reports to
`https://cluster-helper.senaev-com.svc.cluster.local:8443/telegram/send-message` over mTLS, with the
certificate `vpn-subscription-tls` of the `vpn` release. The ExternalName Service `cluster-helper` that
this namespace had after the move is gone, and so is the old plain-HTTP rule for it. Website fallback
ingresses remain in `senaev-com`; Xray already uses fully qualified Traefik service names.

See [cutover and rollback](projects/2026-06-10-debug-vpn-connection/NAMESPACE-MIGRATION.md).

Secrets:

| Secret | Purpose |
|---|---|
| `XRAY_USER_UUID` | Base UUID for per-user derivation |
| `XRAY_REALITY_PRIVATE_KEY` | X25519 private key (server) |
| `XRAY_REALITY_PUBLIC_KEY` | X25519 public key (sent to clients) |
| `VPN_SUBSCRIPTION_SECRET` | URL auth token |
| `VPN_SUBSCRIPTION_CHAT` | Telegram group URL for error reports |

Pod reloader watches both the Vault secret and config ConfigMap — any change triggers a rolling restart.

## Diagnostic clients

`vpn-probe` builds the Python/curl runner and pinned Xray client. The VPN chart creates
one isolated pod per subscription entry on senaev-media. Results go to Datadog as
`service:vpn-probe`. VMPodScrape collects metrics every 30s on port 8080, reachable
only by telemetry vmagent. The provisioned Grafana dashboard UID is `vpn-probes`.
There is no inbound Service or host network configuration.

### Manual routing safety check

From the repository root, with Helm, curl and pinned Xray 26.9.30 available:

```sh
XRAY_BINARY=/absolute/path/to/xray python3 vpn-probe/routing.integration.py
```

This renders the real FirstVDS config and tests user routing with temporary fake
credentials and loopback plain VLESS (Reality/Vision transport is excluded).
The selected exit must work, then fail without reaching the origin even with a
working alternate exit, then recover. It runs manually, outside CI/CD.

Happ subscriptions request `socks-auth-mode: auto` and `http-auth-mode: auto`.
Happ generates local proxy credentials and injects them into its tunnel; no new
Vault secret is used. Manually configured applications using Happ's local proxy
must use its generated credentials. Verify after refreshing a real Happ client;
server tests cannot establish behavior of every client version. Reverting the
headers may leave imported client settings in place: restore the previous
Inbounds authentication mode in Happ if needed.
