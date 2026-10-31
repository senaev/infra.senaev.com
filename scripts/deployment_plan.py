"""Discover service images and charts affected since the last successful deployment."""
import json
import re
import subprocess
import sys
from pathlib import Path

PIPELINE_FILES = {
    ".github/workflows/deploy.yml", ".github/workflows/build-service.yml",
    ".github/deploy-config.json", "scripts/deployment_plan.py",
}
SHARED_CHART_FILES = {
    "provisioning/helm/common-values.yaml",
    "provisioning/control-plane/upgrade-namespace.sh",
}


def identifier(value):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", value):
        raise ValueError(f"Invalid deployment identifier: {value}")
    return value


def plan(root, changed, repository):
    config = json.loads((root / ".github/deploy-config.json").read_text())
    charts = {identifier(p.parent.name) for p in (root / "provisioning/helm").glob("*/Chart.yaml")}
    full = changed is None or bool(set(changed) & PIPELINE_FILES)
    selected_charts = set(charts) if full or bool(set(changed or []) & SHARED_CHART_FILES) else {
        name for name in charts if any(p.startswith(f"provisioning/helm/{name}/") for p in changed)
    }
    builds = []
    for dockerfile in sorted(root.glob("*/Dockerfile")):
        name = identifier(dockerfile.parent.name)
        options = config["services"].get(name, {})
        chart = identifier(options.get("chart", "senaev-com"))
        if chart not in charts:
            raise ValueError(f"Service {name} references missing chart {chart}")
        paths = [f"{name}/", *options.get("paths", [])]
        package = dockerfile.parent / "package.json"
        if package.exists() and "senaev-utils" in json.loads(package.read_text()).get("dependencies", {}):
            paths.append("senaev-utils/")
        if not full and not any(p == ".dockerignore" or any(p.startswith(prefix) for prefix in paths) for p in changed):
            continue
        image = options.get("repository", f"ghcr.io/{repository.split('/')[0].lower()}/{name}")
        if not re.fullmatch(r"ghcr\.io/[a-z0-9._/-]+", image):
            raise ValueError(f"Invalid image repository: {image}")
        context = options.get("context", ".")
        if context != "." and context != name:
            raise ValueError(f"Service {name} context must be '.' or its service directory")
        builds.append({"name": name, "context": context, "dockerfile": f"{name}/Dockerfile", "repository": image})
        selected_charts.add(chart)
    return {
        "builds": builds,
        "charts": [{"chart": name, "namespace": identifier(config["namespaces"].get(name, name))} for name in sorted(selected_charts)],
    }


def main():
    base, repository = sys.argv[1:]
    changed = None
    if base and subprocess.run(["git", "cat-file", "-e", f"{base}^{{commit}}"], capture_output=True).returncode == 0:
        changed = subprocess.check_output(["git", "diff", "--no-renames", "--name-only", "-z", base, "HEAD"]).decode().split("\0")[:-1]
    print(json.dumps(plan(Path.cwd(), changed, repository), separators=(",", ":")))


if __name__ == "__main__":
    main()
