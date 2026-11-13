## 2026-11-13 18:19 UTC — Merge #169; draft independent FirstVDS source

User approved merge, analysis and next-step preparation. #169 had CodeRabbit
approval, no inline findings, successful CI/image build; merged at0b38516c.
Deployment43480667883 succeeded (VPN completed18:18:12 UTC; telemetry18:17:11).
`npm run test:smoke` passed all5 tests. All3 new probe targets up=1, both
website check successes fresh=1; current probes have zero5m restart increases.
New ordinary HTTPS controls occur at
the tail of full matrices, so analysis must wait for fresh post-rollout samples.

Pre-rollout18:15 UTC current-process XHTTP/H1 success/attempt snapshot:
```
source          4096   8192   12288   16384
senaev-media   17/17  15/16   5/16    0/17
hetzner        32/32  32/32  32/32   32/32
```
Paired direct payload counters all successful. Not matched rounds; no claim
of exact cutoff or proven DPI. Prepare FirstVDS as another source to public
Hetzner endpoint, using the existing client template and budgets. Keep draft
pending ordinary HTTPS evidence; no permission to merge this next PR.

Structural render comparison against parent chart:
```
PASS: only FirstVDS probe added; every existing rendered resource unchanged; gates and entry-only routing preserved
```
Validated source node, isolated labels, unchanged security context, no new
website worker, existing enable gates and no FirstVDS Freedom/SOCKS inbound.
Helm lint passed. No Python, image, secrets or NetworkPolicy changes required.
A one-time follow-up analysis is scheduled for19:20 UTC /20:20 Madrid to review
post-rollout ordinary HTTPS results, exit gates, direct pairs and fresh XHTTP
results before promoting this draft. No authorization to merge/deploy it.

## 2026-11-13 07:58 UTC — Deploy #168; prepare ordinary HTTPS comparison

User approved merge and next-step preparation. Merged #168 at af23212b;
deployment43388530309 succeeded. All5 website smoke checks passed, all3 new
probe targets up=1, fresh website success=1 on both sources. Subscription error
query over ten minutes returned no logs. Real Happ refresh remains unverified.
CodeRabbit on #168 was neutral/rate-limited, not an approval.

Pre-rollout 07:49 UTC success/attempt snapshot for fresh XHTTP/H1:
```
source          4096   8192   12288   16384
senaev-media   17/18  17/17   4/18    0/16
hetzner        32/32  32/32  32/32   32/32
```
12KiB home direct=17/18; other listed direct payloads all passed. Exit-gate
failures mean payload totals differ. Selected latest failed 12KiB logs:
```
2026-11-13T07:38:54Z bytes=0 http_status=0 curl_exit=28 duration_ms=8012 tls_ms=627
2026-11-13T05:54:38Z bytes=5521 http_status=200 curl_exit=28 duration_ms=8009 tls_ms=596
2026-11-13T04:46:13Z bytes=5513 http_status=200 curl_exit=28 duration_ms=8009 tls_ms=593
```
Stop size-only expansion. Prepare independent ordinary HTTPS/H1 asset ranges
8/16/64KiB on the same public hostname, appended after existing matrices on
home4/Hetzner only. Asset discovery bounded and same-origin; no new endpoint,
privileges or host changes. Original VPN acceptance retained. Dashboard labels
clarify new controls and source/TLS caveats. Full plan is appended to README.

Live Code Tools preflight (waits mocked, real curl/TLS):
```
PASS: live ordinary HTTPS/H1 ranges 8/16/64 KiB over existing website assets
```
Not a home-path result. Post-deploy5m restart increases were0 for all three
new probes and the subscription container. Prepared code verification:
```
Ran 101 tests in 0.257s
OK
Python syntax OK: 20 file(s)
1 chart(s) linted, 0 chart(s) failed
```
Both affected charts passed Helm lint. Review preserved existing acceptance,
bounded same-origin discovery and cancellation; dashboard descriptions distinguish
ordinary controls from paired direct internet-origin requests. New PR stays
unmerged/undeployed.

## 2026-11-12 21:45 UTC — Verify entry routing; request Happ proxy authentication

User approved the next safety step. Rendered FirstVDS configuration has only
SOCKS outbounds, no direct Freedom and one user route to Hetzner. Manual real
Xray 26.9.30 test preserves routing/outbounds while substituting loopback plain
VLESS and fake credentials. An alternate exit stays alive during selected-exit
failure. No host/cluster changes or live failure injection.

```
PASS: rendered FirstVDS routing: healthy exit -> failed exit blocks origin -> recovery
Ran 94 tests in 0.336s
OK
Python syntax OK: 19 file(s)
1 chart(s) linted, 0 chart(s) failed
```

A temporary local run of the real subscription server returned both auto-auth
headers for a Happ request with fake credentials. Code Tools restarted during
the first broader check run; restarted `npm run simple-checks` passed in
240.8 seconds (lint, typecheck, full unit/integration suite, Python/shell syntax
and all Helm charts). Final routing test rerun also passed after cleanup review.

No production routing modification needed. Add two documented Happ auto-auth
headers; no new secrets. Real Happ version behavior and refresh/connectivity
must still be verified after deployment, including manually configured local
proxy consumers. The script is manual only, not added to CI. Python tests passed
with unrelated injected Datadog instrumentation warnings in this workspace.

## 2026-11-12 21:15 UTC — Merge availability monitoring; prepare12KiB

User approved merge #155 and preparation of the next step. #155 merged
at0428b7573da897ebd6b77d338d2eb462757a5431; deployment43307488174 succeeded. Original CodeRabbit change request concerned the superseded timeline;
updated code uses an instant status query. CI passed, current bot check neutral.

At21:09 UTC the current-process fresh counters showed home4/8KiB2/2 each,
16KiB0/2; Hetzner4/8/16KiB3/3 each. Corresponding exit checks passed. This is a
small preliminary sample, not proof of a stable size boundary. Prepare one fresh
12KiB control after retained4/16/8KiB, on both source paths with identical bounds,
exit gate, jitter and cleanup. All earlier controls remain in order; prior
failures do not suppress12KiB. Adds28KiB planned response allowance per eligible
cycle (not wire-byte limit). Website worker traffic means waits are not wholly quiet.

Verification of prepared code:
```
Ran 94 tests in 0.278s
OK
Python syntax OK: 18 file(s)
PASS: independent fresh H1 clients validate exit, transfer paired 4/16/8/12 KiB and clean up
PASS: invalid VLESS credential cannot reach the HTTPS origin
PASS: ordinary website route preserved
```
Local real-process integration passed with pinned Xray26.9.30 / Traefik3.2.0,
loopback listeners and temporary test credentials/certificates. Review confirmed
only size allowlist and two exporter names change runtime behavior. No chart,
server, host networking, permissions or production subscription change. Existing
transfer dashboard selectors cover12KiB. Next PR remains unmerged/undeployed.

Post-deployment verification at21:15 UTC: all5 website smoke checks passed;
Grafana live dashboard contains panels22/23/24 and panel22 uses instant=true,
range=false with120s cutoff. Fresh website success metrics are1 for both source
nodes. Selected Datadog results:
```
2026-11-12T21:14:56Z hetzner website_senaev_ru ok=true http_status=200 curl_exit=0 duration_ms=623
2026-11-12T21:14:46Z senaev-media website_senaev_ru ok=true http_status=200 curl_exit=0 duration_ms=879
```
These confirm the website workers, not VPN tunnel success. The prepared12KiB
control is PR #165; CI/review pending, no approval to merge it.

## 2026-11-12 20:48 UTC — Resolve #155 conflicts and stale-green review

Merged current main into the availability branch, resolving only the two
conflicted project documents. Preserved incident and later VPN history in date
order; the fresh4/16/8KiB controls and fixed metrics remain intact. Changed only
the website status panel from a range timeline to an instant Stat query with
120s freshness. Duration history and age remain separate; no dashboard range
step can prolong the current green state. Use end time now for current status.

Validation:
```
Ran 92 tests in 0.209s
OK
Python syntax OK: 18 file(s)
1 chart(s) linted, 0 chart(s) failed
PASS: instant freshness status, unique dashboard IDs, independent filters, two intended website workers and retained 8KiB control
```
Both VPN and telemetry lints passed. Helm rendered the VPN chart; validated
website worker scope and dashboard JSON/queries. The first structural check
could not import optional PyYAML; reran using the standard library over the
Helm-validated rendering. No cluster operations, merge to main or deployment.

## 2026-11-11 08:46 UTC — Prepare independent fresh8KiB control

User requested the next VPN implementation. #154 is now deployed; #156 was
closed after the user's K3s repair. Current counter query at08:43 UTC:
`sum by (source_node,check,route,result) (vpn_probe_checks_total{check=~".*fresh.*|transfer_h1_cloudflare_.*"})`.
Selected returned values (success/failure):
```
source_node=senaev-media check=transfer_h1_fresh_cloudflare_4096 route=xhttp 19/1
source_node=senaev-media check=transfer_h1_fresh_cloudflare_16384 route=xhttp 0/19
source_node=hetzner check=transfer_h1_fresh_cloudflare_4096 route=xhttp 38/0
source_node=hetzner check=transfer_h1_fresh_cloudflare_16384 route=xhttp 38/0
source_node=senaev-media check=diagnostic_h1_fresh_size_exit_16384 route=xhttp 19/1
```
All paired direct controls passed. Source/path difference persists with fresh
processes, so add8KiB after existing4/16KiB to narrow the response-size range
without changing those controls' order. Size, destination and traffic-history
confounders remain; do not claim DPI or an MTU diagnosis.

Runtime change reuses the existing bounded fresh-client path and adds two fixed
exporter check names. Tests cover independent processes, exit gate, exact8KiB
caps, jitter, cancellation, metrics and earlier-failure isolation. No new
infrastructure or permissions. Planned response allowance increases20KiB/cycle.

Verbatim validation:
```
Ran 84 tests in 0.201s
OK
Python syntax OK: 17 file(s)
PASS: independent fresh H1 clients validate exit, transfer paired 4/16/8 KiB and clean up
```
Real local integration uses Xray26.9.30 and Traefik3.2.0, temporary credentials,
verified test certificates and loopback listeners. Initial invocation omitted
Xray from PATH, so fresh startup failed; corrected the invocation and clarified
the existing integration instructions. The complete rerun passed. No live change.

## 2026-11-10 09:19 UTC — Merge #154; diagnose outage; prepare website metrics

User requested merge, senaev.ru investigation near06:00 and checker availability
metrics. #154 merged atd17f690f6fdd87ecc87b9362cdef4dbff21fc580. Deployment42787487968
failed at its first Kubernetes operation after build/publication and sync:
```
error: error validating "STDIN": error validating data: failed to download openapi: Get "https://127.0.0.1:6443/openapi/v2?timeout=32s": dial tcp 127.0.0.1:6443: connect: connection refused
```
Do not describe this as deployed. Cached Ready gauges were misleading.

Read-only inspection used existing GitHub Actions SSH secret references in a
temporary unmerged diagnostic branch. No key value was read/exported. Runs
42788224267/42788499576/42788785692 inspected Hetzner. FirstVDS attempt42789398256
failed authentication before host commands. The diagnostic workflow was restored
afterward and is not part of this PR. No host services changed.

Selected raw journal excerpt:
```
Nov 10 06:26:18 hetzner tailscaled[2749091]: c2n: POST /update received
Nov 10 06:26:18 hetzner tailscaled[2749091]: c2n: running "systemd-run --wait --pipe --collect /usr/bin/tailscale update --yes"
Nov 10 06:26:31 hetzner systemd[1]: Stopping k3s.service - Lightweight Kubernetes...
Nov 10 06:26:34 hetzner systemd[1]: Stopped k3s.service - Lightweight Kubernetes.
```
Tailscale1.102.2→1.104.5 removed tailscale0/flannel.1. BindsTo stopped K3s;
Tailscale returned, K3s stayed inactive. Rule sets SYSTEMD_WANTS, device Wants is
empty, AutoUpdate Apply=True. Precise hook failure remains open. No new OOM kill;
root disk~23% free. Time06:26 UTC/07:26 Madrid is not proof of an earlier website
onset. [Raw selected sources](sources/2026-11-10-senaev-ru-incident.txt).

Direct verified HEAD: senaev.ru curl28/HTTP0; senaev.com200; same-IP jellyfin.senaev.ru302. Confirmed Hetzner API/overlay fault strongly explains
broken cross-node service/DNS paths, but the exact fallback hop is unverified.
No restart performed; recovery proposal is documented.

Prepared website_senaev_ru HEAD worker in existing home profile1/Hetzner source
control:30–45s wait,3s/8s curl/10s process bounds, no proxy/body/redirects/retries.
Independent requests can overlap matrix quiet intervals without changing VPN
acceptance. Fixed metrics allowlist, JSON-output lock, Grafana status/duration/age
with120s freshness. No image/secret/RBAC/policy/host-network change.

Verbatim checks:
```
Ran 90 tests in 0.246s
OK
Python syntax OK: 18 file(s)
PASS: website worker enabled only on home profile1 and Hetzner source control
PASS: dashboard JSON, unique panel IDs and independent website queries
1 chart(s) linted, 0 chart(s) failed
```
Both VPN/telemetry chart lints pass. Coverage includes HEAD failures/recovery,
bounds, cancellation, real emit→exporter propagation and lifecycle/manual modes.
Existing integration is rerun before PR. Live rollout is blocked by the API.

## 2026-11-09 22:13 UTC — Deploy fresh4KiB; prepare fresh16KiB and metrics fix

User authorized merge #152 and preparation of the next step. PR workflow
42673339670 passed on attempt3 including image build; no workflow code change.
PR #152 merged at28741738523416a79af2a357e579e5a1283f1ab4. Deployment42706106663
succeeded. All intended services available,3 targets scraped, checker/backend
pods zero restarts. All5 website smoke tests passed at21:52 and22:12 UTC.

Pre-rollout counters: home H1 trace/size-exit8/8; reused4KiB7/8 and16/64KiB0/8.
Hetzner trace/exit16/16;4KiB16/16 and16/64KiB15/16. This supersedes any inference
from the first #151 cycle that home4KiB consistently fails.

First #152 fresh4KiB passed home905ms and Hetzner535ms with valid expected exits.
Home reused4KiB passed883ms,16KiB failed setup3011ms,64KiB stalled8012ms after
TLS600ms. Direct and Hetzner ladder controls passed. One fresh cycle does not
establish idle as a cause. Verbatim excerpt from selected-field connector output:
```yaml
- timestamp: "2026-11-09T22:08:51Z"
  message: ""
  service: vpn-probe
  env: prod
  status: info
  host: senaev-media-senaev-k3s
  attributes:
    custom.bytes: 4096
    custom.check: transfer_h1_fresh_cloudflare_4096
    custom.curl_exit: 0
    custom.duration_ms: 905
```
[Full captured responses, counters and health](sources/2026-11-09-h1-fresh-control.txt).

Found #152 observability omission: fresh check names were missing from the metrics
allowlist, so Grafana did not receive them. Logs establish their results. Prepared
the fixed bounded allowlist and tests for actual emit→exporter propagation.
Do not describe missing fresh metrics as a runtime failure or scrape outage.

Prepared next test: retain fresh4KiB, then separate exit-validated fresh16KiB with
60–90s before startup and2–7s between direct/H1 requests. Distinct processes prevent
earlier client state from carrying over. Adds36KiB planned successful responses;
236KiB/home and232KiB/Hetzner totals are not strict wire limits. No destination,
server, chart, secret, privilege, policy, host route/firewall/Tailscale or Happ change.
The next PR remains unmerged and undeployed.

Verbatim checks:
```
Ran 82 tests in 0.179s
OK
Python syntax OK: 17 file(s)
PASS: independent fresh H1 clients validate exit, transfer paired 4/16 KiB and clean up
PASS: exit-validated native HTTP1 client transfers 4/16/64 KiB with direct controls and cleanup
PASS: native HTTP2/HTTP1.1 controls validate exit, reject untrusted TLS and release loopback 1083
PASS: invalid VLESS credential cannot reach the HTTPS origin
PASS: ordinary website route preserved
```
Real-process integration plus the preceding80-test/syntax run took6.515s;
the exporter regressions brought the final fast suite to82 tests. Quiet waits
are mocked only locally. Review and CI of the next PR follow.

## 2026-11-09 18:19 UTC — Deploy payload ladder; prepare fresh-process control

User authorized merge, deployment follow-up, tests and preparation of the next
step. PR #151 merged at23dc7d9d65e8850779969ec5f5f88558eaf3da12; deploy42669746004
succeeded. All intended workloads available,3 scrape targets up, checker/backend
pods at zero restarts. All5 website smoke tests passed at18:02 and18:19 UTC.

First payload cycle: home H1 trace/exit recheck passed but4/16/64KiB all failed.
Hetzner passed all three exact sizes; every paired direct control passed. Home
4/16KiB completed TLS but got zero response headers/body;64KiB failed setup.
This is not a clean size threshold. Selected-field connector output and metric
responses are retained [verbatim](sources/2026-11-09-h1-payload-results.txt).
Verbatim home final measurement excerpt:
```yaml
- timestamp: "2026-11-09T18:17:03Z"
  message: ""
  service: vpn-probe
  env: prod
  status: info
  host: senaev-media-senaev-k3s
  attributes:
    custom.bytes: 0
    custom.check: transfer_h1_cloudflare_65536
    custom.curl_exit: 28
    custom.duration_ms: 3010
    custom.http_status: 0
    custom.ok: false
```

Prepared a bounded next control: retain the reused ladder, then quiet60–90s
before starting another fresh H1 client. Revalidate exit and run one paired4KiB
download without60–90s post-exit idle; direct request and2–7s jitter remain.
Adds12KiB planned response allowance and separate fixed metrics; no server,
subscription, policy, secret, privilege or host-network changes. Fresh success
would implicate process history/idle, without distinguishing them or proving DPI.
Next PR remains unmerged and undeployed.

Verbatim local validation:
```
Ran 76 tests in 0.213s
OK
Python syntax OK: 17 file(s)
PASS: immediate fresh H1 control validates exit, transfers paired 4 KiB and cleans up
PASS: exit-validated native HTTP1 client transfers 4/16/64 KiB with direct controls and cleanup
PASS: native HTTP2/HTTP1.1 controls validate exit, reject untrusted TLS and release loopback 1083
PASS: invalid VLESS credential cannot reach the HTTPS origin
PASS: ordinary website route preserved
```
Unit/syntax/real-process integration completed in7.007s. Fake waits apply only
locally. Tests cover fresh exit gating, failure-independent execution, bounded
one-size traffic, ordering, cancellation, cleanup and invalid mode rejection.

## 2026-11-09 17:55 UTC — Address payload-check review before merge

CodeRabbit identified two valid points. Preserve the completed direct measurement
before a temporary-client liveness failure; a regression test verifies no VPN
request follows. Clarify the planned payload totals: curl read-ahead on streams
with unknown length and protocol overhead prevent a strict wire-byte claim.
No timeout/rate/acceptance limit changed. Prior cap wording below is superseded
by this clarification. Rerun unit/syntax checks before merge.

## 2026-11-09 17:29 UTC — H1 works from home; prepare bounded payload validation

User authorized merge, deployment follow-up, testing and preparation of the next
step if needed. Addressed two CodeRabbit documentation findings before merge.
PR #150 merged at7a97606a30a67c02e573be71723240f679231f2f; run42661613767 succeeded.
All intended VPN workloads available, three checker targets scraped, new pods at
zero restarts, five website smoke checks passed. No host-network change.

First H2-first native version pair: Hetzner H2/H1 passed682/981ms. Home H2 stalled
at8011ms after TLS1340ms; home H1 returned HTTP200/214 bytes in2064ms with expected
exit validation. Direct/TCP home controls passed508/795ms. Raw H1 success:
```yaml
- timestamp: "2026-11-09T17:21:30Z"
  message: ""
  service: vpn-probe
  env: prod
  status: info
  host: senaev-media-senaev-k3s
  attributes:
    custom.bytes: 214
    custom.check: diagnostic_native_h1_trace
    custom.curl_exit: 0
    custom.duration_ms: 2064
    custom.experiment_id: 5d17fbdc-0f77-4c18-84b5-d405b28cc9be
    custom.http_status: 200
    custom.ok: true
    custom.profile: "\U0001F484 4. hetzner → freedom"
    custom.request_bytes: 93
    custom.response_header_bytes: 913
    custom.route: xhttp
    custom.tls_ms: 1403
```
[Full source/health/deployment/metric export](sources/2026-11-09-http-version-comparison.txt).
Before rollout, Chrome/native H2 each passed13/13 on Hetzner and failed5/5 on home.
This supports an H1 workaround for tiny responses, not a repair or proven cause.

Prepared the next PR: keep the version pair, then after successful H1 control run
one fresh-client exit recheck and paired direct/H1 Cloudflare4/16/64KiB ladder.
Run only after the complete pair; preserve jitter, budgets, rate, credentials,
TLS verification and original acceptance. Additional cap172KiB/eligible round;
no overlapping traffic or concurrent extra process. No server/subscription change.

Validation output:
```
Ran 70 tests in 0.154s
OK
PASS: exit-validated native HTTP1 client transfers 4/16/64 KiB with direct controls and cleanup
PASS: native HTTP2/HTTP1.1 controls validate exit, reject untrusted TLS and release loopback 1083
PASS: invalid VLESS credential cannot reach the HTTPS origin
PASS: ordinary website route preserved
Python syntax OK: 17 file(s)
```
Pinned-binary integration and syntax completed in7.29s; waits mocked locally only.
Unit tests cover same-client exit gating, no promotion, after-pair order, caps,
direct failure/inconclusive marking, cancellation, temporary-child failure and
cleanup. No live H1 payload result exists. Pending review/CI/deployment of next PR.

## 2026-11-09 15:34 UTC — Prepare native HTTP-version comparison

User approved the next stage. Latest snapshot still shows one completed #149 home
pair (both TLS clients failed) and one completed Hetzner pair (both passed); no
reversed-order home result is claimed. Prepared PR #150 to replace that pair with
fresh native-TLS HTTP2/HTTP1.1 controls on both sources, alternating order. Only
ALPN changes. Original Chrome/H2 candidate, acceptance, request limits, traffic
count, jitter, endpoint/UUID and verification are unchanged. Separate H1 check
uses the existing Grafana diagnostic regex. No chart/server/policy/host change.

This avoids the invalid earlier Chrome+HTTP1 combination: both new arms use native
Go TLS and are checked through the real local chain. Verbatim validation output:
```
Ran 63 tests in 0.177s
OK
Python syntax OK: 16 file(s)
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 4096 bytes
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 16384 bytes
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 65536 bytes
PASS: native HTTP2/HTTP1.1 controls validate exit, reject untrusted TLS and release loopback 1083
PASS: invalid VLESS credential cannot reach the HTTPS origin
PASS: ordinary website route preserved
```
Combined unit/syntax/integration verification completed in6.61s. Tests assert only
ALPN differs between native arms, invalid Chrome/H1 is rejected before startup,
both arms execute after a failure, order reversal, cancellation, cleanup and no
promotion of the failed matrix. Real integration logs report HTTP version2 and1.1.
No live H1 result yet; pending CI/review/merge/deployment.

## 2026-11-09 15:28 UTC — Deploy TLS comparison and observe the first pair

User authorized merge, deployment follow-up and logs/metrics checks. PR #149 merged
at fd84179f4a3cd9d769f65cfffa3d42abae2feefd. Run42642463181 succeeded. All intended
VPN workloads available, all three checker targets scraped, all new checker/backend
pods at zero restarts. Five website smoke checks passed; no candidate/fresh startup
or client-exit failures were found in the inspected window.

First pair, Chrome first on both sources: Hetzner Chrome1027ms/native714ms passed
HTTP200 with216 bytes and expected exit validation. Home Chrome8011ms/native8015ms
both failed after destination TLS (701/852ms), request93 bytes and no HTTP headers
or body. Home direct/TCP traces passed506/758ms. Logs and metrics agree.

Verbatim home native record from the selected-field Datadog export:
```yaml
- timestamp: "2026-11-09T15:25:38Z"
  message: ""
  service: vpn-probe
  env: prod
  status: info
  host: senaev-media-senaev-k3s
  attributes:
    custom.bytes: 0
    custom.check: diagnostic_native_trace
    custom.curl_exit: 28
    custom.duration_ms: 8015
    custom.experiment_id: 4bc80e66-85ba-4c36-94aa-74d2d7aaa7f0
    custom.http_status: 0
    custom.ok: false
    custom.profile: "\U0001F484 4. hetzner → freedom"
    custom.request_bytes: 93
    custom.response_header_bytes: 0
    custom.route: xhttp
    custom.tls_ms: 852
```
[Full verification output](sources/2026-11-09-tls-comparison.txt) includes deployment,
readiness/restarts, smoke, all first-round controls and metrics. Short jitter was
observed as3.469339486264396s and2.7775221349829446s on the home direct/TCP controls;
request duration excludes the pauses. Existing longer jitter remains in place.

Changing TLS client alone did not fix the home stall in this first Chrome-first
round. Keep watching reversed-order rounds; prioritize the shared XHTTP/HTTP2 path
versus source/path effects, without asserting DPI, MTU or a specific proxy bug.
No further runtime modification made. This documentation update records the result.

## 2026-11-09 14:32 UTC — Prepare TLS-client comparison and short request jitter

User approved the next investigation stage and randomized gaps between requests.
Existing long waits are already jittered60–90s and300–360s. Add2–7s before each
direct/TCP diagnostic trace and between successful precheck and matrix download.
Waits are cancellable and logged separately from request duration.

Replace home reused/fresh pair with fresh Chrome/native TLS HTTP2 pair, shared by
the Hetzner source control, alternating order per round. HTTP2, packet-up, endpoint,
UUID, certificate verification and all limits stay fixed. Home remains four added
4KiB requests; Hetzner now has direct plus two arms (12KiB maximum payload/cycle).
Native uses fingerprint=unsafe solely to select native Go TLS, with allowInsecure
still false. Local untrusted-certificate rejection is required for both arms.

An ALPN-only HTTP1.1 trial was rejected after real integration showed a mismatch
with the pinned Chrome uTLS handshake. No such config is shipped. Pinned-source
inspection and actual native-client integration validate the chosen comparison.
No production subscription, server, chart, policy, secret or host network change.

Validation output:
```
Ran 61 tests in 0.161s
OK
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 4096 bytes
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 16384 bytes
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 65536 bytes
PASS: fresh Chrome/native HTTP2 controls validate exit, reject untrusted TLS and release loopback 1083
PASS: invalid VLESS credential cannot reach the HTTPS origin
PASS: ordinary website route preserved
Python syntax OK: 16 file(s)
```
Local integration plus unit checks completed in6.16s. Unit timing uses fake waits,
including request-cancellation cases. Original exit failure still prevents payload
promotion. Existing Grafana diagnostic regex includes the new fixed native check.
Addressed CodeRabbit documentation findings: rewrote current status instead of
appending stale stages, corrected prior deployment descriptions and saved original
backend/initial-smoke excerpts. Prepared in PR #149; pending CI/deployment.
Evidence from #147 retained below.

## 2026-11-09 13:49 UTC — Deploy source control; Hetzner succeeds while home stalls

User approved merge and continued investigation. PR #147 merged at eb818385.
Run 42626704217 stopped at the stale-main guard before publishing/deployment after
#148 merged. Combined run 42626865899 at 271f5de completed successfully, including
the VPN image and release. All intended VPN deployments available; targets1/4 and
source-control-hetzner scraped with source_node=hetzner on the new target. All new
checker/backend pods at zero restarts. Initial five website smoke checks passed.
A later repetition hit one SSL connection timeout on senaev.ru; an immediate
bounded rerun passed all five. Both outcomes are recorded in the source export.
No causal link to this deployment is established.

First source cycle succeeded; contemporaneous home control failed. Verbatim
selected-field connector export: [source evidence](sources/2026-11-09-hetzner-source-control.txt).
Parsed summary (not original stdout):
```
13:45:25 Hetzner direct HTTP200 bytes214 duration282ms
13:46:35 Hetzner fresh XHTTP HTTP200 bytes214 duration930ms TLS831ms expected_exit_validated=true
13:47:28 home XHTTP HTTP0 bytes0 duration8011ms TLS750ms request_bytes93 response_header_bytes0
13:47:28 home direct HTTP200 bytes219 duration499ms
13:47:29 home TCP HTTP200 bytes214 duration704ms
```
Hetzner experiment301b4bac-33f3-4b16-a813-1e8edb7663cf; home
022c46b2-f499-4857-874f-8686c0f952bd. Verbatim backend excerpt:
```
2026/11/09 13:47:20.900220 [Info] [3640721331] proxy/freedom: connection opened to tcp:www.cloudflare.com:443, local endpoint 10.42.0.230:39854, remote endpoint 104.16.124.96:443
```
This supports backend acceptance/outbound setup, not HTTP response delivery.
The initial smoke stdout is also saved in the linked source export.
 The preceding home round also
failed fresh/reused controls with order reversed (13:25:46 / 13:27:16 UTC).

The deployed endpoint is capable of returning a validated response from its own
Hetzner host. Source/path dependence now outranks universal endpoint/credential
failure, but one self-connect success does not distinguish ISP interference,
transport behavior, latency, DNS or node policy effects. Keep this positive control,
repeat comparable pairs, and investigate the home upload/response transport next.
No further production config change made in this observation step.

## 2026-11-09 13:25 UTC — Prepare Hetzner public-endpoint source control

User approved comparing the same XHTTP request from Hetzner. Prepared one isolated
control pod, reusing the current image and fresh-client function. Direct trace and
fresh XHTTP trace only, 300–360s before each round and 60–90s between requests;
4 KiB each, 8s total / 3s connect and 32 KiB/s. Separate fixed profile, existing
scrape/policy/dashboard. Existing resources render identically.

Source-only additive egress policy permits local Traefik TCP443 after possible
public self-connect DNAT. It does not permit private backend8081 or fallback8443.
No changes to production clients, subscriptions, routing, credentials or host network.
This is a same-host public endpoint control, with hairpin/time/DNS confounders;
it cannot alone establish DPI or a server bug. SourceControl=false removes it.

Validation output:
```
Ran 58 tests in 0.125s — OK
Python syntax OK: 16 file(s)
1 chart(s) linted, 0 chart(s) failed
PASS: rollback equals main; enabled mode adds only one Deployment and its scoped frontend NetworkPolicy
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 4096 bytes
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 16384 bytes
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 65536 bytes
PASS: two fresh-client controls validate TLS/exit and release loopback 1083
PASS: invalid VLESS credential cannot reach the HTTPS origin
PASS: ordinary website route preserved
```
Unit coverage includes bounded source rounds, direct/candidate failures,
cancellation and dispatch without baseline configuration. Pinned-binary integration
also asserts the fresh helper returns the actual validated result. Pending CI/review.

## 2026-11-09 12:44 UTC — Prepare fresh versus reused XHTTP comparison

User approved the next comparison. Extended existing PR #146: replace the three
previous candidate diagnostics with a same-URL reused/fresh pair, alternating
order each matrix. Both keep 8s total / 3s connect, 4 KiB cap, 32 KiB/s and expected
exit validation. Four added requests per failed round (16 KiB maximum payload).

Fresh client uses temporary config and loopback 1083, same settings/credentials as
the persistent candidate, with bounded startup and unconditional cleanup. Parent
failure still invalidates the round; temporary client failure is labelled and
preserves the baseline. Original failed exit control never promotes the candidate.
New fixed checks automatically appear in existing diagnostic dashboard panels.
No chart, production subscription, server, ingress, secret or host network change.
Validation:
```
Ran 53 tests in 0.105s — OK
Python syntax OK: 15 file(s)
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 4096/16384/65536 bytes
PASS: two fresh-client controls validate TLS/exit and release loopback 1083
PASS: invalid VLESS credential cannot reach the HTTPS origin
PASS: ordinary website route preserved
```
Real pinned-binary integration completed in 4.49s. Unit tests cover order,
unchanged config/budgets, cancellation, cleanup, sanitized startup failure,
parent failure, no candidate promotion and separate bounded metrics. Current
live profile 4 memory was 30285824 bytes against its 128Mi limit; a third temporary
process remains within that same enforced limit, so post-deploy OOM/restart checks
remain necessary. No live fresh-client result exists yet.
Reviewed CodeRabbit comments: saved auditable verification exports and clarified
parsed summaries; order alternation and explicit time/recovery caveats address the
comparison bias. Pending CI/review/deployment; previous #145 evidence is retained below.

## 2026-11-09 12:27 UTC — Deploy response diagnostics and observe first sequence

User approved merge/deployment. PR #145 merged at
960f34c0e0e0242b3ef355ff79b2ed8eee4da570; run 42614899253 completed successfully
(checks, image build, provisioning sync, VPN and telemetry deploys). New probe and
backend pods were available with zero restarts. All five website smoke checks
passed; Grafana panels 20/21 and diagnostic metrics were verified.

Verbatim selected-field Datadog export, historical pod/metric snapshots,
deployment output, repeated website smoke output and dashboard panel selection:
[saved verification output](sources/2026-11-09-xhttp-diagnostics.txt).
The export is the connector's retrieved YAML, not reconstructed original probe
stdout. For example, the retrieved record contains:
```yaml
- timestamp: "2026-11-09T12:24:56Z"
  message: ""
  service: vpn-probe
  env: prod
  status: info
  host: senaev-media-senaev-k3s
  attributes:
    custom.bytes: 0
    custom.check: diagnostic_trace_30s
    custom.curl_exit: 28
    custom.duration_ms: 3011
    custom.experiment_id: 94802da3-527a-47ea-a954-10b391454510
    custom.http_status: 0
    custom.ok: false
    custom.request_bytes: 0
    custom.response_header_bytes: 0
    custom.route: xhttp
    custom.tls_ms: 0
```
These snapshots support deployment health and the failure-stage interpretation.
The five website checks were repeated when saving this evidence, at 12:47 UTC.
Parsed summary of the first complete sequence (not original stdout):
```
12:21:26 exit_ip xhttp ok=false curl_exit=28 duration_ms=8010 tls_ms=840 request_bytes=93 response_header_bytes=0 http_status=0 bytes=0
12:21:27 diagnostic_trace direct ok=true http_status=200 bytes=219 duration_ms=501
12:21:28 diagnostic_trace vpn ok=true http_status=200 bytes=214 duration_ms=685
12:22:35 diagnostic_https xhttp ok=false curl_exit=28 duration_ms=3009 tls_ms=0 request_bytes=0
12:23:52 diagnostic_256b xhttp ok=false curl_exit=28 duration_ms=3009 tls_ms=0 request_bytes=0
12:24:56 diagnostic_trace_30s xhttp ok=false curl_exit=28 duration_ms=3011 tls_ms=0 request_bytes=0 budget_seconds=30
```
Backend accepted VLESS and opened Cloudflare TCP at 12:21:19; at 12:22:19 it logged:
```
transport/internet/splithttp: failed to read body payload > stream error: stream ID 7; CANCEL
```
No later gstatic/HTTPBingo backend destination logs found in the inspected window.
The first failure follows destination TLS; subsequent failures hit the unchanged
3s connection limit, so the 30s total budget did not test a longer response wait.
Candidate payloads remain skipped. Root cause remains unproven.

Next hypothesis: compare fresh versus reused XHTTP client for the same small
request, preserving endpoint/budgets/quiet intervals. Do not infer DPI or a mux bug
from this one sequence; do not modify production subscriptions or host networking.
CodeRabbit did not review #145 because its review limit was reached.

## 2026-11-09 12:01 UTC — Prepare XHTTP response diagnostics after failed live control

PR #144 merged at 9aa1193 and deployed in run 42610055670. Backend and both probe
pods are available with zero restarts; all five manual website smoke checks pass.
First live candidate exit control from senaev-media:

```
check=exit_ip route=xhttp curl_exit=28 http_status=0 bytes=0 duration_ms=8013 tls_ms=2875
experiment_id=b9586e0d-3cd3-42fe-b193-7d63d07b997b
```

Backend received XHTTP requests (X-Forwarded-For warnings at 11:44:44 UTC).
Destination TLS completed, but no HTTP status/body arrived by the deadline.
This does not establish where packets stalled. Payloads were skipped by design;
baseline/direct 4 KiB checks passed. Only one candidate exit attempt is observed.

User approved tracing before changing transport. Prepared opt-in experimental Info
logs and extra numeric curl response-stage fields. Once per failed matrix, compare
direct/TCP trace and then three small serial XHTTP diagnostics separated by quiet
intervals, including a separately labelled 30s trace. Never override the original
failed exit validation. Profile 4 grace increases to 45s for bounded long-request
and two-child cleanup; existing backend/probe isolation is preserved.

Validation:
```
Ran 47 tests in 0.099s
OK
Python syntax OK: 15 file(s)
Helm charts OK
PASS: real curl exposes numeric response-stage fields; no body/headers emitted
PASS: diagnostics only changes experimental flags and profile 4 grace; routing, TLS paths, secrets, policies and other workloads unchanged
```
Tests cover bounded/serial controls, once-per-round invocation, cancellation, rollback
behavior, sanitized timing fields and no candidate promotion after long-budget success.

Pending review/deployment. No protocol, TLS verification, production subscription,
host networking, privileges or image-base changes.

## 2026-11-09 — Address CodeRabbit before merge

Candidate startup failure now emits a failed candidate_startup metric/log and
continues independent baseline measurements. An already-running client's later exit
still invalidates the cycle and restarts the checker. Added a regression test
covering baseline preservation and sanitized logging. Clarified actual egress
exclusions, normal dashboard gaps under rotating order, and deployed README status.

Verification excerpts from this PR's checks:
```
PASS: disabled mode equals baseline; production resources/subscription unchanged; only probe 4 gets candidate; isolated private backend and scoped path/policy; ingress-off disables experiment
Ran 40 tests in 0.062s
OK
Python syntax OK: 14 file(s)
Helm charts OK
Configuration OK.
Configuration OK.
```
The rendered check verifies rollback/isolation; unit/syntax/Helm checks verify code
and manifests. Both pinned Xray client/backend configs validate; CI's image build
passed. The updated startup regression is run again before push.

## 2026-11-09 11:13 UTC — Prepare isolated XHTTP/TLS comparison

PR #143 deployed in run 42588940242: config reloads observed, zero VPN pod restarts
and all five website smoke checks passed. User requested the next XHTTP experiment.

Prepared a dedicated backend behind a scoped path on existing senaev.com:443 TLS
fallback, plus a second loopback client only in profile 4. Existing server configs
and subscriptions stay unchanged. Dedicated derived UUID seed xhttp-probe uses the
existing secret. TLS verification remains enabled; Xray stays pinned to 26.9.30.
Serial baseline/candidate transfers alternate order and preserve quiet periods,
exit validation, failure invalidation and cancellation. TLS termination/proxying
also changes, so improvement cannot be attributed to transport alone.

Checksum-verified official Xray 26.9.30 / Traefik 3.2.0 local integration output:
```
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 4096 bytes
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 16384 bytes
PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: 65536 bytes
PASS: invalid VLESS credential cannot reach the HTTPS origin
PASS: ordinary website route preserved
```

Temporary certificates/credentials and loopback listeners only; no cluster changes.
The test trusts its certificate with verification enabled and explicitly permits
its loopback origin. Production retains Xray private-target blocking and a NetworkPolicy with explicit
RFC1918/tailnet/loopback/link-local/ULA exclusions; the policy does not enumerate
every special-use range (such as 198.18.0.0/15). The reusable test waits for Traefik TLS routing readiness.

Rendered verification: disabled mode equals baseline; existing resources/subscription
unchanged; only probe 4 gets candidate; private backend accepts only Hetzner Traefik.
Build-time real-binary tests cover both new configurations. Unit/syntax and Helm
checks are recorded in the PR. Pending review/deployment.

## 2026-11-09 08:49 UTC — Prepare FirstVDS entry-only role and checker jitter

User explicitly retained Hetzner and senaev-media as exits, requested removal of
FirstVDS as an exit, and approved timing randomization. Set exitEnabled=false for
FirstVDS: remove profile 2 / UUID seed 2, its subscription and expected exit, the
FirstVDS SOCKS listener/Service port, its freedom outbound and all cross-node SOCKS
outbounds targeting it. Remaining checker IDs stay 1/3/4/5, active profiles 1/4.

Jitter matrix quiet windows to 60–90s between conditions and 300–360s between rounds;
record the condition's sampled quiet interval in logs. Routine startup is 0–20s,
light cadence 30–45s and heavy cadence 300–360s. Preserve request size/rate/time limits,
serial execution, minimum quiet periods, shutdown and child-exit guards. Dashboard
matrix freshness increases to 20 minutes for the longer bounded cycle.

The first full #141 matrix passed all direct controls and profile 1; profile 4
passed 4 KiB but failed 16/64 KiB on both targets. #142 deployed successfully,
FirstVDS reload was observed, all five manual website smoke checks passed.
No new fail-closed routing, Happ authentication, XHTTP or host networking changes
are included. Those were discussed separately; XHTTP remains the next comparison.
Pending review/deployment.

## 2026-11-09 08:21 UTC — Prepare removal of FirstVDS direct exit

User requested removing FirstVDS → freedom. Delete its subscription entry, server
VLESS client UUID seed 4, corresponding user route and obsolete expected-exit mapping.
Preserve every remaining link and stable checker IDs by adding explicit probeIndex
values rather than renumbering array positions. Controlled selection remains 1/4.
The subscription service already projects name/link, ignoring checker metadata.

Validation:
```
PASS: removed seed-4 server client/rule/subscription; other servers identical; remaining probe IDs/routes/selectors preserved, only obsolete exit map key removed
Helm charts OK
```

The complete diff comparison found expected-exit map cleanup changes the remaining
checker pod environments; rollout will restart them. Wait for the current matrix
before deploying this separate PR. The FirstVDS Xray reloader will also restart its
pod, briefly affecting FirstVDS entry and its website fallback. Removal is not live
yet. Cached seed-4 links are invalidated server-side after reload; other FirstVDS
entry/exit routes remain by design. No host networking, credentials or permissions
changed.

## 2026-11-09 08:04 UTC — Prepare size/destination transfer matrix

Recovery experiment #139 deployed in run 42581455020. First-cycle logs:

```
profile 1 recovery_download: bytes=65536 duration_ms=2996 ok=true
profile 4 recovery_download: bytes=5518 duration_ms=8010 ok=false
profile 4 recovery_after_5s vpn: duration_ms=709 ok=true
profile 4 recovery_after_60s vpn: actual_delay_seconds=60 ok=true
```

All 5/30/60s VPN/direct/plain controls passed for both profiles. This weakens a
post-transfer disruption lasting at least five seconds, without excluding shorter
or per-flow disruption. User approved a size/destination comparison.

Replace recovery mode with a fixed six-condition matrix: Cloudflare and HTTPBingo
at 4/16/64 KiB, paired direct and VPN, with a small VPN precheck, five quiet minutes
between matrices and sixty quiet seconds between conditions. Rotate order by one
condition each round. Preserve two active profiles and existing client/shutdown
guards. Rename the temporary flag to controlledExperiment; false restores routine
six-profile checks. Remove superseded recovery execution code/metric phases rather
than keeping another experiment mode. No server or host-network changes.

HTTPBingo preparation from Code Tools:
```
200 4096
200 16384
200 65536
```
These are target availability checks from Code Tools, not Russian source results.
Validation: 31 Python tests pass; all Python syntax and Helm checks pass.
Rendered mode comparisons confirm two active/six restored checker replicas and
unchanged non-probe resources. HTTPBingo availability is verified only from Code Tools.
Pending PR review/deployment.

## 2026-11-09 07:43 UTC — Address CodeRabbit review on PR #139

Accepted both runtime findings: monitor the Xray child during recovery waits and
requests; invalidate a cycle on child exit and terminate for restart. Continuous
graceful shutdown now exits zero while interrupted one-shot checks fail. Added
the suggested shutdown-during-observation regression test. Fixed stale baseline
links/status and documented that the checker image must be rebuilt before charts.

Historical bulk evidence is preserved verbatim in
[sources/2026-11-09-deployed-bulk-metrics.json](sources/2026-11-09-deployed-bulk-metrics.json).
VictoriaMetrics instant query at 2026-11-09T00:03:50Z:
`max by(profile_index,check,route)(vpn_probe_success{job="vpn-probe",check=~"download_64k.*"})`.
The response includes all direct controls and both budgets for profiles 2–4, including
profile 4's original eight-second failure. No results were inferred from exit codes.

Validation: 31 Python tests pass, including client exit during download, exit during
quiet wait, graceful/interrupted shutdown, and no further requests after shutdown
during a plain observation. Pending deployment.

## 2026-11-09 00:14 UTC — Prepare controlled post-download recovery sequence

PR #138 deployed successfully in run 42537716826. All six checkers were scraped
on senaev-media with zero restarts, dashboard panels were present, and all five
website smoke URLs returned 200. Logs from the first extended round:

```
profile 1 download_64k_30s vpn: bytes=65536 curl_exit=0 duration_ms=2894
profile 4 download_64k_30s vpn: bytes=0 curl_exit=28 duration_ms=3009
profile 5 ipv6_entry direct: errno=101 ok=false
profile 5 ipv6_control direct: errno=101 ok=false
```

Direct bulk controls passed for all profiles; profiles 2–4 failed both VPN budgets.
The long-budget failure was a three-second connection timeout, not a measured
thirty-second transfer stall. IPv6 source transport is unavailable.

User approved preparing the next investigation as a PR: only checker profiles 1
and 4 run; all others pause. Five quiet minutes precede each cycle. Require working
small precontrols, send one bounded VPN download, then collect VPN/plain HTTPS/direct
controls at 5/30/60s absolute post-download offsets, with actual timing and a shared
cycle ID in logs. No routine checker traffic during this mode. Separate fixed metric
phases and dashboard panels expose the results. Toggle recoveryExperiment false
to restore the full routine suite. No server or host-network changes. Pending deployment.

Validation:
```
Ran 26 tests in 0.046s
OK
Python syntax OK: 11 file(s)
Helm charts OK
PASS: only profiles 1/4 active in experiment; false restores six; non-probe resources identical; isolation preserved
```
Fake-clock tests verify absolute offsets, one trigger, correlation, continued
observations after failure, cancellation, and the quiet startup. No live experiments
were run while preparing this PR.

## 2026-11-08 23:15 UTC — Automate the next controls in the existing checker

User requested automatic probes instead of operator-run commands. Extended each
heavy round with direct/VPN 64 KiB transfers at separate eight- and thirty-second
limits, plus IPv6 entry/control TCP checks only for the IPv6 profile. Existing
eight-second criteria remain unchanged. Light checks refresh between longer transfers.
Metrics keep separate fixed check names; Grafana compares both download budgets/routes
and shows IPv6 transport controls. Payload upper bound rises from approximately
108 to 432 MiB/day for six profiles, excluding small checks and protocol overhead.

PR #138 now includes implementation and replaces the manual experiment instructions.
No server, host-network, secrets, or permission changes. Validation: 21 Python tests pass; all Python syntax and Helm chart checks pass. Pending review/deployment.

## 2026-11-08 23:08 UTC — Deployed baseline identifies Hetzner-entry transfer stalls

PR #135 deployed after removing an invalid IPv4-mapped IPv6 NetworkPolicy exclusion
in PR #137. Deployment run 42531233399 succeeded. All six probe deployments are
available and scraped on senaev-media; existing VPN services remain available and
website smoke checks returned 200.

VictoriaMetrics current-pod download counters:
```
profile 0: success=4 failure=1
profile 1: success=5 failure=0
profile 2: success=0 failure=4
profile 3: success=0 failure=4
profile 4: success=0 failure=4
profile 5: success=0 failure=4
```

Datadog examples, 23:08 UTC:
```
profile 1: bytes=65536 http_status=200 curl_exit=0 duration_ms=2897
profile 2: bytes=5476  http_status=200 curl_exit=28 duration_ms=8009
profile 3: bytes=5502  http_status=200 curl_exit=28 duration_ms=8010
profile 4: bytes=6883  http_status=200 curl_exit=28 duration_ms=8011
profile 5: bytes=0     http_status=0   curl_exit=28 duration_ms=3010
```

Profiles 2–4 have successful exit-IP validation and mostly successful light HTTPS.
All direct HTTPS/exit controls pass. FirstVDS → Hetzner works while direct entry
to Hetzner stalls regardless of its eventual exit: investigate that shared entry
path first. No root cause established. IPv6 failure needs an independent same-pod
reachability control; historical home IPv6 absence is not proof about current pods.

Prepared a bounded manual experiment to distinguish short timeout from sustained
stall and add the missing direct bulk control, without changing deployments, secrets,
host networking, or the existing routine criteria. No new server settings applied.

## 2026-11-08 18:28 UTC — Add VictoriaMetrics and Grafana visualization

Added a bounded Prometheus exporter on port 8080, scraped every 30s by VMPodScrape.
Only telemetry vmagent can reach the port; SOCKS remains loopback-only. The provisioned
VPN Probes — Russia dashboard shows fresh direct/VPN connectivity, exit/download
checks, latency, success rate, traffic and sample age. No unbounded IP/run-ID labels.
CodeRabbit findings fixed: failed direct controls fail the full round, and arbitrary
invalid-request failures are inconclusive rather than proof of credential rejection.

Validation output:

```
Ran 15 tests in 0.021s
OK
PASS: actual HTTP exporter serves numeric metrics
PASS: scrape wiring, vmagent-only ingress, no exposed Service, and provisioned 14-panel dashboard
```

VictoriaMetrics accepted the combined PromQL syntax validation; no probe data is
expected before deployment. PR #135 remains the scope; nothing has been deployed.

## 2026-11-08 16:45 UTC — Prepare repeatable VPN diagnostics

Added one non-root, resource-limited Xray client/runner per subscription profile,
pinned to senaev-media. Explicit loopback SOCKS requests do not alter host networking.
NetworkPolicy allows only DNS and public HTTPS. Routine checks run serially at ~30s
and ~300s; bulk payload is capped at 64 KiB/profile/round (~108 MiB/day for six).
JSON logs are collected by Datadog; on-demand fresh-client and credential controls
are separate from routine traffic. No server tuning or debugging-branch deploys yet.

Validation output:

```
Ran 10 tests in 0.011s
OK
PASS: six isolated probe deployments, no host networking/storage/API token or exposed Service; disabling probes leaves existing resources identical.
```

The UUID fix in PR #134 is deployed and user-tested. These new diagnostics are still
pending review/deployment and must establish a Russian-ISP baseline before the repair
can be considered complete.

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
