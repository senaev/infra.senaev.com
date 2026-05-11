import argparse
import json
import os
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


DEFAULT_PROWLARR_CONFIG_FILE = Path("/config/config.xml")


def request_text(
    *,
    url: str,
    method: str,
    headers: dict[str, str] | None = None,
) -> str:
    request = urllib.request.Request(url, headers=headers or {}, method=method)

    try:
        with urllib.request.urlopen(request) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with status {error.code}: {response_body}") from error


def prowlarr_request(*, base_url: str, api_key: str, path: str) -> Any:
    response_text = request_text(
        url=f"{base_url.rstrip('/')}{path}",
        method="GET",
        headers={"X-Api-Key": api_key},
    )
    return json.loads(response_text) if response_text else None


def read_api_key(config_file: Path) -> str:
    root = ET.fromstring(config_file.read_text(encoding="utf-8"))
    api_key = root.findtext("ApiKey")
    if not api_key:
        raise RuntimeError(f"Could not find ApiKey in {config_file}")

    return api_key


def quote_yaml_string(value: str) -> str:
    return json.dumps(value)


def yaml_scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return str(value)
    if value is None:
        return '""'

    return quote_yaml_string(str(value))


def value_is_empty(value: Any) -> bool:
    return value is None or value == "" or value == []


def tag_label_by_id(tags: list[dict[str, Any]]) -> dict[int, str]:
    return {int(tag["id"]): str(tag["label"]) for tag in tags}


def export_indexer(
    *,
    indexer: dict[str, Any],
    tags_by_id: dict[int, str],
) -> list[str]:
    implementation = indexer.get("implementation") or indexer.get("implementationName") or indexer.get("name")
    lines = [
        f"    - name: {yaml_scalar(indexer['name'])}",
        f"      implementation: {yaml_scalar(implementation)}",
    ]

    for key in [
        "enable",
        "protocol",
        "priority",
        "appProfileId",
        "enableRss",
        "enableAutomaticSearch",
        "enableInteractiveSearch",
    ]:
        if key in indexer:
            lines.append(f"      {key}: {yaml_scalar(indexer[key])}")

    tag_labels = [tags_by_id[tag_id] for tag_id in indexer.get("tags", []) if tag_id in tags_by_id]
    if tag_labels:
        lines.append("      tags:")
        for tag in tag_labels:
            lines.append(f"        - {yaml_scalar(tag)}")

    fields = []
    for field in indexer.get("fields", []):
        value = field.get("value")
        if value_is_empty(value):
            continue

        field_name = str(field["name"])
        field_lines = [f"        - name: {yaml_scalar(field_name)}"]
        field_lines.append(f"          value: {yaml_scalar(value)}")

        fields.extend(field_lines)

    if fields:
        lines.append("      fields:")
        lines.extend(fields)

    return lines


def export_values_yaml(*, base_url: str, api_key: str) -> str:
    indexers = prowlarr_request(base_url=base_url, api_key=api_key, path="/api/v1/indexer")
    tags = prowlarr_request(base_url=base_url, api_key=api_key, path="/api/v1/tag")
    tags_by_id = tag_label_by_id(tags)

    indexer_lines = []
    for indexer in sorted(indexers, key=lambda item: str(item.get("name", "")).lower()):
        indexer_lines.extend(export_indexer(indexer=indexer, tags_by_id=tags_by_id))

    lines = ["  indexers:"]
    lines.extend(indexer_lines or ["    []"])
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export live Prowlarr indexers as a values.yaml snippet.",
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("PROWLARR_URL", "http://127.0.0.1:9696"),
        help="Prowlarr base URL. Defaults to PROWLARR_URL or http://127.0.0.1:9696.",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("PROWLARR_API_KEY"),
        help="Prowlarr API key. Defaults to PROWLARR_API_KEY.",
    )
    parser.add_argument(
        "--config-file",
        default=os.environ.get("PROWLARR_CONFIG_FILE", str(DEFAULT_PROWLARR_CONFIG_FILE)),
        help="Prowlarr config.xml path used to read ApiKey when --api-key is omitted.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    api_key = args.api_key or read_api_key(Path(args.config_file))
    print(export_values_yaml(base_url=args.url, api_key=api_key))


if __name__ == "__main__":
    main()
