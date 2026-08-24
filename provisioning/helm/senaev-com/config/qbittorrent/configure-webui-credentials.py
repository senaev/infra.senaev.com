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


class _JsonFormatter(logging.Formatter):
    _PINO_LEVELS = {
        logging.DEBUG: 20,
        logging.INFO: 30,
        logging.WARNING: 40,
        logging.ERROR: 50,
        logging.CRITICAL: 60,
    }

    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({
            "level": self._PINO_LEVELS.get(record.levelno, 30),
            "time": int(record.created * 1000),
            "name": record.name,
            "msg": record.getMessage(),
        }, ensure_ascii=False)


_handler = logging.StreamHandler()
_handler.setFormatter(_JsonFormatter())
logging.root.setLevel(logging.INFO)
logging.root.addHandler(_handler)

logger = logging.getLogger("configure-webui-credentials")


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


def post_form(
    opener: urllib.request.OpenerDirector,
    path: str,
    fields: dict[str, str],
) -> str:
    body = urllib.parse.urlencode(fields).encode("utf-8")
    request = urllib.request.Request(
        f"http://127.0.0.1:{QBITTORRENT_WEBUI_PORT}{path}",
        data=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": str(len(body)),
        },
        method="POST",
    )

    try:
        with opener.open(request) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"POST {path} failed with status {error.code}: {response_body}") from error


def login(username: str, password: str) -> urllib.request.OpenerDirector | None:
    """Return an authenticated opener, or None when the WebUI rejects the credentials.

    Raises when the WebUI is not reachable yet, so the caller can retry.
    """
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    result = post_form(opener, "/api/v2/auth/login", {"username": username, "password": password})

    return opener if result == "Ok." else None


def set_webui_credentials(temporary_password: str, username: str, password: str) -> None:
    logger.info("🔐 Setting qBittorrent WebUI credentials from secret...")
    opener = login(QBITTORRENT_INITIAL_WEBUI_USERNAME, temporary_password)

    if opener is None:
        raise RuntimeError("qBittorrent WebUI rejected the temporary password taken from the pod log")

    post_form(
        opener,
        "/api/v2/app/setPreferences",
        {
            "json": json.dumps(
                {
                    "web_ui_username": username,
                    "web_ui_password": password,
                },
            ),
        },
    )


def main() -> None:
    username = get_required_env("QBITTORRENT_WEBUI_USERNAME")
    password = get_required_env("QBITTORRENT_WEBUI_PASSWORD")

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            if login(username, password) is not None:
                logger.info("✅ qBittorrent WebUI already accepts the credentials from the secret")
                wait_forever()

            logger.info("👉 qBittorrent WebUI rejects the credentials from the secret, configuring them...")
            temporary_password = extract_password(fetch_pod_logs())

            if not temporary_password:
                logger.info(
                    f"⏳ qBittorrent WebUI temporary password not found in logs yet, attempt=[{attempt}/{MAX_ATTEMPTS}]",
                )
                sleep(POLL_INTERVAL_SECONDS)
                continue

            set_webui_credentials(temporary_password, username, password)

            if login(username, password) is None:
                raise RuntimeError("qBittorrent WebUI rejects the credentials right after they were set")

            logger.info("✅ qBittorrent WebUI credentials were set from secret")
            wait_forever()
        except Exception as error:
            logger.warning(
                f"⏳ Waiting for qBittorrent WebUI, attempt=[{attempt}/{MAX_ATTEMPTS}]: {error}",
            )
            sleep(POLL_INTERVAL_SECONDS)

    raise RuntimeError(
        f"qBittorrent WebUI credentials were not configured after {MAX_ATTEMPTS} attempts",
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        logger.error(f"❌ Error occurred: {error}")
        raise
