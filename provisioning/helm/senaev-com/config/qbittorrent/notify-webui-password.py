import html
import json
import os
import re
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path


STATE_FILE = Path("/password-notify-state/webui-password-sent")
SERVICE_ACCOUNT_TOKEN_PATH = Path("/var/run/secrets/kubernetes.io/serviceaccount/token")
SERVICE_ACCOUNT_CA_PATH = Path("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt")
MAX_ATTEMPTS = 120
POLL_INTERVAL_SECONDS = 5
PUBLISH_RETRY_INTERVAL_SECONDS = 3
PASSWORD_PATTERN = re.compile(r"temporary password is provided for this session: (.+)$", re.MULTILINE)


def sleep(seconds: int) -> None:
    print(f"⏳ Sleeping for {seconds}s...", flush=True)
    time.sleep(seconds)


def wait_forever() -> None:
    print("⏳ Waiting indefinitely to keep container alive...", flush=True)
    while True:
        time.sleep(60 * 60)


def get_required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")

    return value


def request_text(
    *,
    protocol: str,
    hostname: str,
    port: str,
    path: str,
    method: str,
    headers: dict[str, str] | None = None,
    ca_path: Path | None = None,
    body: bytes | None = None,
) -> str:
    url = f"{protocol}://{hostname}:{port}{path}"
    context = None
    if protocol == "https":
        context = ssl.create_default_context(cafile=str(ca_path) if ca_path else None)

    request = urllib.request.Request(
        url,
        data=body,
        headers=headers or {},
        method=method,
    )

    try:
        with urllib.request.urlopen(request, context=context) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with status {error.code}: {response_body}") from error


def fetch_pod_logs() -> str:
    print("🔍 Fetching pod logs to find qBittorrent WebUI temporary password...", flush=True)
    k8s_host = get_required_env("KUBERNETES_SERVICE_HOST")
    k8s_port = os.environ.get("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    pod_name = get_required_env("POD_NAME")
    pod_namespace = get_required_env("POD_NAMESPACE")
    token = SERVICE_ACCOUNT_TOKEN_PATH.read_text(encoding="utf-8").strip()
    path = f"/api/v1/namespaces/{pod_namespace}/pods/{pod_name}/log?container=qbittorrent"

    return request_text(
        protocol="https",
        hostname=k8s_host,
        port=k8s_port,
        path=path,
        method="GET",
        headers={"Authorization": f"Bearer {token}"},
        ca_path=SERVICE_ACCOUNT_CA_PATH,
    )


def extract_password(logs: str) -> str:
    print("🔍 Extracting qBittorrent WebUI temporary password from logs...", flush=True)
    matches = PASSWORD_PATTERN.findall(logs)
    return matches[-1].strip() if matches else ""


def publish_password(password: str, chat_id: str) -> str:
    print("🚀 Sending qBittorrent WebUI temporary password to cluster-helper...", flush=True)
    pod_name = get_required_env("POD_NAME")
    body = json.dumps(
        {
            "chatId": chat_id,
            "text": (
                "qBittorrent WebUI password for\n"
                "https://qbittorrent.senaev.com/\n"
                f"<code>{html.escape(pod_name)}</code>:\n"
                f"<tg-spoiler>{html.escape(password)}</tg-spoiler>"
            ),
            "parseMode": "HTML",
            "replyMarkup": {
                "inline_keyboard": [[{"text": "Copy", "copy_text": {"text": password}}]],
            },
        },
    ).encode("utf-8")

    return request_text(
        protocol="http",
        hostname="cluster-helper",
        port="80",
        path="/telegram/send-message",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        },
        body=body,
    )


def publish_password_with_retries(password: str, chat_id: str) -> str:
    print("🚀 Sending qBittorrent WebUI temporary password to cluster-helper...", flush=True)

    attempt = 1
    while True:
        try:
            publish_result = publish_password(password, chat_id)
            print(f"✅ qBittorrent WebUI password send succeeded on retry=[{attempt}]", flush=True)
            return publish_result
        except Exception as error:
            print(
                f"⏳ qBittorrent WebUI password send failed, attempt=[{attempt}]: {error}",
                flush=True,
            )
            sleep(PUBLISH_RETRY_INTERVAL_SECONDS)
            attempt += 1


def main() -> None:
    if STATE_FILE.exists():
        print("✅ qBittorrent WebUI password already published, waiting indefinitely", flush=True)
        wait_forever()

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            logs = fetch_pod_logs()
            password = extract_password(logs)

            if not password:
                print(
                    f"⏳ qBittorrent WebUI password not found in logs yet, attempt=[{attempt}/{MAX_ATTEMPTS}]",
                    flush=True,
                )
                sleep(POLL_INTERVAL_SECONDS)
                continue

            publish_results = [
                publish_password_with_retries(password, get_required_env("TG_CLUSTER_CHAT_ID")),
                publish_password_with_retries(password, get_required_env("TG_MEDIA_SERVER_CHAT_ID")),
            ]
            STATE_FILE.write_text("", encoding="utf-8")
            print(f"✅ qBittorrent WebUI temporary password published: {publish_results}", flush=True)
            wait_forever()
        except Exception as error:
            print(
                f"⏳ Waiting for qBittorrent password, attempt=[{attempt}/{MAX_ATTEMPTS}]: {error}",
                flush=True,
            )
            sleep(POLL_INTERVAL_SECONDS)

    print("✅ qBittorrent WebUI temporary password was not found in pod logs", flush=True)
    wait_forever()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"❌ Error occurred: {error}", flush=True)
        raise
