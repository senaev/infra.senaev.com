"""Isolated experimental XHTTP backend; TLS is terminated by the existing ingress."""
import hashlib
import json
import os
from pathlib import Path
import uuid


def server_config(base_uuid, path, diagnostics=False):
    if not path.startswith("/") or not path.endswith("/"):
        raise ValueError("Invalid XHTTP path")
    user = str(uuid.UUID(hashlib.sha256(
        f"{base_uuid}:xhttp-probe".encode()).hexdigest()[:32]))
    return {
        "log": {"access": "none", "error": "/dev/stderr", "loglevel": "info" if diagnostics else "warning"},
        "inbounds": [{"listen": "0.0.0.0", "port": 8081, "protocol": "vless",
                      "settings": {"clients": [{"id": user}], "decryption": "none"},
                      "streamSettings": {"network": "xhttp", "security": "none",
                                         "xhttpSettings": {"path": path, "mode": "packet-up"}}}],
        # Only this exact diagnostic destination bypasses the public self-dial.
        # TLS bytes/SNI are untouched; the client still verifies senaev.com.
        "routing": {"rules": [{"type": "field", "domain": ["full:senaev.com"],
                               "port": "443", "network": "tcp", "outboundTag": "self-site"}]},
        "outbounds": [{"tag": "internet", "protocol": "freedom",
                       "streamSettings": {"sockopt": {"domainStrategy": "UseIPv4v6"}}},
                      {"tag": "self-site", "protocol": "freedom",
                       "settings": {"redirect": "traefik-hetzner.traefik.svc.cluster.local:8443",
                                    "finalRules": [{"action": "allow", "network": "tcp", "port": "8443"},
                                                   {"action": "block"}]}}]}


if __name__ == "__main__":
    config = Path("/tmp/xhttp-server.json")
    config.write_text(json.dumps(server_config(os.environ["XRAY_USER_UUID"],
                                               os.environ["XHTTP_PATH"],
                                               os.environ.get("XHTTP_DIAGNOSTICS") == "true")))
    config.chmod(0o600)
    os.execvp("xray", ["xray", "run", "-config", str(config)])
