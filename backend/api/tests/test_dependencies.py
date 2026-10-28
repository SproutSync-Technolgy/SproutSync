"""Dependency inspection distinguishes ready, missing, outdated, and broken packages."""

import importlib.util
import json
from importlib.metadata import PackageNotFoundError
from pathlib import Path
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location(
    "dependency_check",
    Path(__file__).resolve().parents[3] / "scripts/check_python_dependencies.py",
)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


@pytest.fixture
def dependency_tree(tmp_path, monkeypatch):
    api = tmp_path / "backend/api"
    api.mkdir(parents=True)
    (api / "pyproject.toml").write_text(
        """[project]
dependencies = ["example[feature]>=1,<2"]
[project.optional-dependencies]
dev = []
tools = []
""",
        encoding="utf-8",
    )
    distributions = {
        "example": SimpleNamespace(
            version="1.5.0",
            requires=['child>=2; extra == "feature"', 'ignored; python_version < "2"'],
        ),
        "child": SimpleNamespace(version="2.1.0", requires=[]),
        "sproutsync-api": SimpleNamespace(
            version="0.1.0",
            read_text=lambda _file: json.dumps(
                {"url": api.as_uri(), "dir_info": {"editable": True}}
            ),
        ),
    }

    def distribution(name):
        if name not in distributions:
            raise PackageNotFoundError(name)
        return distributions[name]

    monkeypatch.setattr(checker.metadata, "distribution", distribution)
    return tmp_path, distributions


def test_complete_dependency_tree_is_ready_including_extras(dependency_tree):
    root, _ = dependency_tree
    result = checker.inspect_dependencies(root)
    assert result["ready"]
    assert {p["name"] for p in result["packages"]} == {
        "example",
        "child",
        "sproutsync-api",
    }


def test_missing_transitive_dependency_requires_installation(dependency_tree):
    root, distributions = dependency_tree
    del distributions["child"]
    result = checker.inspect_dependencies(root)
    assert not result["ready"]
    assert (
        next(p for p in result["packages"] if p["name"] == "child")["status"]
        == "MISSING"
    )


def test_outdated_dependency_requires_installation(dependency_tree):
    root, distributions = dependency_tree
    distributions["example"].version = "2.0.0"
    result = checker.inspect_dependencies(root)
    assert not result["ready"]
    assert (
        next(p for p in result["packages"] if p["name"] == "example")["status"]
        == "WRONG VERSION"
    )


def test_editable_install_from_other_checkout_is_not_reused(dependency_tree):
    root, distributions = dependency_tree
    distributions["sproutsync-api"].read_text = lambda _file: json.dumps(
        {"url": "file:///different-checkout", "dir_info": {"editable": True}}
    )
    result = checker.inspect_dependencies(root)
    assert not result["ready"]
    assert (
        next(p for p in result["packages"] if p["name"] == "sproutsync-api")["status"]
        == "WRONG LOCATION"
    )
