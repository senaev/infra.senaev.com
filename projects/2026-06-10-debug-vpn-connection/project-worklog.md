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
