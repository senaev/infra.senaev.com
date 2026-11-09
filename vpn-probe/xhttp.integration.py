"""Manual local integration: XRAY_BINARY=... TRAEFIK_BINARY=... python3 vpn-probe/xhttp.integration.py.

Uses temporary fake credentials and certificates, loopback-only listeners and no cluster.
Requires openssl and curl. Intentionally outside the fast test_*.py unit suite.
"""
import base64
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import probe
from xhttp_server import server_config


def free_port():
    with socket.socket() as connection:
        connection.bind(("127.0.0.1", 0))
        return connection.getsockname()[1]


def main():
    xray = os.environ["XRAY_BINARY"]
    traefik = os.environ["TRAEFIK_BINARY"]
    children, logs, servers = [], [], []
    with tempfile.TemporaryDirectory(prefix="xhttp-integration-") as folder:
        root = Path(folder)
        cert, key = root / "cert.pem", root / "key.pem"
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
                        "-keyout", str(key), "-out", str(cert), "-subj", "/CN=localhost",
                        "-addext", "subjectAltName=DNS:localhost", "-days", "1"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       check=True, timeout=10)
        ports = []
        while len(ports) < 6:
            port = free_port()
            if port not in ports:
                ports.append(port)
        front_port, tls_port, backend_port, socks_port, origin_port, website_port = ports

        origin_requests = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.server.server_port == origin_port:
                    origin_requests.append(self.path)
                data = bytes(int(self.path.rsplit("/", 1)[1])) if self.path.startswith("/bytes/") else b"website-ok"
                if self.path == "/cdn-cgi/trace":
                    data = b"ip=127.0.0.1\n"
                self.send_response(200)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *_):
                pass

        def serve(port, tls=False):
            server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            if tls:
                context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                context.load_cert_chain(cert, key)
                server.socket = context.wrap_socket(server.socket, server_side=True)
            servers.append(server)
            threading.Thread(target=server.serve_forever, daemon=True).start()

        def start(command, name, port):
            log = open(root / (name + ".log"), "w")
            logs.append(log)
            child = subprocess.Popen(command, stdout=log, stderr=log)
            children.append(child)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and child.poll() is None:
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                        return
                except OSError:
                    time.sleep(0.02)
            raise RuntimeError(f"{name} did not listen; inspect {root / (name + '.log')}")

        def write(name, config):
            path = root / name
            path.write_text(json.dumps(config))
            return str(path)

        path = "/_vpn-xhttp-test/"
        base = "local-integration-only"
        backend = server_config(base, path)
        backend["inbounds"][0].update(listen="127.0.0.1", port=backend_port)
        # Test-only exception for this loopback origin; production keeps private targets blocked.
        backend["outbounds"][0]["settings"] = {"finalRules": [
            {"action": "allow", "ip": ["127.0.0.1/32"], "port": origin_port}]}
        backend["log"]["loglevel"] = "debug"
        edge = {
            "log": {"loglevel": "debug"},
            "inbounds": [{"listen": "127.0.0.1", "port": front_port, "protocol": "vless",
                          "settings": {"clients": [{"id": "11111111-1111-1111-1111-111111111111",
                                                    "flow": "xtls-rprx-vision"}], "decryption": "none"},
                          "streamSettings": {"network": "tcp", "security": "reality", "realitySettings": {
                              "dest": f"127.0.0.1:{tls_port}", "serverNames": ["localhost"],
                              "privateKey": base64.urlsafe_b64encode(bytes([1]) * 32).decode().rstrip("="),
                              "shortIds": [""]}}}],
            "outbounds": [{"protocol": "blackhole"}]}
        routing = {
            "tls": {"certificates": [{"certFile": str(cert), "keyFile": str(key)}]},
            "http": {
                "routers": {
                    "xhttp": {"rule": f"Host(`localhost`) && PathPrefix(`{path}`)",
                              "entryPoints": ["test"], "service": "xhttp", "tls": {}, "priority": 100},
                    "website": {"rule": "Host(`localhost`)", "entryPoints": ["test"],
                                "service": "website", "tls": {}, "priority": 1}},
                "services": {
                    "xhttp": {"loadBalancer": {"servers": [{"url": f"h2c://127.0.0.1:{backend_port}"}]}},
                    "website": {"loadBalancer": {"servers": [{"url": f"http://127.0.0.1:{website_port}"}]}}}}}
        link = (f"vless://{{XRAY_USER_UUID:xhttp-probe}}@localhost:{front_port}?"
                f"type=xhttp&security=tls&fp=chrome&sni=localhost&mode=packet-up&path={path}")
        client, _ = probe.client_config(link, base, "unused", port=socks_port)
        client["log"]["loglevel"] = "debug"
        # Trust only this test certificate; keep verification enabled.
        client["outbounds"][0]["streamSettings"]["tlsSettings"]["certificates"] = [
            {"certificateFile": str(cert), "usage": "verify"}]
        try:
            serve(origin_port, tls=True)
            serve(website_port)
            start([xray, "run", "-config", write("backend.json", backend)], "backend", backend_port)
            start([traefik, "--log.level=ERROR",
                   f"--entrypoints.test.address=127.0.0.1:{tls_port}",
                   "--providers.file.filename=" + write("routing.json", routing)], "traefik", tls_port)
            start([xray, "run", "-config", write("edge.json", edge)], "edge", front_port)
            start([xray, "run", "-config", write("client.json", client)], "client", socks_port)
            env = {k: v for k, v in os.environ.items() if not k.lower().endswith("_proxy")}
            ready_deadline = time.monotonic() + 5
            while True:
                ready = subprocess.run(
                    ["curl", "--disable", "--silent", "--fail", "--max-time", "1",
                     "--cacert", str(cert), "--proxy", "", f"https://localhost:{front_port}/"],
                    env=env, capture_output=True, timeout=2)
                if ready.returncode == 0 and ready.stdout == b"website-ok":
                    break
                if time.monotonic() >= ready_deadline:
                    raise RuntimeError("TLS website fallback did not become ready")
                time.sleep(0.05)
            for size in [4096, 16384, 65536]:
                run = subprocess.run(
                    ["curl", "--disable", "--silent", "--show-error", "--fail",
                     "--connect-timeout", "3", "--max-time", "8", "--max-filesize", str(size),
                     "--cacert", str(cert), "--proxy", f"socks5h://127.0.0.1:{socks_port}",
                     "--noproxy", "", f"https://localhost:{origin_port}/bytes/{size}"],
                    env=env, capture_output=True, timeout=10)
                assert run.returncode == 0 and len(run.stdout) == size, (
                    size, run.returncode, run.stderr.decode())
                print(f"PASS: verified TLS -> Reality fallback -> Traefik -> h2c XHTTP: {size} bytes")
            # Exercise real fresh-process startup, verified TLS, request and cleanup twice.
            with socket.socket() as connection:
                assert connection.connect_ex(("127.0.0.1", 1083)) != 0, "Test port 1083 is occupied"
            original_config, original_request = probe.client_config, probe.request

            def trusted_config(*args, **kwargs):
                config, seed = original_config(*args, **kwargs)
                config["outbounds"][0]["streamSettings"]["tlsSettings"]["certificates"] = [
                    {"certificateFile": str(cert), "usage": "verify"}]
                return config, seed

            def local_trace(url, *args, **kwargs):
                assert url == "https://www.cloudflare.com/cdn-cgi/trace"
                return original_request(f"https://localhost:{origin_port}/cdn-cgi/trace", *args, **kwargs)

            with patch.dict(os.environ, {"XHTTP_PROFILE_LINK": link, "XRAY_USER_UUID": base,
                                         "XRAY_REALITY_PUBLIC_KEY": "unused",
                                         "PATH": str(Path(xray).parent) + os.pathsep + os.environ["PATH"]}), \
                    patch.dict(probe.PROXY_ENV, {"CURL_CA_BUNDLE": str(cert)}), \
                    patch.object(probe, "client_config", side_effect=trusted_config), \
                    patch.object(probe, "request", side_effect=local_trace), \
                    patch.object(probe, "resolve_exit", return_value={"127.0.0.1"}), \
                    patch.object(probe, "emit") as emitted:
                for _ in range(2):
                    assert probe.fresh_xhttp_exit_control("local", None, "integration")
                    assert emitted.call_args.args[1] == "diagnostic_fresh_trace"
                    assert emitted.call_args.args[3]["ok"], emitted.call_args
                    with socket.socket() as connection:
                        assert connection.connect_ex(("127.0.0.1", 1083)) != 0
            print("PASS: two fresh-client controls validate TLS/exit and release loopback 1083")
            bad_port = free_port()
            invalid, _ = probe.client_config(link, base, "unused", port=bad_port, invalid=True)
            invalid["outbounds"][0]["streamSettings"]["tlsSettings"]["certificates"] = [
                {"certificateFile": str(cert), "usage": "verify"}]
            start([xray, "run", "-config", write("invalid.json", invalid)], "invalid", bad_port)
            count = len(origin_requests)
            rejected = subprocess.run(
                ["curl", "--disable", "--silent", "--fail", "--max-time", "3",
                 "--cacert", str(cert), "--proxy", f"socks5h://127.0.0.1:{bad_port}",
                 "--noproxy", "", f"https://localhost:{origin_port}/bytes/4096"],
                env=env, capture_output=True, timeout=5)
            assert rejected.returncode != 0 and not rejected.stdout
            assert len(origin_requests) == count
            print("PASS: invalid VLESS credential cannot reach the HTTPS origin")
            website = subprocess.run(
                ["curl", "--disable", "--silent", "--show-error", "--fail", "--max-time", "5",
                 "--cacert", str(cert), "--proxy", "", f"https://localhost:{front_port}/"],
                env=env, capture_output=True, timeout=7, check=True)
            assert website.stdout == b"website-ok"
            print("PASS: ordinary website route preserved")
        except Exception:
            for log_path in root.glob("*.log"):
                print(log_path.name, log_path.read_text()[-6500:])
            raise
        finally:
            for child in reversed(children):
                probe.stop_client(child)
            for server in servers:
                server.shutdown()
                server.server_close()
            for log in logs:
                log.close()


if __name__ == "__main__":
    main()
