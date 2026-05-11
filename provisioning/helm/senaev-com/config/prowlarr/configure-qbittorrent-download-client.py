import json
import os
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


PROWLARR_CONFIG_FILE = Path("/config/config.xml")
POLL_INTERVAL_SECONDS = 5
RETRY_INTERVAL_SECONDS = 30
QBITTORRENT_CLIENT_NAME = "qBittorrent"
FLARESOLVERR_PROXY_NAME = "FlareSolverr"


def sleep(seconds: int) -> None:
    print(f"Sleeping for {seconds}s...", flush=True)
    time.sleep(seconds)


def wait_forever() -> None:
    print("Waiting indefinitely to keep container alive...", flush=True)
    while True:
        time.sleep(60 * 60)


def get_required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")

    return value


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default

    return value.lower() in {"1", "true", "yes", "on"}


def request_text(
    *,
    url: str,
    method: str,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
) -> str:
    request = urllib.request.Request(
        url,
        data=body,
        headers=headers or {},
        method=method,
    )

    try:
        with urllib.request.urlopen(request) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with status {error.code}: {response_body}") from error


def read_prowlarr_api_key() -> str:
    while True:
        if PROWLARR_CONFIG_FILE.exists():
            root = ET.fromstring(PROWLARR_CONFIG_FILE.read_text(encoding="utf-8"))
            api_key = root.findtext("ApiKey")
            if api_key:
                return api_key

        print("Prowlarr API key is not available yet", flush=True)
        sleep(POLL_INTERVAL_SECONDS)


def prowlarr_request(
    *,
    api_key: str,
    path: str,
    method: str,
    body: Any | None = None,
) -> Any:
    headers = {"X-Api-Key": api_key}
    encoded_body = None

    if body is not None:
        encoded_body = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    response_text = request_text(
        url=f"http://127.0.0.1:9696{path}",
        method=method,
        headers=headers,
        body=encoded_body,
    )
    return json.loads(response_text) if response_text else None


def set_field(client: dict[str, Any], field_name: str, value: Any) -> None:
    for field in client.get("fields", []):
        if field.get("name") == field_name:
            field["value"] = value
            return

    client.setdefault("fields", []).append({"name": field_name, "value": value})


def set_schema_field(client: dict[str, Any], candidate_names: list[str], value: Any) -> None:
    field_names = {field.get("name") for field in client.get("fields", [])}
    for field_name in candidate_names:
        if field_name in field_names:
            set_field(client, field_name, value)
            return

    raise RuntimeError(
        f"Could not find any of the expected fields [{', '.join(candidate_names)}] "
        f"in Prowlarr schema for {client.get('name') or client.get('implementationName')}",
    )


def find_qbittorrent_schema(api_key: str) -> dict[str, Any]:
    schemas = prowlarr_request(api_key=api_key, path="/api/v1/downloadclient/schema", method="GET")
    matching_schemas = [
        schema
        for schema in schemas
        if schema.get("implementation") == "QBittorrent"
        or schema.get("implementationName") == "qBittorrent"
        or schema.get("name") == "qBittorrent"
    ]
    if not matching_schemas:
        raise RuntimeError("Could not find qBittorrent download client schema in Prowlarr")

    return matching_schemas[0]


def find_flaresolverr_schema(api_key: str) -> dict[str, Any]:
    schemas = prowlarr_request(api_key=api_key, path="/api/v1/indexerproxy/schema", method="GET")
    matching_schemas = [
        schema
        for schema in schemas
        if schema.get("implementation") == "FlareSolverr"
        or schema.get("implementationName") == "FlareSolverr"
        or schema.get("name") == "FlareSolverr"
    ]
    if not matching_schemas:
        raise RuntimeError("Could not find FlareSolverr indexer proxy schema in Prowlarr")

    return matching_schemas[0]


def upsert_tag(api_key: str, label: str) -> int:
    tags = prowlarr_request(api_key=api_key, path="/api/v1/tag", method="GET")
    current = next((tag for tag in tags if tag.get("label") == label), None)
    if current is not None:
        return int(current["id"])

    print(f"Creating Prowlarr tag [{label}]...", flush=True)
    created = prowlarr_request(api_key=api_key, path="/api/v1/tag", method="POST", body={"label": label})
    print(f"Created Prowlarr tag [{label}]", flush=True)
    return int(created["id"])


def build_qbittorrent_client(api_key: str, current: dict[str, Any] | None) -> dict[str, Any]:
    client = current if current is not None else find_qbittorrent_schema(api_key)
    client["name"] = QBITTORRENT_CLIENT_NAME
    client["enable"] = True
    client["priority"] = 1

    set_field(client, "host", "qbittorrent")
    set_field(client, "port", int(get_required_env("QBITTORRENT_WEBUI_PORT")))
    set_field(client, "useSsl", False)
    set_field(client, "urlBase", "")
    set_field(client, "username", get_required_env("QBITTORRENT_WEBUI_USERNAME"))
    set_field(client, "password", get_required_env("QBITTORRENT_WEBUI_PASSWORD"))
    set_field(client, "category", os.environ.get("QBITTORRENT_CATEGORY", ""))
    set_field(client, "initialState", 0)
    set_field(client, "sequentialOrder", False)
    set_field(client, "firstAndLast", False)

    return client


def upsert_qbittorrent_client(api_key: str) -> None:
    clients = prowlarr_request(api_key=api_key, path="/api/v1/downloadclient", method="GET")
    current = next((client for client in clients if client.get("name") == QBITTORRENT_CLIENT_NAME), None)
    client = build_qbittorrent_client(api_key, current)

    if current is None:
        print("Creating qBittorrent download client in Prowlarr...", flush=True)
        prowlarr_request(api_key=api_key, path="/api/v1/downloadclient", method="POST", body=client)
        print("Created qBittorrent download client in Prowlarr", flush=True)
        return

    print("Updating qBittorrent download client in Prowlarr...", flush=True)
    prowlarr_request(
        api_key=api_key,
        path=f"/api/v1/downloadclient/{current['id']}",
        method="PUT",
        body=client,
    )
    print("Updated qBittorrent download client in Prowlarr", flush=True)


def build_flaresolverr_proxy(
    api_key: str,
    current: dict[str, Any] | None,
    tag_id: int,
) -> dict[str, Any]:
    proxy = current if current is not None else find_flaresolverr_schema(api_key)
    proxy["name"] = FLARESOLVERR_PROXY_NAME
    proxy["enable"] = True
    proxy["tags"] = [tag_id]

    set_schema_field(proxy, ["host", "hostUrl", "url"], get_required_env("FLARESOLVERR_URL"))
    set_schema_field(
        proxy,
        ["requestTimeout", "requestTimeoutSeconds", "timeout"],
        int(get_required_env("FLARESOLVERR_REQUEST_TIMEOUT_SECONDS")),
    )

    return proxy


def upsert_flaresolverr_proxy(api_key: str) -> None:
    if not env_bool("FLARESOLVERR_ENABLED"):
        print("FlareSolverr proxy configuration is disabled", flush=True)
        return

    tag = get_required_env("FLARESOLVERR_TAG")
    tag_id = upsert_tag(api_key, tag)
    proxies = prowlarr_request(api_key=api_key, path="/api/v1/indexerproxy", method="GET")
    current = next((proxy for proxy in proxies if proxy.get("name") == FLARESOLVERR_PROXY_NAME), None)
    proxy = build_flaresolverr_proxy(api_key, current, tag_id)

    if current is None:
        print("Creating FlareSolverr indexer proxy in Prowlarr...", flush=True)
        prowlarr_request(api_key=api_key, path="/api/v1/indexerproxy", method="POST", body=proxy)
        print("Created FlareSolverr indexer proxy in Prowlarr", flush=True)
        return

    print("Updating FlareSolverr indexer proxy in Prowlarr...", flush=True)
    prowlarr_request(
        api_key=api_key,
        path=f"/api/v1/indexerproxy/{current['id']}",
        method="PUT",
        body=proxy,
    )
    print("Updated FlareSolverr indexer proxy in Prowlarr", flush=True)


def main() -> None:
    api_key = read_prowlarr_api_key()
    print("Prowlarr API key loaded", flush=True)

    while True:
        try:
            upsert_qbittorrent_client(api_key)
            upsert_flaresolverr_proxy(api_key)
            wait_forever()
        except Exception as error:
            print(f"Failed to configure Prowlarr: {error}", flush=True)
            sleep(RETRY_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
