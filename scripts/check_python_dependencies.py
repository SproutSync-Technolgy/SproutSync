"""Inspect installed project requirements without importing app settings or using the network."""

import importlib
import json
import sys
from importlib import metadata
from pathlib import Path


def inspect_dependencies(root: Path) -> dict:
    if sys.version_info < (3, 12):
        return {
            "ready": False,
            "packages": [],
            "problems": ["Python 3.12 or newer is required."],
            "repair": [],
        }
    import tomllib

    try:
        from packaging.requirements import Requirement
        from packaging.utils import canonicalize_name
    except ImportError:
        from pip._vendor.packaging.requirements import Requirement
        from pip._vendor.packaging.utils import canonicalize_name

    project = tomllib.loads(
        (root / "backend/api/pyproject.toml").read_text(encoding="utf-8")
    )["project"]
    required = (
        project["dependencies"]
        + project["optional-dependencies"]["dev"]
        + project["optional-dependencies"]["tools"]
    )
    pending = [Requirement(value) for value in required]
    packages = {}
    checked = set()
    problems = []
    repair = []
    while pending:
        requirement = pending.pop(0)
        name = canonicalize_name(requirement.name)
        key = (name, str(requirement.specifier), tuple(sorted(requirement.extras)))
        if key in checked:
            continue
        checked.add(key)
        try:
            distribution = metadata.distribution(name)
            installed = distribution.version
            status = (
                "OK"
                if requirement.specifier.contains(installed, prereleases=True)
                else "WRONG VERSION"
            )
        except metadata.PackageNotFoundError:
            distribution = None
            installed, status = None, "MISSING"
        previous = packages.get(name)
        if previous is None or status != "OK":
            packages[name] = {
                "name": name,
                "expected": str(requirement.specifier) or "required",
                "installed": installed,
                "status": status,
            }
        if distribution:
            for value in distribution.requires or []:
                dependency = Requirement(value)
                if dependency.marker is None or any(
                    dependency.marker.evaluate({"extra": extra})
                    for extra in (requirement.extras or {""})
                ):
                    pending.append(dependency)

    try:
        distribution = metadata.distribution("sproutsync-api")
        direct = json.loads(distribution.read_text("direct_url.json") or "{}")
        editable = (
            direct.get("dir_info", {}).get("editable")
            and direct.get("url", "").rstrip("/").casefold()
            == (root / "backend/api").as_uri().rstrip("/").casefold()
        )
        packages["sproutsync-api"] = {
            "name": "sproutsync-api",
            "expected": "editable project",
            "installed": distribution.version,
            "status": "OK" if editable else "WRONG LOCATION",
        }
    except metadata.PackageNotFoundError:
        packages["sproutsync-api"] = {
            "name": "sproutsync-api",
            "expected": "editable project",
            "installed": None,
            "status": "MISSING",
        }

    # Metadata can remain after a package directory has been deleted or damaged.
    modules = {
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "alembic": "alembic",
        "psycopg": "psycopg",
        "pydantic-settings": "pydantic_settings",
        "sqlalchemy": "sqlalchemy",
        "paho-mqtt": "paho.mqtt.client",
        "httpx": "httpx",
        "python-dotenv": "dotenv",
        "pytest": "pytest",
        "ruff": "ruff",
        "pillow": "PIL",
        "zeroconf": "zeroconf",
    }
    for name, module in modules.items():
        if packages.get(name, {}).get("status") != "OK":
            continue
        try:
            importlib.import_module(module)
        except Exception as error:  # noqa: BLE001 - broken imports must produce a usable dependency report.
            packages[name]["status"] = "BROKEN"
            repair.append(f"{name}=={packages[name]['installed']}")
            problems.append(f"Cannot import {module} ({type(error).__name__}).")
    rows = sorted(packages.values(), key=lambda row: row["name"])
    return {
        "ready": not problems and all(row["status"] == "OK" for row in rows),
        "packages": rows,
        "problems": problems,
        "repair": repair,
    }


if __name__ == "__main__":
    try:
        report = inspect_dependencies(Path(__file__).resolve().parents[1])
    except Exception as error:  # noqa: BLE001 - keep the CLI error contract free of environment values.
        report = {
            "ready": False,
            "packages": [],
            "problems": [
                f"Dependency inspection failed ({type(error).__name__}). Check Python/pip and project files."
            ],
            "repair": [],
        }
    print(json.dumps(report))
    raise SystemExit(0 if report["ready"] else 1)
