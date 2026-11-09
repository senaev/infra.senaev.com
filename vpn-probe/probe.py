"""Bounded HTTPS probes through explicit loopback SOCKS; never change host routing."""
import argparse
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import random
import signal
import socket
import subprocess
import tempfile
import threading
import time
from urllib.parse import parse_qs, urlsplit
import uuid

from metrics import ProbeMetrics, start_server

METRICS = ProbeMetrics()
STOP = threading.Event()
PROXY_ENV = {key: value for key, value in os.environ.items()
             if key.lower() not in {"http_proxy", "https_proxy", "all_proxy", "no_proxy"}}


def client_config(link, base_uuid, public_key, port=1080, invalid=False):
    """Use the subscription's UUID derivation; reject unsupported transports."""
    seed = re.search(r"\{XRAY_USER_UUID:([^}]+)\}", link)
    if not seed:
        raise ValueError("Missing subscription UUID macro")
    derived = str(uuid.UUID(hashlib.sha256(
        f"{base_uuid}:{seed[1]}".encode()).hexdigest()[:32]))
    link = link.replace(seed[0], str(uuid.uuid4()) if invalid else derived)
    url = urlsplit(link.replace("{XRAY_REALITY_PUBLIC_KEY}", public_key))
    params = parse_qs(url.query, keep_blank_values=True)
    if url.scheme != "vless" or not url.hostname or not url.port:
        raise ValueError("Invalid VLESS endpoint")
    transport, security = params.get("type"), params.get("security")
    user = {"id": url.username, "encryption": "none"}
    if transport == ["tcp"] and security == ["reality"] and params.get("flow") == ["xtls-rprx-vision"]:
        user["flow"] = "xtls-rprx-vision"
        stream = {"network": "tcp", "security": "reality", "realitySettings": {
            "serverName": params["sni"][0], "fingerprint": params["fp"][0],
            "password": params["pbk"][0], "shortId": params.get("sid", [""])[0]}}
    elif transport == ["xhttp"] and security == ["tls"] and not params.get("flow"):
        path = params.get("path", [""])[0]
        if not path.startswith("/") or not path.endswith("/") or params.get("mode") != ["packet-up"]:
            raise ValueError("XHTTP requires a path and packet-up mode")
        stream = {"network": "xhttp", "security": "tls",
                  "tlsSettings": {"serverName": params["sni"][0],
                                  "fingerprint": params["fp"][0], "alpn": ["h2"],
                                  "allowInsecure": False},
                  "xhttpSettings": {"path": path, "mode": "packet-up",
                                    "extra": {"xmux": {"maxConnections": 1,
                                                      "hKeepAlivePeriod": -1}}}}
    else:
        raise ValueError("Unsupported VPN transport/security combination")
    return {
        "log": {"access": "none", "error": "/dev/stderr", "loglevel": "warning"},
        "inbounds": [{"listen": "127.0.0.1", "port": port, "protocol": "socks",
                      "settings": {"auth": "noauth", "udp": False}}],
        # Deliberately no freedom/direct fallback outbound.
        "outbounds": [{"protocol": "vless", "settings": {"vnext": [{
            "address": url.hostname, "port": url.port, "users": [user]}]},
            "streamSettings": stream}]}, seed[1]


def request(url, proxy, max_bytes, expected_status=200, expected_bytes=None, timeout=8):
    """Disable curlrc, redirects, retries and ambient proxy settings."""
    with tempfile.TemporaryDirectory(prefix="vpn-response-") as folder:
        body = Path(folder) / "body"
        command = ["curl", "--disable", "--silent", "--show-error", "--fail",
                   "--proto", "=https", "--ipv4", "--connect-timeout", "3", "--max-time", str(timeout),
                   "--max-filesize", str(max_bytes), "--limit-rate", "32768",
                   "--proxy", proxy, "--noproxy", "", "--output", str(body),
                   "--write-out", "%{json}", url]
        started = time.monotonic()
        try:
            run = subprocess.run(command, env=PROXY_ENV, capture_output=True,
                                 text=True, timeout=timeout + 2, check=False)
            info = json.loads(run.stdout) if run.stdout else {}
            status = int(info.get("http_code", 0))
            size = body.stat().st_size if body.exists() else 0
            ok = run.returncode == 0 and status == expected_status
            if expected_bytes is not None:
                ok = ok and size == expected_bytes
            result = {"ok": ok, "curl_exit": run.returncode, "http_status": status,
                      "bytes": size, "duration_ms": round((time.monotonic()-started)*1000),
                      "connect_ms": round(float(info.get("time_connect", 0))*1000),
                      "tls_ms": round(float(info.get("time_appconnect", 0))*1000),
                      "first_byte_ms": round(float(info.get("time_starttransfer", 0))*1000),
                      "pretransfer_ms": round(float(info.get("time_pretransfer", 0))*1000),
                      "request_bytes": int(info.get("size_request", 0)),
                      "response_header_bytes": int(info.get("size_header", 0))}
            # Never log curl stderr, full trace bodies or credential-bearing config.
            content = body.read_text(errors="replace") if size <= 4096 and body.exists() else ""
            return result, content
        except (subprocess.TimeoutExpired, OSError, ValueError):
            return {"ok": False, "failure": "probe_execution_failed",
                    "duration_ms": round((time.monotonic()-started)*1000)}, ""


def trace_ip(body):
    for line in body.splitlines():
        if line.startswith("ip="):
            return str(ipaddress.ip_address(line[3:].strip()))
    raise ValueError("No exit IP in trace response")


def emit(profile, check, route, result):
    METRICS.record(profile, check, route, result)
    print(json.dumps({"service": "vpn-probe", "profile": profile, "check": check,
                      "route": route, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                      "run_id": str(uuid.uuid4()), "client_version": "26.9.30",
                      "profile_revision": hashlib.sha256(os.environ.get("PROFILE_LINK", "").encode()).hexdigest()[:12],
                      **result}), flush=True)


def light(profile, proxy):
    passed = True
    for route, address in [("direct", ""), ("vpn", proxy)]:
        result, _ = request("https://www.gstatic.com/generate_204", address,
                            4096, expected_status=204)
        emit(profile, "https", route, result)
        passed = passed and result["ok"]
    return passed


def resolve_exit(host):
    # getaddrinfo has no reliable per-call timeout; isolate it in a bounded process.
    run = subprocess.run(["python", "-c",
                          "import socket,json,sys; print(json.dumps([x[4][0] for x in socket.getaddrinfo(sys.argv[1],443)]))",
                          host], capture_output=True, text=True, timeout=4, check=True)
    return set(json.loads(run.stdout))


def heavy(profile, proxy, expected_host):
    url = "https://www.cloudflare.com/cdn-cgi/trace"
    direct, body = request(url, "", 4096)
    direct_ip = None
    try:
        if direct["ok"]:
            direct_ip = trace_ip(body)
            direct["exit_ip"] = direct_ip
    except ValueError:
        direct["ok"] = False
    emit(profile, "exit_ip", "direct", direct)
    result, body = request(url, proxy, 4096)
    try:
        if result["ok"]:
            observed = trace_ip(body)
            result["exit_ip"] = observed
            if expected_host == "direct":
                expected = {direct_ip} if direct_ip else set()
            else:
                expected = resolve_exit(expected_host)
            result["expected_exit"] = expected_host
            result["ok"] = observed in expected
    except (ValueError, OSError, subprocess.SubprocessError):
        result["ok"] = False
        result["failure"] = "exit_validation_failed"
    emit(profile, "exit_ip", "vpn", result)
    exit_ok = result["ok"]
    passed = direct["ok"] and exit_ok
    next_light = time.monotonic() + 30
    for timeout, check in [(8, "download_64k"), (30, "download_64k_30s")]:
        for route, address in [("direct", ""), ("vpn", proxy)]:
            if STOP.is_set():
                return False
            result, _ = request("https://speed.cloudflare.com/__down?bytes=65536",
                                address, 65536, expected_bytes=65536, timeout=timeout)
            emit(profile, check, route, {**result, "budget_seconds": timeout})
            passed = result["ok"] and passed
            # Keep light checks alive during the bounded longer experiment.
            if time.monotonic() >= next_light and not STOP.is_set():
                passed = light(profile, proxy) and passed
                next_light = time.monotonic() + 30
    return passed


def ipv6_controls(profile, address):
    """TCP reachability only, independent of Reality authentication."""
    for check, target in [("ipv6_entry", address),
                          ("ipv6_control", "2606:4700:4700::1111")]:
        if STOP.is_set():
            return False
        started = time.monotonic()
        try:
            with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as connection:
                connection.settimeout(3)
                connection.connect((target, 443))
            result = {"ok": True}
        except OSError as error:
            result = {"ok": False, "errno": error.errno,
                      "failure": type(error).__name__}
        emit(profile, check, "direct", {
            **result, "duration_ms": round((time.monotonic() - started) * 1000)})
    # Reachability controls inform diagnosis; they do not define VPN success.



def check_experiment_client(child, profile, experiment_id=None):
    children = child if isinstance(child, tuple) else (child,)
    for index, process in enumerate(children):
        if process is not None and not STOP.is_set() and process.poll() is not None:
            emit(profile, "experiment_client_alive", "vpn", {
                "ok": False, "failure": "client_exited", "cycle_invalid": True,
                "client_index": index,
                **({"experiment_id": experiment_id} if experiment_id else {})})
            raise RuntimeError("client_exited")


def experiment_wait(delay, child, profile, experiment_id=None):
    if child is None:
        return STOP.wait(delay)
    deadline = time.monotonic() + delay
    while not STOP.is_set():
        check_experiment_client(child, profile, experiment_id)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        if STOP.wait(min(1, remaining)):
            return True
    return True


TRANSFER_TARGETS = (
    ("cloudflare", "https://speed.cloudflare.com/__down?bytes={}"),
    ("httpbingo", "https://httpbingo.org/bytes/{}"),
)
TRANSFER_SIZES = (4096, 16384, 65536)


def xhttp_exit_control(profile, proxy, experiment_id, timeout=8, check="exit_ip"):
    if STOP.is_set():
        return False
    result, body = request("https://www.cloudflare.com/cdn-cgi/trace", proxy, 4096,
                           timeout=timeout)
    if STOP.is_set():
        return False
    try:
        if result["ok"]:
            observed = trace_ip(body)
            result.update(exit_ip=observed, expected_exit="senaev.com",
                          ok=observed in resolve_exit("senaev.com"))
    except (ValueError, OSError, subprocess.SubprocessError):
        result.update(ok=False, failure="exit_validation_failed")
    emit(profile, check, "xhttp", {**result, "experiment_id": experiment_id,
                                   "budget_seconds": timeout})
    return result["ok"]


def fresh_xhttp_exit_control(profile, child, experiment_id, native_tls=False, http1=False, measure_sizes=False):
    """One request through a separate process; never reset the matrix candidate."""
    if STOP.is_set():
        return False
    if measure_sizes and not http1:
        raise ValueError("Size diagnostic requires HTTP1")
    if http1 and not native_tls:
        raise ValueError("HTTP1 diagnostic requires native TLS")
    check = ("diagnostic_h1_size_exit" if measure_sizes else
             "diagnostic_native_h1_trace" if http1 else
             "diagnostic_native_trace" if native_tls else "diagnostic_fresh_trace")
    passed = False
    fresh = None
    try:
        config, _ = client_config(os.environ["XHTTP_PROFILE_LINK"],
                                  os.environ["XRAY_USER_UUID"],
                                  os.environ["XRAY_REALITY_PUBLIC_KEY"], port=1083)
        config["log"]["loglevel"] = "info"
        if native_tls:
            config["outbounds"][0]["streamSettings"]["tlsSettings"]["fingerprint"] = "unsafe"
        if http1:
            config["outbounds"][0]["streamSettings"]["tlsSettings"]["alpn"] = ["http/1.1"]
        with tempfile.TemporaryDirectory(prefix="vpn-fresh-client-") as folder:
            try:
                fresh = start_client(config, folder)
                if STOP.is_set():
                    return False
                check_experiment_client(child, profile, experiment_id)
                if fresh.poll() is not None and not STOP.is_set():
                    raise RuntimeError("fresh_client_exited")
                passed = xhttp_exit_control(profile, "socks5h://127.0.0.1:1083", experiment_id,
                                            check=check)
                check_experiment_client(child, profile, experiment_id)
                if fresh.poll() is not None and not STOP.is_set():
                    raise RuntimeError("fresh_client_exited")
                if passed and measure_sizes:
                    passed = h1_transfer_controls(profile, "socks5h://127.0.0.1:1083",
                                                  child, experiment_id, fresh=fresh)
            finally:
                if fresh is not None:
                    stop_client(fresh)
    except (KeyError, ValueError, RuntimeError, OSError) as error:
        passed = False
        check_experiment_client(child, profile, experiment_id)
        emit(profile, check, "xhttp", {
            "ok": False, "failure": "fresh_client_unavailable",
            "error_type": type(error).__name__, "experiment_id": experiment_id})
    check_experiment_client(child, profile, experiment_id)
    return passed


def h1_transfer_controls(profile, proxy, child, experiment_id, fresh=None):
    """One size ladder on the exit-validated H1 client, serial and bounded."""
    def guard():
        check_experiment_client(child, profile, experiment_id)
        if fresh is not None and not STOP.is_set() and fresh.poll() is not None:
            raise RuntimeError("fresh_client_exited")

    passed = True
    for size in TRANSFER_SIZES:
        if experiment_wait(random.uniform(60, 90), child, profile, experiment_id):
            return False
        if STOP.is_set():
            return False
        guard()
        url = f"https://speed.cloudflare.com/__down?bytes={size}"
        check = f"transfer_h1_cloudflare_{size}"
        direct, _ = request(url, "", size, expected_bytes=size)
        emit(profile, check, "direct", {**direct, "experiment_id": experiment_id,
                                       "requested_bytes": size})
        guard()
        jitter = random.uniform(2, 7)
        if experiment_wait(jitter, child, profile, experiment_id):
            return False
        if STOP.is_set():
            return False
        guard()
        result, _ = request(url, proxy, size, expected_bytes=size)
        guard()
        emit(profile, check, "xhttp", {**result, "experiment_id": experiment_id,
                                       "requested_bytes": size, "request_jitter_seconds": jitter,
                                       "direct_control_ok": direct["ok"],
                                       "comparison_inconclusive": not direct["ok"]})
        passed = direct["ok"] and result["ok"] and passed
    return passed


def xhttp_transport_controls(profile, child, experiment_id, http1_first=False):
    """Fresh processes for both HTTP versions; original matrix acceptance is untouched."""
    passed = True
    h1_ok = False
    versions = [True, False] if http1_first else [False, True]
    for http1 in versions:
        quiet = random.uniform(60, 90)
        if experiment_wait(quiet, child, profile, experiment_id):
            return False
        if STOP.is_set():
            return False
        check_experiment_client(child, profile, experiment_id)
        emit(profile, "diagnostic_transport_order", "xhttp", {
            "ok": True, "tls_client": "native", "http_version": "1.1" if http1 else "2",
            "http1_first": http1_first,
            "quiet_seconds_before": quiet,
            "experiment_id": experiment_id})
        result = fresh_xhttp_exit_control(profile, child, experiment_id, native_tls=True, http1=http1)
        check_experiment_client(child, profile, experiment_id)
        if http1:
            h1_ok = result
        passed = result and passed
    # Keep payload traffic after the complete version pair, including reversed order.
    if h1_ok:
        if experiment_wait(random.uniform(60, 90), child, profile, experiment_id):
            return False
        result = fresh_xhttp_exit_control(profile, child, experiment_id,
                                         native_tls=True, http1=True, measure_sizes=True)
        passed = result and passed
    return passed


def xhttp_response_diagnostics(profile, baseline, child, experiment_id, http1_first=False):
    """Same trace/budgets through fresh native TLS H2/H1 clients; never promote either."""
    trace = "https://www.cloudflare.com/cdn-cgi/trace"
    for route, address in [("direct", ""), ("vpn", baseline)]:
        jitter = random.uniform(2, 7)
        if experiment_wait(jitter, child, profile, experiment_id):
            return
        if STOP.is_set():
            return
        check_experiment_client(child, profile, experiment_id)
        result, _ = request(trace, address, 4096)
        check_experiment_client(child, profile, experiment_id)
        emit(profile, "diagnostic_trace", route, {**result, "experiment_id": experiment_id,
                                                   "request_jitter_seconds": jitter})
    xhttp_transport_controls(profile, child, experiment_id, http1_first=http1_first)


def transfer_round(profile, proxy, child=None, rotation=0, xhttp_proxy=None, diagnostics=False):
    """Fixed size/destination matrix, paired direct/VPN, no overlapping transfers."""
    experiment_id = str(uuid.uuid4())
    check_experiment_client(child, profile, experiment_id)
    emit(profile, "experiment_client_alive", "vpn", {
        "ok": True, "experiment_id": experiment_id})
    conditions = [(name, url, size) for size in TRANSFER_SIZES
                  for name, url in TRANSFER_TARGETS]
    offset = rotation % len(conditions)
    conditions = conditions[offset:] + conditions[:offset]
    passed = True
    candidate_exit_ok = None
    variants = [("vpn", proxy)] + ([("xhttp", xhttp_proxy)] if xhttp_proxy else [])
    for index, (target, template, size) in enumerate(conditions):
        quiet = random.uniform(60, 90) if index else 0
        if index and experiment_wait(quiet, child, profile, experiment_id):
            return False
        if STOP.is_set():
            return False
        check = f"transfer_{target}_{size}"
        context = {"experiment_id": experiment_id, "target": target,
                   "requested_bytes": size, "condition_index": index,
                   "quiet_seconds_before": quiet}
        check_experiment_client(child, profile, experiment_id)
        direct, _ = request(template.format(size), "", size, expected_bytes=size)
        check_experiment_client(child, profile, experiment_id)
        emit(profile, check, "direct", {**direct, **context})
        passed = direct["ok"] and passed
        if STOP.is_set():
            return False

        ordered = variants if (index + rotation) % 2 == 0 else list(reversed(variants))
        for variant_index, (route, address) in enumerate(ordered):
            variant_context = context
            if variant_index:
                pause = random.uniform(60, 90)
                if experiment_wait(pause, child, profile, experiment_id):
                    return False
                variant_context = {**context, "quiet_seconds_before": pause}
            if route == "xhttp":
                if candidate_exit_ok is None:
                    check_experiment_client(child, profile, experiment_id)
                    candidate_exit_ok = xhttp_exit_control(profile, address, experiment_id)
                    check_experiment_client(child, profile, experiment_id)
                    if not candidate_exit_ok and diagnostics:
                        xhttp_response_diagnostics(profile, proxy, child, experiment_id,
                                                   http1_first=bool(rotation % 2))
                if not candidate_exit_ok:
                    emit(profile, "transfer_skipped", route, {
                        "ok": False, "failure": "exit_control_failed", **variant_context})
                    passed = False
                    continue
            if STOP.is_set():
                return False
            before, _ = request("https://www.gstatic.com/generate_204", address,
                                4096, expected_status=204)
            check_experiment_client(child, profile, experiment_id)
            emit(profile, "transfer_precheck", route, {**before, **variant_context})
            if STOP.is_set():
                return False
            if not before["ok"]:
                emit(profile, "transfer_skipped", route, {
                    "ok": False, "failure": "positive_control_failed", **variant_context})
                passed = False
                continue
            jitter = random.uniform(2, 7)
            if experiment_wait(jitter, child, profile, experiment_id):
                return False
            result, _ = request(template.format(size), address, size, expected_bytes=size)
            check_experiment_client(child, profile, experiment_id)
            emit(profile, check, route, {
                **result, **variant_context, "request_jitter_seconds": jitter,
                "direct_control_ok": direct["ok"],
                "comparison_inconclusive": not direct["ok"]})
            passed = result["ok"] and passed
    return passed


def experiment_loop(profile, proxy, once=False, child=None, xhttp_proxy=None, diagnostics=False):
    # Five quiet minutes before each full matrix; one minute between conditions.
    rotation = 0
    while not STOP.is_set():
        quiet = random.uniform(300, 360)
        if experiment_wait(quiet, child, profile):
            break
        passed = transfer_round(profile, proxy, child=child, rotation=rotation,
                                xhttp_proxy=xhttp_proxy, diagnostics=diagnostics)
        if once:
            return 0 if passed else 1
        rotation += 1
    return 1 if once else 0



def stop_client(child):
    if child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()


def start_client(config, folder):
    path = Path(folder) / f"config-{config['inbounds'][0]['port']}.json"
    path.write_text(json.dumps(config))
    path.chmod(0o600)
    child = subprocess.Popen(["xray", "run", "-config", str(path)], stdout=subprocess.DEVNULL)
    # Listening means local readiness only, never a successful VPN test.
    deadline = time.monotonic() + 10
    port = config["inbounds"][0]["port"]
    while not STOP.is_set() and time.monotonic() < deadline and child.poll() is None:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                return child
        except OSError:
            STOP.wait(0.1)
    stop_client(child)
    raise RuntimeError("client_start_failed")


def negative(profile, link, base, key, folder):
    """Rejection counts only when the same valid profile works first."""
    for invalid in [False, True]:
        config, _ = client_config(link, base, key, port=1081, invalid=invalid)
        child = start_client(config, folder)
        try:
            result, _ = request("https://www.gstatic.com/generate_204",
                                "socks5h://127.0.0.1:1081", 4096, expected_status=204)
        finally:
            stop_client(child)
        if not invalid and not result["ok"]:
            emit(profile, "invalid_credentials", "vpn", {"ok": False, "failure": "positive_control_failed"})
            return 1
        if invalid:
            # A timeout/HTTP error is not evidence of server-side credential rejection.
            emit(profile, "invalid_credentials", "vpn", {
                "ok": False, "rejected": False, "request_failed": not result["ok"],
                "outcome": "inconclusive" if not result["ok"] else "unexpected_success",
                "curl_exit": result.get("curl_exit", -1),
                "http_status": result.get("http_status", 0)})
            return 2 if not result["ok"] else 1
    return 1


def xhttp_source_control(profile, once=False):
    """Low-volume public-endpoint control from a separate source node."""
    rotation = 0
    while not STOP.is_set():
        if experiment_wait(random.uniform(300, 360), None, profile):
            break
        experiment_id = str(uuid.uuid4())
        result, _ = request("https://www.cloudflare.com/cdn-cgi/trace", "", 4096)
        emit(profile, "diagnostic_trace", "direct", {**result, "experiment_id": experiment_id})
        passed = xhttp_transport_controls(profile, None, experiment_id, http1_first=bool(rotation % 2))
        rotation += 1
        if once:
            return 0 if passed and result["ok"] else 1
    return 1 if once else 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Fresh client; one light/heavy round")
    parser.add_argument("--invalid", action="store_true", help="On-demand valid/invalid credential comparison")
    args = parser.parse_args()
    if args.once or args.invalid:
        with open("/tmp/vpn-manual.lock", "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return run(args)
    server = start_server(METRICS)
    try:
        return run(args)
    finally:
        server.shutdown()
        server.server_close()


def run(args):
    for sig in [signal.SIGTERM, signal.SIGINT]:
        signal.signal(sig, lambda *_: STOP.set())
    profile = os.environ["PROFILE_NAME"]
    if os.environ.get("XHTTP_SOURCE_CONTROL") == "true":
        if args.invalid:
            raise ValueError("Source control does not run credential rejection tests")
        return xhttp_source_control(profile, once=args.once)
    link, base, key = (os.environ[k] for k in ["PROFILE_LINK", "XRAY_USER_UUID", "XRAY_REALITY_PUBLIC_KEY"])
    config, seed = client_config(link, base, key, port=1081 if args.once else 1080)
    expected = json.loads(os.environ["EXPECTED_EXITS"])[seed]
    with tempfile.TemporaryDirectory(prefix="vpn-client-") as folder:
        if args.invalid:
            return negative(profile, link, base, key, folder)
        child = start_client(config, folder)
        xhttp_child = None
        proxy = f'socks5h://127.0.0.1:{config["inbounds"][0]["port"]}'
        try:
            if os.environ.get("CONTROLLED_EXPERIMENT") == "true":
                xhttp_proxy = None
                if os.environ.get("XHTTP_PROFILE_LINK"):
                    try:
                        candidate, _ = client_config(os.environ["XHTTP_PROFILE_LINK"],
                                                     base, key, port=1082)
                        if os.environ.get("XHTTP_DIAGNOSTICS") == "true":
                            candidate["log"]["loglevel"] = "info"
                        xhttp_child = start_client(candidate, folder)
                        xhttp_proxy = "socks5h://127.0.0.1:1082"
                        emit(profile, "candidate_startup", "xhttp", {"ok": True})
                    except (KeyError, ValueError, RuntimeError, OSError) as error:
                        # Candidate failure must not suppress the independent baseline.
                        emit(profile, "candidate_startup", "xhttp", {
                            "ok": False, "failure": "candidate_unavailable",
                            "error_type": type(error).__name__})
                return experiment_loop(profile, proxy, once=args.once,
                                       child=(child, xhttp_child),
                                       xhttp_proxy=xhttp_proxy,
                                       diagnostics=os.environ.get("XHTTP_DIAGNOSTICS") == "true")
            # Stagger profiles; serial rounds skip missed slots instead of catching up.
            STOP.wait(random.uniform(0, 20) if not args.once else 0)
            due_light = due_heavy = time.monotonic()
            while not STOP.is_set():
                if child.poll() is not None:
                    raise RuntimeError("client_exited")
                now = time.monotonic()
                if now >= due_light:
                    passed = light(profile, proxy)
                    due_light = time.monotonic() + random.uniform(30, 45)
                if now >= due_heavy:
                    passed = heavy(profile, proxy, expected) and passed
                    address = config["outbounds"][0]["settings"]["vnext"][0]["address"]
                    if ":" in address:
                        ipv6_controls(profile, address)
                    due_heavy = time.monotonic() + random.uniform(300, 360)
                if args.once:
                    return 0 if passed else 1
                STOP.wait(0.5)
        finally:
            if xhttp_child is not None:
                stop_client(xhttp_child)
            stop_client(child)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyError, ValueError, RuntimeError, OSError) as error:
        # Config validation involves credentials: report the class, never its contents.
        print(json.dumps({"service": "vpn-probe", "ok": False,
                          "failure": type(error).__name__}), flush=True)
        raise SystemExit(1) from None
