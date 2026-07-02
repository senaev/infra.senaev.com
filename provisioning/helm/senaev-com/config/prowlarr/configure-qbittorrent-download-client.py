import json
import logging
import os
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


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

logger = logging.getLogger("configure-qbittorrent-download-client")


PROWLARR_CONFIG_FILE = Path("/config/config.xml")
PROWLARR_INDEXERS_FILE = Path("/scripts/indexers.json")
POLL_INTERVAL_SECONDS = 5
RETRY_INTERVAL_SECONDS = 30
QBITTORRENT_CLIENT_NAME = "qBittorrent"
FLARESOLVERR_PROXY_NAME = "FlareSolverr"


def sleep(seconds: int) -> None:
    logger.info(f"👉 Sleeping for {seconds}s...")
    time.sleep(seconds)


def wait_forever() -> None:
    logger.info("✅ Waiting indefinitely to keep container alive...")
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

        logger.info("👉 Prowlarr API key is not available yet")
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


def same_name(left: Any, right: str) -> bool:
    return isinstance(left, str) and left.lower() == right.lower()


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


def find_indexer_schema(api_key: str, implementation: str) -> dict[str, Any]:
    schemas = prowlarr_request(api_key=api_key, path="/api/v1/indexer/schema", method="GET")
    matching_schemas = [
        schema
        for schema in schemas
        if same_name(schema.get("implementation"), implementation)
        or same_name(schema.get("implementationName"), implementation)
        or same_name(schema.get("name"), implementation)
    ]
    if not matching_schemas:
        raise RuntimeError(f"Could not find indexer schema [{implementation}] in Prowlarr")

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

    logger.info(f"👉 Creating Prowlarr tag [{label}]...")
    created = prowlarr_request(api_key=api_key, path="/api/v1/tag", method="POST", body={"label": label})
    logger.info(f"✅ Created Prowlarr tag [{label}]")
    return int(created["id"])


def upsert_tags(api_key: str, labels: list[str]) -> list[int]:
    return [upsert_tag(api_key, label) for label in labels]


def read_indexer_definitions() -> list[dict[str, Any]]:
    if not PROWLARR_INDEXERS_FILE.exists():
        return []

    indexers = json.loads(PROWLARR_INDEXERS_FILE.read_text(encoding="utf-8"))
    if not isinstance(indexers, list):
        raise RuntimeError("Prowlarr indexer configuration must be a JSON list")

    return indexers


def resolve_field_value(field_config: dict[str, Any]) -> Any:
    if "valueFromEnv" in field_config:
        return get_required_env(str(field_config["valueFromEnv"]))

    if "value" in field_config:
        return field_config["value"]

    raise RuntimeError(f"Indexer field [{field_config.get('name')}] has no value or valueFromEnv")


def remove_non_provisionable_indexer_fields(indexer: dict[str, Any]) -> None:
    indexer["fields"] = [
        field
        for field in indexer.get("fields", [])
        if not str(field.get("name", "")).startswith("info_")
    ]


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
        logger.info("👉 Creating qBittorrent download client in Prowlarr...")
        prowlarr_request(api_key=api_key, path="/api/v1/downloadclient", method="POST", body=client)
        logger.info("✅ Created qBittorrent download client in Prowlarr")
        return

    logger.info("👉 Updating qBittorrent download client in Prowlarr...")
    prowlarr_request(
        api_key=api_key,
        path=f"/api/v1/downloadclient/{current['id']}",
        method="PUT",
        body=client,
    )
    logger.info("✅ Updated qBittorrent download client in Prowlarr")


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
        logger.info("👉 FlareSolverr proxy configuration is disabled")
        return

    tag = get_required_env("FLARESOLVERR_TAG")
    tag_id = upsert_tag(api_key, tag)
    proxies = prowlarr_request(api_key=api_key, path="/api/v1/indexerproxy", method="GET")
    current = next((proxy for proxy in proxies if proxy.get("name") == FLARESOLVERR_PROXY_NAME), None)
    proxy = build_flaresolverr_proxy(api_key, current, tag_id)

    if current is None:
        logger.info("👉 Creating FlareSolverr indexer proxy in Prowlarr...")
        prowlarr_request(api_key=api_key, path="/api/v1/indexerproxy", method="POST", body=proxy)
        logger.info("✅ Created FlareSolverr indexer proxy in Prowlarr")
        return

    logger.info("👉 Updating FlareSolverr indexer proxy in Prowlarr...")
    prowlarr_request(
        api_key=api_key,
        path=f"/api/v1/indexerproxy/{current['id']}",
        method="PUT",
        body=proxy,
    )
    logger.info("✅ Updated FlareSolverr indexer proxy in Prowlarr")


def build_indexer(
    api_key: str,
    current: dict[str, Any] | None,
    indexer_config: dict[str, Any],
) -> dict[str, Any]:
    name = str(indexer_config["name"])
    implementation = str(indexer_config["implementation"])
    indexer = current if current is not None else find_indexer_schema(api_key, implementation)

    indexer["name"] = name
    indexer["enable"] = bool(indexer_config.get("enable", True))
    indexer["protocol"] = indexer_config.get("protocol", indexer.get("protocol", "torrent"))
    indexer["priority"] = int(indexer_config.get("priority", indexer.get("priority", 25)))
    indexer["appProfileId"] = int(indexer_config.get("appProfileId", indexer.get("appProfileId", 1)))
    indexer["enableRss"] = bool(indexer_config.get("enableRss", True))
    indexer["enableAutomaticSearch"] = bool(indexer_config.get("enableAutomaticSearch", True))
    indexer["enableInteractiveSearch"] = bool(indexer_config.get("enableInteractiveSearch", True))
    indexer["tags"] = upsert_tags(api_key, indexer_config.get("tags", []))

    for field_config in indexer_config.get("fields", []):
        set_field(indexer, str(field_config["name"]), resolve_field_value(field_config))

    remove_non_provisionable_indexer_fields(indexer)
    return indexer


def upsert_indexer(api_key: str, indexer_config: dict[str, Any], current_indexers: list[dict[str, Any]]) -> None:
    name = str(indexer_config["name"])
    current = next((indexer for indexer in current_indexers if indexer.get("name") == name), None)
    indexer = build_indexer(api_key, current, indexer_config)

    if current is None:
        logger.info(f"👉 Creating Prowlarr indexer [{name}]...")
        prowlarr_request(api_key=api_key, path="/api/v1/indexer", method="POST", body=indexer)
        logger.info(f"✅ Created Prowlarr indexer [{name}]")
        return

    logger.info(f"👉 Updating Prowlarr indexer [{name}]...")
    prowlarr_request(
        api_key=api_key,
        path=f"/api/v1/indexer/{current['id']}",
        method="PUT",
        body=indexer,
    )
    logger.info(f"✅ Updated Prowlarr indexer [{name}]")


def upsert_indexers(api_key: str) -> None:
    indexer_configs = read_indexer_definitions()
    if not indexer_configs:
        logger.info("👉 No Prowlarr indexers configured")
        return

    current_indexers = prowlarr_request(api_key=api_key, path="/api/v1/indexer", method="GET")
    for indexer_config in indexer_configs:
        upsert_indexer(api_key, indexer_config, current_indexers)


def main() -> None:
    api_key = read_prowlarr_api_key()
    logger.info("✅ Prowlarr API key loaded")

    while True:
        try:
            upsert_qbittorrent_client(api_key)
            upsert_flaresolverr_proxy(api_key)
            upsert_indexers(api_key)
            wait_forever()
        except Exception as error:
            logger.error(f"❌ Failed to configure Prowlarr: {error}")
            sleep(RETRY_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
