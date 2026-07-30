# 2026-07-30 — Prowlarr: indexer PUT returns 400, "Connection refused (kinozal.tv:443)"

> **This file is the working log for the investigation.** All findings, command outputs,
> hypotheses confirmed/refuted, and the eventual fix must be appended here as we go — so
> the whole debug session lives in one place and is searchable later.
>
> Format: append new dated sections under `## Findings` as work proceeds. Don't rewrite
> earlier sections — annotate them.

## Symptom

The `qbittorrent-download-client-configurer` sidecar fails on every 30s retry loop:

```
❌ Failed to configure Prowlarr: PUT http://127.0.0.1:9696/api/v1/indexer/1 failed with status 400: [
  {
    "isWarning": false,
    "detailedDescription": "Connection refused",
    "propertyName": "",
    "errorMessage": "Unable to connect to indexer. This is typically caused by DNS/SSL issues. Check DNS settings, ensure IPv6 is working or disabled, consider using different DNS servers, or try a VPN/proxy if needed. See: 'https://wiki.servarr.com/prowlarr/troubleshooting#dns-ssl-connection-issues' Connection refused (kinozal.tv:443)",
    "severity": "error"
  }
]
```

Matching entry in the `prowlarr` main container log:

```
[Warn] ProwlarrErrorPipeline: Invalid request Validation failed:
 -- : Unable to connect to indexer. This is typically caused by DNS/SSL issues. ...
    Connection refused (kinozal.tv:443)
```

Stack trace confirms the failure path is `HttpIndexerBase.TestConnection()` →
`FetchPage` → `FetchIndexerResponse` → `IndexerHttpClient.ExecuteProxiedAsync` →
`ManagedHttpDispatcher.GetResponseAsync` → `SocketException`. Prowlarr runs
`TestConnection()` synchronously as part of `PUT /api/v1/indexer/{id}` validation, so a
failing tracker reachability check turns the save into a `400`.

## Context (architecture refresher)

- Prowlarr Deployment: `provisioning/helm/senaev-com/templates/prowlarr.yaml`, namespace
  `senaev-com`, pinned to the `hetzner` node (`values.yaml:91`).
- Indexers are declaratively provisioned from `values.yaml:109-167` into a ConfigMap
  (`indexers.json`) and applied by
  `provisioning/helm/senaev-com/config/prowlarr/configure-qbittorrent-download-client.py`.
- The `PUT .../indexer/1` call is `upsert_indexer()` (script lines 360-378) taking the
  *update* branch, i.e. indexer id 1 already exists — that is **Kinozal**.
- Kinozal base URL is pinned at `values.yaml:119-120` → `https://kinozal.tv/`.
- FlareSolverr exists (`templates/flaresolverr.yaml`, `values.yaml:96-101`) and is
  registered as an `indexerproxy` carrying the `flaresolverr` tag.
- **No** `dnsConfig`, `hostAliases`, `HTTP_PROXY`/`HTTPS_PROXY`, or SOCKS proxy is wired
  to Prowlarr anywhere in the repo. Egress is stock K3s CoreDNS → hetzner host resolver,
  direct to the internet. The Xray VPN (`_helpers.tpl:45-85`) is unrelated and unused by
  Prowlarr.

## Hypotheses, ranked

1. **(A) `kinozal.tv` no longer serves HTTPS — port 443 is closed at the origin.**
   `Connection refused` is a TCP RST, not a timeout and not a DNS failure. DNS clearly
   resolved (the error names the host *and* the port), and a blocked/DPI-filtered path
   would produce a timeout or reset mid-TLS, not an instant refusal on connect. The
   simplest explanation is that nothing is listening on 443 at the resolved IP.
   - `Signal:` `kinozal.tv:443` refuses connections from an unrelated host too, while
     `:80` accepts; `http://kinozal.tv/` returns a real page.
   - `Fix:` change `values.yaml:120` to a base URL that is actually reachable and is
     accepted by Prowlarr's `kinozal` Cardigann definition.

2. **(B) DNS hijack/sinkhole on the hetzner resolver** returning an IP that RSTs on 443.
   - `Signal:` the IP resolved inside the pod differs from public DNS, or is a private /
     loopback / sinkhole address.
   - `Fix:` add a `dnsConfig` with public resolvers to the Prowlarr Deployment.

3. **(C) IPv6 egress broken** — Prowlarr's own error text suggests this. A returned AAAA
   with no working IPv6 route can surface as a connect failure.
   - `Signal:` `kinozal.tv` publishes AAAA records and the node has no IPv6 route.
   - `Fix:` disable IPv6 for the pod or force IPv4.

4. **(D) Cloudflare / anti-bot block requiring FlareSolverr.**
   - `Signal:` a challenge page (403 / CF 1020) rather than a connection-level error.
   - `Fix:` tag the Kinozal indexer with `flaresolverr`.
   - Note: this hypothesis is weak for *this* symptom — a CF block is an HTTP-layer
     response, and we never completed a TCP handshake.

## Collaboration model

Claude proposes commands; the user runs them and pastes output. Claude does **not** run
`kubectl` or SSH itself. Round 1 is strictly read-only — no writes, no restarts, no
config changes — until the fault is localised.

## Round 1 diagnostic commands

Run from a machine outside the cluster (laptop) — establishes whether the tracker itself
is at fault, independent of cluster networking:

```bash
# 1. What does kinozal.tv resolve to, and does it publish IPv6?
dig +short A kinozal.tv
dig +short AAAA kinozal.tv
dig +short NS kinozal.tv

# 2. Is 443 actually open? Is 80?
nc -vz -w 5 kinozal.tv 443
nc -vz -w 5 kinozal.tv 80

# 3. Does plain HTTP serve the real site?
curl -sS -I -m 10 http://kinozal.tv/

# 4. Which mirrors have working TLS?
for h in kinozal.tv kinozal.guru kinozal.me kinozal.website; do
  printf "%-20s %s\n" "$h" "$(nc -z -w 4 $h 443 2>/dev/null && echo 443-OPEN || echo 443-REFUSED)"
done

# 5. Which base URLs will Prowlarr's definition accept?
curl -sSL https://raw.githubusercontent.com/Prowlarr/Indexers/master/definitions/v11/kinozal.yml | head -14
```

| Command | Result | Points to |
|---|---|---|
| **1** | AAAA present + node has no IPv6 | Hypothesis C |
| **1** | A record is public/plausible | rules out B |
| **2** | `443` refused from an unrelated host, `80` open | **Hypothesis A** |
| **2** | `443` open from laptop but refused in-cluster | Hypothesis B |
| **3** | 200 + real HTML | confirms origin is HTTP-only |
| **4** | some mirror has 443 open | gives the fix target |
| **5** | definition `links` / `legacylinks` | constrains the allowed `baseUrl` |

## Fix options (pending Round 1 output)

- **A — repoint `baseUrl`** in `provisioning/helm/senaev-com/values.yaml:120` to a
  reachable value that appears in the definition's `links`/`legacylinks`.
- **B — add `dnsConfig`** (`1.1.1.1` / `8.8.8.8`) to the Prowlarr Deployment.
- **C — force IPv4** on the pod / disable IPv6 on the node.
- **D — add `tags: ["flaresolverr"]`** to the Kinozal entry so the FlareSolverr proxy
  applies. Required if the chosen base URL sits behind Cloudflare.

## Verification

1. Sidecar log shows `✅ Updated Prowlarr indexer [Kinozal]` followed by
   `✅ Waiting indefinitely to keep container alive...` — no more 30s retry loop:
   ```bash
   kubectl -n senaev-com logs deploy/prowlarr -c qbittorrent-download-client-configurer --since=5m
   ```
2. Prowlarr's own test passes:
   ```bash
   kubectl -n senaev-com exec deploy/prowlarr -c prowlarr -- \
     sh -c 'wget -qO- --post-data="" --header="X-Api-Key: $(grep -oP "(?<=<ApiKey>)[^<]+" /config/config.xml)" \
       http://localhost:9696/api/v1/indexer/testall'
   ```
3. End-to-end: send a real search via Telegram (e.g. "Inception 2010") and confirm
   Kinozal results appear with `count > 0`.

---

## Findings

### 2026-07-30 — Round 1 results (run from laptop)

**Command 1 — DNS:**
```
$ dig +short A kinozal.tv
188.120.248.158
$ dig +short AAAA kinozal.tv
(empty)
$ dig +short NS kinozal.tv
dale.ns.cloudflare.com.
lisa.ns.cloudflare.com.
```
Interpretation: a single public IPv4, **no AAAA record** → **Hypothesis C (IPv6) is
refuted**. Note the nameservers are Cloudflare's but the A record is a direct Russian
hosting IP (`188.120.248.158`), not a Cloudflare edge address — meaning kinozal.tv uses
Cloudflare for DNS only, with proxying **disabled** (grey cloud). Traffic goes straight to
the origin.

**Command 2 — port reachability:**
```
$ nc -vz -w 5 kinozal.tv 443
nc: connectx to kinozal.tv port 443 (tcp) failed: Connection refused
$ nc -vz -w 5 kinozal.tv 80
Connection to kinozal.tv port 80 [tcp/http] succeeded!
```
Interpretation: **the exact same `Connection refused` on 443 reproduces from a host
completely outside the cluster**, while port 80 accepts. This is the tracker's origin, not
cluster DNS or egress → **Hypothesis B (DNS hijack) refuted, Hypothesis A confirmed.**

**Command 3 — plain HTTP works:**
```
$ curl -sS -I -m 10 http://kinozal.tv/
HTTP/1.1 200 OK
Server: nginx/1.29.5
Date: Thu, 30 Jul 2026 19:43:25 GMT
Content-Type: text/html; charset=windows-1251
Connection: keep-alive

$ curl -sS -I -m 10 https://kinozal.tv/
curl: (7) Failed to connect to kinozal.tv port 443 after 170 ms: Couldn't connect to server
```
Interpretation: the origin nginx serves the real Kinozal homepage over **plain HTTP only**
(`windows-1251` charset matches the definition's `encoding: windows-1251`). It has no TLS
listener at all. No Cloudflare challenge in the way → **Hypothesis D refuted** for this
symptom.

**Command 4 — mirror TLS status:**
```
kinozal.guru             A=188.114.97.5       443=OPEN     80=OPEN
kinozal.me               A=172.67.142.133     443=OPEN     80=OPEN
kinozal.appspot.com      A=142.251.140.244    443=OPEN     80=OPEN
kinozal.website          A=104.17.232.29      443=OPEN     80=OPEN
kinozal.tv               A=188.120.248.158    443=REFUSED  80=OPEN
```
Body checks:
```
https://kinozal.guru/     http=302 redirect=https://kinozal.guru/login.php?m=5
https://kinozal.me/       http=200 size=32174
https://kinozal.website/  SSL handshake failure (sslv3 alert handshake failure)
http://kinozal.tv/        http=200 size=32418
```
Interpretation: `kinozal.tv` is the **only** hostname with 443 refused. The mirrors resolve
to Cloudflare edge IPs (`188.114.x`, `172.67.x`, `104.17.x` = orange cloud) and terminate
TLS at Cloudflare. `kinozal.guru` 302-redirects to `login.php` — expected for an
unauthenticated hit on a semi-private tracker root, so it is alive.

**Command 5 — Prowlarr definition constraints:**
```yaml
id: kinozal
name: Kinozal
encoding: windows-1251
links:
  - https://kinozal.tv/
  - https://kinozal.guru/
legacylinks:
  - https://kinozal-tv.appspot.com/
  - http://kinozal.tv/
  - https://kinozal-guru.appspot.com/
```
Interpretation: `baseUrl` for a Cardigann indexer is constrained to `links` +
`legacylinks`. So only **four** values are viable, and of those only two are reachable:
- `http://kinozal.tv/` — a `legacylink`; **works today** (direct origin, plaintext, no CF)
- `https://kinozal.guru/` — a current `link`; **works today** (Cloudflare-fronted TLS)
- `https://kinozal.tv/` — currently configured, **broken** (443 refused)
- the two `*.appspot.com` legacy links — long dead

---

**Conclusion: Hypothesis A confirmed.** `kinozal.tv` dropped its HTTPS listener; the
origin serves plain HTTP on port 80 only. `values.yaml:120` pins `https://kinozal.tv/`,
so Prowlarr's mandatory `TestConnection()` during `PUT /api/v1/indexer/1` gets an instant
TCP RST and rejects the save with `400`. Nothing is wrong with the cluster, its DNS, its
egress, or the configurer script. Hypotheses B, C and D are all refuted by evidence.

Secondary finding (pre-existing, not the cause): the Kinozal entry in `values.yaml:110-140`
has **no `tags:` key**, so `build_indexer()`
(`configure-qbittorrent-download-client.py:351`) sets `indexer["tags"] = []` on every
apply. This actively strips any `flaresolverr` tag from Kinozal. Consequently the
FlareSolverr proxy — which is deployed, enabled, and tagged `flaresolverr` — is attached to
**no indexer at all**. Irrelevant while using the plaintext origin, but it becomes a
blocker if the base URL is moved to a Cloudflare-fronted mirror.

---

### Fix applied — 2026-07-30

Chose `http://kinozal.tv/` over `https://kinozal.guru/`: it hits the origin directly with
no Cloudflare in front, so no FlareSolverr dependency and no anti-bot challenge surface.
Accepted tradeoff: the tracker login and passkey now traverse the hetzner→origin path in
plaintext.

`provisioning/helm/senaev-com/values.yaml`:

```diff
         - name: "definitionFile"
           value: "kinozal"
+        # kinozal.tv dropped its HTTPS listener (443 refuses connections); the origin
+        # serves plain HTTP only. This is a `legacylink` in Prowlarr's kinozal Cardigann
+        # definition, so it is an accepted baseUrl. See
+        # issues/2026-07-30-prowlarr-kinozal-connection-refused.md
         - name: "baseUrl"
-          value: "https://kinozal.tv/"
+          value: "http://kinozal.tv/"
```

Verified the rendered ConfigMap picks it up:

```
$ helm template senaev-com provisioning/helm/senaev-com \
    -f provisioning/helm/common-values.yaml -f provisioning/helm/senaev-com/values.yaml \
  | yq 'select(.metadata.name == "prowlarr-default-config") | .data["indexers.json"]' \
  | yq -p json '.[] | select(.name == "Kinozal") | .fields[] | select(.name == "baseUrl")'
name: baseUrl
value: http://kinozal.tv/
```

Rollout path: push to `main` → `.github/workflows/update-helm-charts.yml` deploys the
`senaev-com` chart → `prowlarr-default-config` ConfigMap changes → the Stakater reloader
annotation (`templates/prowlarr.yaml:65`) restarts the Prowlarr pod → the sidecar re-runs
`upsert_indexers()` with the new `baseUrl`.

Note: the sidecar mounts `indexers.json` from the ConfigMap, so a plain
`kubectl rollout restart` **without** deploying the chart first would re-apply the old
`https://` value and fail again.

Not changed (deliberately): the missing `tags:` on Kinozal. FlareSolverr is unnecessary for
the plaintext origin, and adding the tag would be a behaviour change beyond this fix. Left
documented above as a known gap.

---

## Resolution

**Root cause:** `kinozal.tv` removed its HTTPS listener — the origin (`188.120.248.158`,
Cloudflare DNS with proxying disabled) serves plain HTTP on port 80 only and sends a TCP
RST on 443. `values.yaml:120` pinned `https://kinozal.tv/`. Prowlarr executes
`HttpIndexerBase.TestConnection()` as part of `PUT /api/v1/indexer/{id}` validation, so the
unreachable tracker made the indexer save fail with `400`, and the configurer sidecar
looped on it every 30s forever without reaching `wait_forever()`.

**Fix:** set `baseUrl` to `http://kinozal.tv/` — an accepted `legacylink` in Prowlarr's
`kinozal` Cardigann definition and confirmed reachable.

**Not at fault:** cluster DNS, CoreDNS, IPv6, node egress, FlareSolverr, SQLite
permissions, and the configurer script. The identical failure reproduces from any host on
the internet.

**Open question:** whether kinozal.tv's missing TLS is permanent or a lapsed certificate
they intend to restore. If 443 comes back, `https://kinozal.tv/` can be restored. Worth
re-checking with `nc -vz kinozal.tv 443` if the plaintext link ever starts failing.
