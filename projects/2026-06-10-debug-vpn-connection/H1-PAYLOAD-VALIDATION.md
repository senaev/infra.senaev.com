# Validate the working H1 path with bounded payloads

The first #150 home H1 trace returned214 bytes with the correct exit in2064ms;
H2 stalled. A small successful response is insufficient to restore user profiles.

## Deployed experiment (#151)

Keep the deployed H2/H1 trace pair and its alternating order. Run the payload
phase only after the whole pair completes, when its H1 trace passed. This prevents
payloads from changing the spacing inside either ordering of the version pair.

After60–90 quiet seconds, create another fresh native-TLS H1 process on loopback1083
and revalidate the expected exit using the existing capped Cloudflare trace.
Record this separately as diagnostic_h1_size_exit. If it fails, send no payloads.
On that same validated process, for4096/16384/65536 bytes:

1. Wait60–90 random quiet seconds, then fetch the exact size directly.
2. Wait2–7 random seconds, then fetch it through the H1 SOCKS client.
3. Record status, duration, bytes and paired direct-control outcome. Failed direct
   control marks the H1 comparison inconclusive. All three planned sizes remain
   bounded and serial even if an earlier measurement fails.

Existing8s total / 3s connect budget,32KiB/s rate cap, HTTPS verification and
no redirects/retries remain. Child/cancellation guards run before/after requests;
temporary client death invalidates the H1 phase without marking the baseline dead.
The process is always stopped before temporary config removal. Existing parent
process guards still invalidate a genuinely broken original matrix cycle.

## Limits and interpretation

Planned successful-response payload allowance:4KiB exit recheck plus2×(4+16+64)KiB =172KiB per
eligible round. Including existing diagnostics, the planned totals are188KiB per
failed home matrix and184KiB per Hetzner cycle. These are not strict wire-byte
limits: curl can read ahead before enforcing --max-filesize on a length-unknown
stream, and headers/TLS/XHTTP overhead are additional. Exact-size acceptance,
request timeouts and the configured transfer-rate limit remain enforced. Requests
are serial within each control. No extra process runs concurrently with the existing version arms.

This intentionally measures an exit-validated H1 process reused across requests
and quiet intervals, resembling normal client use. Failure can reflect size,
connection state, idle recovery or source/path conditions; it is not automatically
a size threshold or DPI proof. Compare the direct and Hetzner controls and repeat.
The separate version pair continues independently of size outcomes.

Checks transfer_h1_cloudflare_4096/16384/65536 use existing direct/xhttp routes and
fixed metrics. Existing Grafana matrix panels16–18 match transfer_.* and display
status/duration/bytes; the exit recheck appears in diagnostic panels20/21. Added
waits extend rounds by roughly4–8 minutes. Existing40-minute dashboard freshness
can show normal gaps for rotating conditions; absence alone is not a failed check.

## Isolation and rollback

No production subscription, ingress, server, chart, secret, network policy, image
base, privilege or host-network change. No H1 result promotes the failed original
Chrome/H2 candidate. Disabling diagnostics removes the home comparison/payload
phase and the Hetzner control as before; reverting this commit removes only the
new payload step while retaining #150's version comparison.

## First live result

PR #151 deployed at23dc7d9. In its first complete cycle, fresh H1 traces and size
exit checks passed from both sources. Hetzner passed4/16/64KiB; home failed all
three while all direct controls passed. Home4/16KiB completed destination TLS but
received zero response headers/body;64KiB failed during setup. This is not a clean
size threshold. [Captured evidence](sources/2026-11-09-h1-payload-results.txt).

## Fresh client without long post-exit idle (#152 deployed)

Retain the deployed ladder and version pair unchanged. If the version-pair H1
trace passed, after the complete ladder wait60–90s and start another verified
native H1 client on the same loopback1083. Validate its expected exit, recording
diagnostic_h1_fresh_size_exit. Only on success run one paired direct/H1 Cloudflare
4KiB request, recorded as transfer_h1_fresh_cloudflare_4096. The direct request
and2–7s jitter remain between exit validation and the payload; the extra60–90s
post-exit idle is omitted only for this control. It is not a first-request payload
test: the exit trace still precedes the download on the same process.

Run even when the original ladder failed, but never bypass this new process's exit
validation. Failed direct control makes the comparison inconclusive. Requests and
processes remain serial, with identical budgets, exact-size acceptance, TLS,
credentials, endpoint and cleanup. Existing Grafana regex panels match both new
check names, but #152 omitted them from the exporter allowlist. They are logged
only until the follow-up fixes the allowlist; absent fresh metrics are not failures. No server/chart/subscription/host-network changes.

Additional planned response allowance is12KiB (4KiB trace + two4KiB transfers).
New planned successful totals are200KiB/home failed matrix and196KiB/Hetzner
eligible cycle; read-ahead/protocol-overhead caveats above still apply. Adds about
one60–90s quiet interval plus bounded startup/requests, not a tighter probe cadence.
Revert this follow-up to retain the deployed #151 ladder.

If the fresh4KiB succeeds while the reused4KiB fails, process history/idle becomes
a stronger lead. If it fails too, removing long idle alone did not restore payloads.
This sequential comparison also changes process age and follows earlier traffic;
it does not isolate idle as a sole cause. Repeat both source controls before
changing destinations or Happ.

First #152 cycle: fresh home4KiB passed905ms at22:08:51 UTC after a successful
1881ms exit check; Hetzner passed535ms at22:06:53 after870ms exit validation.
Reused home4KiB passed883ms,16KiB failed setup3011ms,64KiB stalled8012ms after
TLS600ms. Direct controls and Hetzner's reused ladder passed. This is one fresh
cycle and both fresh/reused4KiB worked, so it does not identify idle as the cause.
[Captured evidence](sources/2026-11-09-h1-fresh-control.txt).

Local validation:76 fast unit tests,17 Python files parsed, diff check, and real
pinned Xray/Traefik integration pass. Integration checks the new exit-gated4KiB
pair and cleanup alongside the existing64KiB ladder, trust rejection, invalid
credential rejection and website fallback.


## Next prepared control — independent fresh16KiB

Keep the deployed version pair, reused ladder and fresh4KiB measurement. After
fresh4KiB completes, wait60–90s before creating a separate native H1 process for
16KiB. Validate its exit as diagnostic_h1_fresh_size_exit_16384; only a successful
exit permits one direct/H1 pair transfer_h1_fresh_cloudflare_16384 with2–7s jitter
and no60–90s post-exit idle. Each process stops before the next starts. If the4KiB
measurement fails, the independent16KiB control still runs with its own exit gate.
Both sources use the same sequence and limits. No live fresh16KiB result exists.

The first payload after a trace is now tested at16KiB without inheriting the
reused ladder's process. A fresh16KiB pass alongside a reused failure strengthens
process-history/idle as a lead; failure would show that a new process and removal
of the long idle are insufficient. Source, destination, timing and earlier traffic
still matter. This does not prove a byte threshold or DPI. Retain repeated rounds
and the Hetzner/direct controls; do not promote a Happ profile.

Fix the #152 exporter omission by allowing the four fixed fresh check names
(existing4KiB exit/download plus new16KiB exit/download). No arbitrary check names,
IDs or URLs become metric labels. Existing dashboard regexes then display them.

Additional planned response allowance beyond #152:4KiB exit + two16KiB transfers
=36KiB. New planned successful totals:236KiB/home failed matrix and232KiB/Hetzner
eligible cycle, with the same read-ahead and protocol-overhead caveats. Adds one
60–90s pre-start quiet interval plus bounded startup/requests. No new destination,
timeout, rate limit, server, chart, secret, policy, privilege or host-network change.
Reverting the follow-up restores #152's runtime; retain the exporter fix if needed.

Local checks:82 unit tests,17 Python files parsed, diff check, pinned Xray/Traefik
integration with distinct fresh4/16KiB clients, verified exit, exact sizes and
loopback cleanup. Existing trust/invalid-credential/website checks remain.

## Fresh 8 KiB follow-up (prepared, not deployed)

At 2026-11-11 08:43 UTC, current exported counters showed:

| Source | Fresh 4 KiB | Fresh 16 KiB | Reused 4/16/64 KiB |
|---|---|---|---|
| senaev-media | 19/20 passed | 0/19 passed | 19/19, 0/19, 0/19 |
| Hetzner | 38/38 passed | 38/38 passed | 39/39, 37/39, 38/38 |

All paired direct requests for these checks passed. Home fresh16KiB exit checks
passed19/20; the failed exit prevented a payload, rather than being counted as
a failed payload. These are cumulative current-process counters, not independent
matched rounds or a controlled simultaneous comparison. The source/path difference
persists on fresh clients; this weakens a process-history-only explanation.
It does not establish a universal size boundary, DPI or the responsible network hop.

Append one independent8KiB client **after** existing fresh4/16KiB controls, keeping
their order intact. Wait60–90s before startup, validate the same expected exit,
then direct8KiB →2–7s jitter →H1-proxied8KiB. Use the existing8s/3s request
budgets,32KiB/s rate cap, exact-byte check and verified TLS. Always clean up;
failed earlier sizes do not suppress8KiB. Parent exit/cancellation still stops it.
Run on both existing home and Hetzner diagnostic paths; acceptance of the original
failed matrix candidate is unchanged.

Fixed metrics/log names: `diagnostic_h1_fresh_size_exit_8192` and
`transfer_h1_fresh_cloudflare_8192`. Existing transfer dashboard selectors include
all `transfer_.*` checks, so no chart change is required for the payload result.

Adds at most20KiB **planned response allowance** per eligible cycle:4KiB exit
cap plus2×8KiB payloads. Previous236/232KiB planned home/Hetzner totals become
256/252KiB, excluding read-ahead, headers and transport overhead. Adds one60–90s
quiet interval, one temporary process and three requests. Longer serial cycles
can leave dashboard freshness gaps; missing samples are not failed probes.

If8KiB repeatedly fails at home with successful direct/Hetzner controls, the
observed problematic size range narrows below16KiB. If it passes, focus next on
the8–16KiB range. Intermittent or failed controls require more observations.
Because8KiB follows earlier traffic, position/history remain confounders; this
is not proof of a packet/MTU threshold and does not justify changing subscriptions.
