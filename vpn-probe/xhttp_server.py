"""Isolated experimental XHTTP backend; TLS is terminated by the existing ingress."""
import hashlib
import json
import os
from pathlib import Path
import uuid


def server_config(base_uuid, path):
    if not path.startswith("/") or not path.endswith("/"):
        raise ValueError("Invalid XHTTP path")
    user = str(uuid.UUID(hashlib.sha256(
        f"{base_uuid}:xhttp-probe".encode()).hexdigest()[:32]))
    return {
        "log": {"access": "none", "error": "/dev/stderr", "loglevel": "warning"},
        "inbounds": [{"listen": "0.0.0.0", "port": 8081, "protocol": "vless",
                      "settings": {"clients": [{"id": user}], "decryption": "none"},
                      "streamSettings": {"network": "xhttp", "security": "none",
                                         "xhttpSettings": {"path": path, "mode": "packet-up"}}}],
        "outbounds": [{"protocol": "freedom",
                       "streamSettings": {"sockopt": {"domainStrategy": "UseIPv4v6"}}}]}


if __name__ == "__main__":
    config = Path("/tmp/xhttp-server.json")
    config.write_text(json.dumps(server_config(os.environ["XRAY_USER_UUID"],
                                               os.environ["XHTTP_PATH"])))
    config.chmod(0o600)
    os.execvp("xray", ["xray", "run", "-config", str(config)])
