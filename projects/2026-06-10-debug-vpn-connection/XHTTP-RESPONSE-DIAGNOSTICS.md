# Locate the XHTTP response stall

PR #144 deployed in run 42610055670. Websites and pods remained healthy. The first
home-source exit control failed: curl 28, HTTP status 0, body 0, total 8013ms and
cumulative destination TLS completion 2875ms. Backend X-Forwarded-For warnings
confirm the XHTTP requests arrived. They are not evidence of a forwarding error;
Xray ignores that untrusted header. No candidate size measurements ran because the
required exit validation failed. This is one live attempt, not a proven root cause.

## Diagnostic iteration

Enable vpnXhttpExperiment.diagnostics for temporary Info-level connection logs on
only the extra XHTTP client and isolated backend. Production clients/server configs
stay at their existing logging levels. Do not change transport, fingerprint, TLS
verification, multiplexing or the ordinary acceptance criteria.

After the first failed 8s candidate exit check in each home matrix, run once:

1. The same Cloudflare trace direct, then through TCP/Reality, with a random 2–7s
   pause before each control.
2. Fresh native-TLS XHTTP traces over HTTP/2 and HTTP/1.1, alternating order each
   matrix. Wait 60–90 random quiet seconds before each one.

Both arms use native Go TLS (fingerprint=unsafe), the same server name/path/UUID,
verified certificates, packet-up, a 4 KiB cap, 32 KiB/s and 8s total / 3s connect
budgets. Only ALPN changes: h2 versus http/1.1. Existing native H2 results retain
check=diagnostic_native_trace; H1 uses diagnostic_native_h1_trace. Existing Grafana
panels20/21 include both. HTTP1 with the Chrome fingerprint is rejected before
client startup; that earlier invalid combination is not part of this comparison.

Both arms use separate fresh processes on loopback1083 and temporary0600 config,
with unconditional cleanup. The original Chrome/H2 matrix candidate is unchanged;
diagnostic success never promotes a failed exit control. Four extra home requests
per failed matrix, at most16 KiB response payload. This replaces the completed
Chrome/native comparison without adding more requests or concurrent clients.

All deployed jitter remains: short2–7s before home direct/TCP diagnostic controls and
between precheck/download; condition/client60–90s, round300–360s, routine light
30–45s and heavy300–360s. Waits retain cancellation/child guards and separate log
fields. No extra retries, raised budgets or full H1 download matrix are added.

A successful H1 arm with failed H2 would prioritize HTTP-version/path interaction,
not prove ISP filtering or a particular bug. Changing HTTP version inherently
changes framing, multiplexing and connection usage as well as ALPN. Both failing
would mean H2 alone does not explain this trace failure. Compare both sources and
reversed order; time/DNS/path/latency remain confounders.

## Evidence and interpretation

All curl result logs add numeric cumulative pretransfer/first-byte timing and
HTTP request/header byte counts. No raw stderr, response body, full curl metadata,
credential-bearing configuration or headers are logged by the Python runner.
Info logs can contain fixed test destinations and XHTTP session identifiers.

Interpret first_byte_ms with HTTP status, header/body counts and request bytes;
rounded zero is not by itself proof that no packet arrived. These timings describe
the inner curl request, not the complete outer XHTTP handshake count or wire delivery.

- Direct and baseline trace succeed, candidate fails: focus on candidate forwarding.
- Native H1 succeeds while native H2 fails: prioritize HTTP-version/path interaction.
- Both fail from home but pass on Hetzner: continue investigating source/path dependence.
- Candidate diagnostics all fail after TLS: correlate client XHTTP HTTP/2 errors,
  backend VLESS destination/connection logs and the matching time window.
- Direct/baseline controls also fail: broader reachability or target state is involved.

Diagnostics run serially inside profile 4, so its baseline measurements pause during
this bounded sequence. Profile 1 remains independent. Added waits can extend a full
round beyond half an hour; Grafana uses a 40-minute display freshness and still may
show normal gaps under rotating condition order. Skipped payloads remain absent,
not fabricated as download failures. Diagnostic results have separate fixed checks.

## Rollback and verification

Set vpnXhttpExperiment.diagnostics=false and deploy to remove extra requests, return
experimental logging to warning level and profile 4 grace to 30 seconds.
Disabling vpnXhttpExperiment.enabled still removes the entire candidate.

Use normal CI to rebuild the changed existing image before charts. After deployment,
run the manual website smoke script, check client/backend readiness/restarts and
observe the next failed-exit sequence. No packet capture, host-network changes,
Happ settings, production subscriptions, new privileges or additional image.
Deployed via PR #145, run 42614899253 (main 960f34c).

## First deployed sequence — 2026-11-09

Experiment 94802da3-527a-47ea-a954-10b391454510, home source senaev-media.

| UTC | Control | Result | Evidence |
|---|---|---|---|
| 12:21:26 | XHTTP trace, 8s | Failed | curl 28, 8010ms, TLS 840ms, request 93 bytes, HTTP 0, headers/body 0 |
| 12:21:27 | Direct trace | Passed | HTTP 200, 219 body bytes, 501ms |
| 12:21:28 | TCP/Reality trace | Passed | HTTP 200, 214 body bytes, 685ms |
| 12:22:35 | XHTTP gstatic 204 | Failed | curl 28, 3009ms, TLS 0, request/header/body 0 |
| 12:23:52 | XHTTP HTTPBingo 256 bytes | Failed | curl 28, 3009ms, TLS 0, request/header/body 0 |
| 12:24:56 | XHTTP trace, total budget 30s | Failed | curl 28, 3011ms, TLS 0, request/header/body 0 |

Backend logs at 12:21:19 show VLESS accepted Cloudflare and freedom opened TCP to
104.16.123.96:443. The client reports XHTTP packet-up over HTTP/2. At 12:22:19 the
backend logged `failed to read body payload > stream error: stream ID 7; CANCEL`.
No corresponding gstatic/HTTPBingo backend destination logs were found in this
window. Absence of an Info log does not prove packet loss. CANCEL can be cleanup,
so it is a clue rather than the established cause.

The first failure is after destination TLS; later failures are during connection
setup. Curl request byte counts are not proof of receipt at the destination.
The long variant retains connect-timeout=3 and therefore supplies no evidence
about a 30-second response wait. Tiny controls failing also means this candidate
problem cannot be explained solely by the existing large-response size threshold.

Next controlled hypothesis: a fresh XHTTP client for the same small request versus
the reused process/connection. Preserve target, TLS verification, budgets and quiet
intervals; label results separately and keep original acceptance unchanged. A
fresh-client recovery would implicate state/reuse but would not prove its cause.
No production change is justified by this one diagnostic sequence alone.

Deployment health: all intended VPN workloads available, new experimental pods at
zero restarts, all five manual website smoke checks passed. Probes 3/5 remain
intentionally scaled to zero in the existing controlled experiment.

## Prior fresh/reused comparison

PR #146 deployed the bounded fresh/reused comparison. Both request orders failed
from home: fresh Chrome clients completed destination TLS but stalled before HTTP;
reused clients timed out during setup. The new TLS-client pair replaces that test.

## Source control — Hetzner

Add one isolated vpn-source-control-hetzner pod on Hetzner, using the same existing
probe image and fresh-client function. It accesses senaev.com:443 with the same
XHTTP path/UUID/TLS verification, never a private backend URL. Every cycle waits
300–360s, makes one direct trace (4 KiB cap), waits 60–90s, then runs the same fresh
native H2/H1 pair, with 60–90s pauses and alternating order per round. Same
8s total / 3s connect budget and 32 KiB/s rate cap. Three requests per cycle, at
most12 KiB response payload. There is no size matrix or persistent client here.

Metrics/log profile is `XHTTP source control — Hetzner`, with source_node and a
separate profile_index=`source-control-hetzner` target label. Existing VMPodScrape,
NetworkPolicy and dynamic dashboard profile selection cover the new pod. Compare
fresh trace results in panels 20/21 with the home profile, joining direct controls
by experiment_id in logs. No additional image, endpoint or service account rights.

Existing Deployment selectors remain distinct. The new pod inherits the current
DNS/public-443 egress and telemetry-only metrics ingress policy. A separate policy
selects only this control and permits TCP443 to Hetzner's Traefik pod, accommodating
public self-connect DNAT before policy enforcement. It allows neither backend8081
nor fallback8443. Home policies, server configuration and subscriptions are unchanged.
The pod is nonroot, readonly, drops all capabilities, has no mounted service-account
token and retains the existing 200m/128Mi resource limits. Only one fresh client
exists for its bounded request; cleanup is unchanged.

This is a same-host public-endpoint self-connect control, not an independent
external Europe-to-Hetzner route. Different DNS answers, destination routing,
hairpin/NAT behavior, node policy and request times remain confounders. Success
here while home fails points toward a source/path-dependent issue, not proof of
DPI. Failure here can also be local hairpin/policy behavior; inspect backend logs
before blaming XHTTP. Several comparable rounds are necessary.

Rollback: vpnXhttpExperiment.sourceControl=false removes only the control
Deployment and scoped frontend policy. Disabling diagnostics, experiment,
controlledExperiment, probes or ingress also omits this control. Render checks
verify the explicit rollback exactly matches main's chart output.

After merge: verify rollout, source_node, scraper health, zero restarts/OOMs,
website smoke checks, direct and validated fresh controls, and backend logs.
Deployed via PR #147 in combined run 42626865899. First source result:

| Source / route | UTC | Result |
|---|---|---|
| Hetzner direct | 13:45:25 | HTTP200, 214 bytes, 282ms |
| Hetzner fresh XHTTP | 13:46:35 | HTTP200, 214 bytes, 930ms; expected exit validated |
| Home initial XHTTP | 13:47:28 | TLS750ms, request93 bytes, HTTP0, headers/body0, timeout8011ms |
| Home direct / TCP trace | 13:47:28–29 | HTTP200, 499/704ms |

[Verbatim selected-field connector export](sources/2026-11-09-hetzner-source-control.txt).
One successful self-connect narrows universal setup failures but does not prove
DPI or any particular transport defect. Continue comparing the independent home
and Hetzner controls before tuning transport. The home fresh/reused pair also
failed with its order reversed in the preceding deployment.

## Validation and scope of this iteration

The pinned Xray v26.9.30 dialer selects HTTP/1.1 for that ALPN alone, but the Chrome
uTLS profile in the real integration negotiated HTTP/2 and produced malformed
HTTP/1.x responses when only ALPN was changed. That invalid comparison is not
included. The chosen Chrome/native comparison keeps ALPN=h2 on both arms.
Sources: [pinned dialer](https://github.com/XTLS/Xray-core/blob/v26.9.30/transport/internet/splithttp/dialer.go)
and [pinned TLS clients](https://github.com/XTLS/Xray-core/blob/v26.9.30/transport/internet/tls/tls.go).

Manual real-binary integration verifies both arms through Reality fallback,
Traefik TLS and h2c backend, correct exit validation, rejection of untrusted TLS,
loopback cleanup, invalid UUID isolation and ordinary website routing. No image
base, subscription, ingress, server, secret, policy or host networking changes.
PR #149 deployed successfully in run42642463181 (main fd84179).
diagnostics=false disables extra client comparisons as before.

## First TLS-client comparison — 2026-11-09

| Source / client | UTC | Result |
|---|---|---|
| Hetzner Chrome | 15:23:08 | HTTP200,216 bytes,1027ms; TLS887ms |
| Hetzner native | 15:24:15 | HTTP200,216 bytes,714ms; TLS515ms |
| Home Chrome | 15:24:21 | HTTP0,headers/body0,8011ms; TLS701ms; request93 bytes |
| Home native | 15:25:38 | HTTP0,headers/body0,8015ms; TLS852ms; request93 bytes |

Hetzner experiment b1f739ec-91e9-4bec-a750-f7429a9e8cc4; home experiment
4bc80e66-85ba-4c36-94aa-74d2d7aaa7f0. Home direct/TCP traces passed in506/758ms.
Both candidate arms use validated TLS and the same expected exit check. Neither
home result had an HTTP response; diagnostic success never promoted the matrix.

[Captured logs, metrics, smoke and readiness](sources/2026-11-09-tls-comparison.txt).
The new native metric is exported for both sources. Short pauses were logged as
3.469339486264396s (direct) and2.7775221349829446s (TCP); their request durations
exclude these waits. This verifies jitter deployment, not a causal effect on stalls.

One Chrome-first pair does not settle causality. TLS implementation/fingerprint
alone did not rescue home traffic. Continue reversed-order rounds and focus on
shared XHTTP/HTTP2 behavior versus source/path effects; preserve the Hetzner control.
All intended workloads remained available, pods had zero restarts, and all five
website smoke checks passed after deployment. No startup/exit failures were found.

## Next comparison prepared — native HTTP/2 versus HTTP/1.1

PR #150 deployed the bounded version comparison in run42661613767. The first #149 pair passed with both TLS clients on Hetzner and stalled
with both on home. Its reversed-order home pair has not yet been observed.

Using native TLS for both new arms avoids the earlier Chrome ALPN mismatch.
Pinned-binary integration confirms both versions actually forward the request
through Reality fallback → Traefik TLS → existing h2c backend. Both validate exit,
reject the untrusted test certificate, and release loopback1083 after success and
failure. Server-side h2c is unchanged: only the client-facing HTTP version differs.
The native metric pair is already covered by the dashboard's diagnostic regex.

No subscription, server, ingress, chart, network policy, secret, image base or host
network change. diagnostics=false disables the home pair and removes the Hetzner
control as before; the new variant is never delivered to Happ subscriptions.

## First HTTP-version round — 2026-11-09

| Source / native TLS version | UTC | Result |
|---|---|---|
| Hetzner H2 | 17:17:40 | HTTP200,216 bytes,682ms |
| Hetzner H1 | 17:19:03 | HTTP200,214 bytes,981ms |
| Home H2 | 17:20:00 | HTTP0,headers/body0,8011ms; TLS1340ms |
| Home H1 | 17:21:30 | HTTP200,214 bytes,2064ms; TLS1403ms; expected exit validated |

Home experiment5d17fbdc-0f77-4c18-84b5-d405b28cc9be; Hetzner
63e5215b-2239-4b4b-a6db-1a560c4efe5a. Home direct/TCP traces passed508/795ms.
[Verbatim evidence and health output](sources/2026-11-09-http-version-comparison.txt).
One H2-first pair suggests a useful H1 workaround for small requests; timing/order
and inherent framing/connection differences prevent a causal diagnosis.

[Next prepared step](H1-PAYLOAD-VALIDATION.md): validate4/16/64KiB through H1 after
successful exit control. This is not deployed and does not change user profiles.
