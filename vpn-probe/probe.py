"""Bounded HTTPS probes through explicit loopback SOCKS; never change host routing."""
import argparse
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
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
    if (url.scheme != "vless" or not url.hostname or not url.port or
            params.get("type") != ["tcp"] or params.get("security") != ["reality"] or
            params.get("flow") != ["xtls-rprx-vision"]):
        raise ValueError("Only VLESS TCP Reality Vision profiles are supported")
    return {
        "log": {"access": "none", "error": "/dev/stderr", "loglevel": "warning"},
        "inbounds": [{"listen": "127.0.0.1", "port": port, "protocol": "socks",
                      "settings": {"auth": "noauth", "udp": False}}],
        # Deliberately no freedom/direct fallback outbound.
        "outbounds": [{"protocol": "vless", "settings": {"vnext": [{
            "address": url.hostname, "port": url.port, "users": [{
                "id": url.username, "encryption": "none", "flow": params["flow"][0]}]}]},
            "streamSettings": {"network": "tcp", "security": "reality",
                               "realitySettings": {
                                   "serverName": params["sni"][0],
                                   "fingerprint": params["fp"][0],
                                   "password": params["pbk"][0],
                                   "shortId": params.get("sid", [""])[0]}}}]}, seed[1]


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
                      "tls_ms": round(float(info.get("time_appconnect", 0))*1000)}
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



def check_recovery_client(child, profile, experiment_id=None):
    if child is not None and not STOP.is_set() and child.poll() is not None:
        emit(profile, "recovery_client_alive", "vpn", {
            "ok": False, "failure": "client_exited", "cycle_invalid": True,
            **({"experiment_id": experiment_id} if experiment_id else {})})
        raise RuntimeError("client_exited")


def recovery_wait(delay, child, profile, experiment_id=None):
    if child is None:
        return STOP.wait(delay)
    deadline = time.monotonic() + delay
    while not STOP.is_set():
        check_recovery_client(child, profile, experiment_id)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        if STOP.wait(min(1, remaining)):
            return True
    return True


def recovery_round(profile, proxy, child=None):
    """One bounded trigger, then observations at absolute post-download offsets."""
    experiment_id = str(uuid.uuid4())
    check_recovery_client(child, profile, experiment_id)
    emit(profile, "recovery_client_alive", "vpn", {
        "ok": True, "experiment_id": experiment_id})

    def observe(check, route, url, address, status=204, **context):
        if STOP.is_set():
            return False
        check_recovery_client(child, profile, experiment_id)
        anchor = context.pop("_anchor", None)
        if anchor is not None:
            context["actual_delay_seconds"] = round(time.monotonic() - anchor, 3)
        result, _ = request(url, address, 4096, expected_status=status)
        check_recovery_client(child, profile, experiment_id)
        emit(profile, check, route, {
            **result, "experiment_id": experiment_id, **context})
        return result["ok"]

    small_url = "https://www.gstatic.com/generate_204"
    plain_url = "https://senaev.com/robots.txt"
    direct_ok = observe("recovery_before", "direct", small_url, "")
    plain_ok = observe("recovery_plain_before", "direct", plain_url, "", 200)
    vpn_ok = observe("recovery_before", "vpn", small_url, proxy)
    if STOP.is_set():
        return False
    if not (direct_ok and plain_ok and vpn_ok):
        emit(profile, "recovery_skipped", "vpn", {
            "ok": False, "experiment_id": experiment_id,
            "failure": "positive_control_failed"})
        return False

    check_recovery_client(child, profile, experiment_id)
    result, _ = request("https://speed.cloudflare.com/__down?bytes=65536",
                        proxy, 65536, expected_bytes=65536)
    check_recovery_client(child, profile, experiment_id)
    # Anchor offsets at completion before logging or issuing any controls.
    finished = time.monotonic()
    emit(profile, "recovery_download", "vpn", {
        **result, "experiment_id": experiment_id})
    passed = result["ok"]
    for offset in [5, 30, 60]:
        if recovery_wait(max(0, finished + offset - time.monotonic()),
                         child, profile, experiment_id):
            return False
        context = {"requested_delay_seconds": offset, "_anchor": finished}
        passed = observe(f"recovery_after_{offset}s", "vpn",
                         small_url, proxy, **context) and passed
        if STOP.is_set():
            return False
        passed = observe(f"recovery_plain_after_{offset}s", "direct",
                         plain_url, "", 200, **context) and passed
        passed = observe(f"recovery_after_{offset}s", "direct",
                         small_url, "", **context) and passed
    return passed


def recovery_loop(profile, proxy, once=False, child=None):
    # Quiet startup and between cycles. No routine light/heavy traffic in this mode.
    while not recovery_wait(300, child, profile):
        passed = recovery_round(profile, proxy, child=child)
        if once:
            return 0 if passed else 1
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
    path = Path(folder) / "config.json"
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
    link, base, key = (os.environ[k] for k in ["PROFILE_LINK", "XRAY_USER_UUID", "XRAY_REALITY_PUBLIC_KEY"])
    config, seed = client_config(link, base, key, port=1081 if args.once else 1080)
    expected = json.loads(os.environ["EXPECTED_EXITS"])[seed]
    with tempfile.TemporaryDirectory(prefix="vpn-client-") as folder:
        if args.invalid:
            return negative(profile, link, base, key, folder)
        child = start_client(config, folder)
        proxy = f'socks5h://127.0.0.1:{config["inbounds"][0]["port"]}'
        try:
            if os.environ.get("RECOVERY_EXPERIMENT") == "true":
                return recovery_loop(profile, proxy, once=args.once, child=child)
            # Stagger profiles; serial rounds skip missed slots instead of catching up.
            STOP.wait(int(os.environ.get("PROFILE_INDEX", "0")) * 3 if not args.once else 0)
            due_light = due_heavy = time.monotonic()
            while not STOP.is_set():
                if child.poll() is not None:
                    raise RuntimeError("client_exited")
                now = time.monotonic()
                if now >= due_light:
                    passed = light(profile, proxy)
                    due_light = time.monotonic() + 30
                if now >= due_heavy:
                    passed = heavy(profile, proxy, expected) and passed
                    address = config["outbounds"][0]["settings"]["vnext"][0]["address"]
                    if ":" in address:
                        ipv6_controls(profile, address)
                    due_heavy = time.monotonic() + 300
                if args.once:
                    return 0 if passed else 1
                STOP.wait(0.5)
        finally:
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
