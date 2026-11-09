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

After the first failed 8s candidate exit check in each matrix, run once:

1. The same Cloudflare trace direct, then through the TCP/Reality baseline (8s each).
2. A small gstatic HTTPS 204 over XHTTP.
3. A 256-byte HTTPBingo response over XHTTP.
4. A separately labelled 30s candidate trace, validating its expected Hetzner exit.

Wait 60–90 quiet seconds before each additional candidate request, with the same
child-exit and cancellation guards. Requests remain serial, capped at 4 KiB and
32 KiB/s. Failed controls do not stop the remaining diagnostics. No full candidate
matrix is allowed after the original exit control fails, even if the long diagnostic
passes. A long success can reflect extra time, recovery during quiet intervals or
order effects; it does not alone prove that eight seconds was too short.

Five additional small requests per failed matrix, at most 16640 bytes of response
payload plus protocol overhead. No retries beyond this bounded once-per-round
sequence. Long curl subprocess bound is 32 seconds; profile 4 receives a 45-second
termination grace to allow bounded cleanup of both Xray children. Others remain 30s.

## Evidence and interpretation

All curl result logs add numeric cumulative pretransfer/first-byte timing and
HTTP request/header byte counts. No raw stderr, response body, full curl metadata,
credential-bearing configuration or headers are logged by the Python runner.
Info logs can contain fixed test destinations and XHTTP session identifiers.

Interpret first_byte_ms with HTTP status, header/body counts and request bytes;
rounded zero is not by itself proof that no packet arrived. These timings describe
the inner curl request, not the complete outer XHTTP handshake count or wire delivery.

- Direct and baseline trace succeed, candidate fails: focus on candidate forwarding.
- Candidate HTTPS 204 succeeds but trace/256 bytes fail: investigate destination,
  response size or streaming effects.
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
Pending review/deployment.
