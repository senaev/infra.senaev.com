# Validate the working H1 path with bounded payloads

The first #150 home H1 trace returned214 bytes with the correct exit in2064ms;
H2 stalled. A small successful response is insufficient to restore user profiles.

## Proposed experiment

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

Added maximum response payload:4KiB exit recheck plus2×(4+16+64)KiB =172KiB per
eligible round. Together with existing diagnostics: home at most188KiB per failed
matrix; Hetzner at most184KiB per cycle. Actual requests remain rate limited and
never overlap. No extra process runs concurrently with the existing version arms.

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

No live payload result yet. Local pinned-binary integration exercises exit
validation followed by all three sizes with direct controls on one H1 client,
TLS trust enforcement and cleanup. After deployment: verify health, smoke, scrape,
exit revalidation, exact byte counts and several rounds before changing Happ.
