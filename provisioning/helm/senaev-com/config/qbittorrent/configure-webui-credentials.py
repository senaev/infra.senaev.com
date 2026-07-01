import json
import logging
import os
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("configure-webui-credentials")


STATE_FILE = Path("/credentials-config-state/webui-credentials-configured")
SERVICE_ACCOUNT_TOKEN_PATH = Path("/var/run/secrets/kubernetes.io/serviceaccount/token")
SERVICE_ACCOUNT_CA_PATH = Path("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt")
MAX_ATTEMPTS = 120
POLL_INTERVAL_SECONDS = 5
PASSWORD_PATTERN = re.compile(r"temporary password is provided for this session: (.+)$", re.MULTILINE)
QBITTORRENT_INITIAL_WEBUI_USERNAME = "admin"
QBITTORRENT_WEBUI_PORT = os.environ.get("QBITTORRENT_WEBUI_PORT", "9001")


def sleep(seconds: int) -> None:
    logger.info(f"⏳ Sleeping for {seconds}s...")
    time.sleep(seconds)


def wait_forever() -> None:
    logger.info("⏳ Waiting indefinitely to keep container alive...")
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
    logger.info("🔍 Fetching pod logs to find qBittorrent WebUI temporary password...")
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
    logger.info("🔍 Extracting qBittorrent WebUI temporary password from logs...")
    matches = PASSWORD_PATTERN.findall(logs)
    return matches[-1].strip() if matches else ""


def set_qbittorrent_webui_password(temporary_password: str) -> None:
    logger.info("🔐 Setting qBittorrent WebUI password from secret...")
    stable_password = get_required_env("QBITTORRENT_WEBUI_PASSWORD")
    cookie_jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

    login_body = urllib.parse.urlencode(
            {
                "username": QBITTORRENT_INITIAL_WEBUI_USERNAME,
                "password": temporary_password,
            },
    ).encode("utf-8")
    login_request = urllib.request.Request(
        f"http://127.0.0.1:{QBITTORRENT_WEBUI_PORT}/api/v2/auth/login",
        data=login_body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": str(len(login_body)),
        },
        method="POST",
    )

    try:
        with opener.open(login_request) as response:
            login_result = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"qBittorrent WebUI login failed with status {error.code}: {response_body}",
        ) from error

    if login_result != "Ok.":
        raise RuntimeError(f"qBittorrent WebUI login failed: {login_result}")

    preferences_body = urllib.parse.urlencode(
        {
            "json": json.dumps(
                    {
                        "web_ui_username": get_required_env("QBITTORRENT_WEBUI_USERNAME"),
                        "web_ui_password": stable_password,
                    },
            ),
        },
    ).encode("utf-8")
    preferences_request = urllib.request.Request(
        f"http://127.0.0.1:{QBITTORRENT_WEBUI_PORT}/api/v2/app/setPreferences",
        data=preferences_body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": str(len(preferences_body)),
        },
        method="POST",
    )

    try:
        with opener.open(preferences_request) as response:
            response.read()
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"qBittorrent WebUI password update failed with status {error.code}: {response_body}",
        ) from error

    logger.info("✅ qBittorrent WebUI password was set from secret")


def main() -> None:
    if STATE_FILE.exists():
        logger.info("✅ qBittorrent WebUI password already configured, waiting indefinitely")
        wait_forever()

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            logs = fetch_pod_logs()
            password = extract_password(logs)

            if not password:
                logger.info(
                    f"⏳ qBittorrent WebUI password not found in logs yet, attempt=[{attempt}/{MAX_ATTEMPTS}]",
                )
                sleep(POLL_INTERVAL_SECONDS)
                continue

            set_qbittorrent_webui_password(password)
            STATE_FILE.write_text("", encoding="utf-8")
            wait_forever()
        except Exception as error:
            logger.warning(
                f"⏳ Waiting for qBittorrent password, attempt=[{attempt}/{MAX_ATTEMPTS}]: {error}",
            )
            sleep(POLL_INTERVAL_SECONDS)

    logger.info("✅ qBittorrent WebUI temporary password was not found in pod logs")
    wait_forever()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        logger.error(f"❌ Error occurred: {error}")
        raise
