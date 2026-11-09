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
2. Fresh XHTTP traces with Chrome TLS and native Go TLS, alternating order each
   matrix. Wait 60–90 random quiet seconds before each one.

Both TLS arms keep HTTP/2, packet-up, the same hostname/path/UUID, certificate
verification, 4 KiB cap, 32 KiB/s and 8s total / 3s connect budgets. Only the TLS
client fingerprint/implementation changes. Chrome keeps diagnostic_fresh_trace;
native uses diagnostic_native_trace. Both appear in existing Grafana panels20/21.
The native arm sets Xray fingerprint=unsafe to choose the native Go TLS client;
this does not set allowInsecure. Both must reject an untrusted server certificate.

Both use separate fresh processes on loopback1083 and temporary 0600 config, with
unconditional cleanup. Existing candidate and original matrix acceptance remain
unchanged; diagnostic success never promotes a failed exit control. Four added
home requests per failed matrix, at most16 KiB response payload plus overhead.
This replaces the reused/fresh diagnostic pair rather than adding more home probes.

The transfer matrix also gains random 2–7s pauses between each successful HTTPS
precheck and its download. Existing condition pauses60–90s, round pauses300–360s,
routine light30–45s and heavy300–360s stay unchanged. Short/long waits preserve
cancellation/child guards. Logs record request_jitter_seconds/quiet_seconds_before;
request duration excludes the waits. No catch-up requests or retries are added.

Order alternation and jitter do not remove time/recovery/shared-path effects.
Native success with Chrome failure implicates TLS-client/path interaction, not a
proven filtering mechanism. Compare both sources and several rounds. Differences
include the TLS implementation as well as its advertised handshake fingerprint.

## Evidence and interpretation

All curl result logs add numeric cumulative pretransfer/first-byte timing and
HTTP request/header byte counts. No raw stderr, response body, full curl metadata,
credential-bearing configuration or headers are logged by the Python runner.
Info logs can contain fixed test destinations and XHTTP session identifiers.

Interpret first_byte_ms with HTTP status, header/body counts and request bytes;
rounded zero is not by itself proof that no packet arrived. These timings describe
the inner curl request, not the complete outer XHTTP handshake count or wire delivery.

- Direct and baseline trace succeed, candidate fails: focus on candidate forwarding.
- Native trace succeeds while Chrome fails: prioritize TLS-client/path interaction.
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
Chrome/native TLS pair, with 60–90s pauses and alternating order per round. Same
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
New comparison is prepared in PR #149 and not deployed. Existing controls continue
until merge. diagnostics=false disables extra client comparisons as before.
