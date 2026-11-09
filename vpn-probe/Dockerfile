FROM teddysun/xray:26.9.30 AS xray
FROM python:3.13-alpine
RUN apk add --no-cache curl ca-certificates
COPY --from=xray /usr/bin/xray /usr/local/bin/xray
WORKDIR /app
COPY vpn-probe/probe.py vpn-probe/metrics.py vpn-probe/xhttp_server.py /app/
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# Validate the generated client configuration against the pinned Xray binary at build time.
RUN python -c 'import base64,json,probe; link="vless://{XRAY_USER_UUID:4}@example.com:443?type=tcp&security=reality&flow=xtls-rprx-vision&fp=chrome&sni=example.com&pbk={XRAY_REALITY_PUBLIC_KEY}&sid="; key=base64.urlsafe_b64encode(bytes([1])*32).decode().rstrip("="); print(json.dumps(probe.client_config(link,"build-test",key)[0]))' > /tmp/client.json \
    && xray run -test -config /tmp/client.json \
    && python -c 'from pathlib import Path; Path("/tmp/client.json").unlink()'
RUN python -c 'import json,probe,xhttp_server; path="/_vpn-xhttp-test/"; link="vless://{XRAY_USER_UUID:xhttp-probe}@example.com:443?type=xhttp&security=tls&fp=chrome&sni=example.com&mode=packet-up&path="+path; open("/tmp/client.json","w").write(json.dumps(probe.client_config(link,"build-test","unused")[0])); open("/tmp/server.json","w").write(json.dumps(xhttp_server.server_config("build-test",path)))' \
    && xray run -test -config /tmp/client.json \
    && xray run -test -config /tmp/server.json \
    && python -c 'from pathlib import Path; Path("/tmp/client.json").unlink(); Path("/tmp/server.json").unlink()'
USER 10001:10001
CMD ["python", "/app/probe.py"]
