"""Versions that are pinned in more than one file must say the same thing."""

import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # apps/api
REPOSITORY = ROOT.parents[1]  # the monorepo root, where GitHub reads .github/
WORKFLOW_PIN = r'^  UV_VERSION: "(?P<version>[\d.]+)"'


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def pinned(name: str, pattern: str, base: Path = ROOT) -> str:
    match = re.search(pattern, (base / name).read_text(encoding="utf-8"), re.MULTILINE)
    assert match, f"{name} no longer pins uv in the form {pattern!r}"
    return match["version"]


def test_the_uv_version_is_the_same_in_the_dockerfile_and_every_workflow_that_pins_it() -> None:
    """Dependabot's docker ecosystem bumps only the Dockerfile, so drift shows up here."""
    versions = {"apps/api/Dockerfile": pinned("Dockerfile", r"^FROM ghcr\.io/astral-sh/uv:(?P<version>[\d.]+) ")}
    for workflow in sorted((REPOSITORY / ".github" / "workflows").glob("*.yml")):
        if re.search(r"^  UV_VERSION:", workflow.read_text(encoding="utf-8"), re.MULTILINE):
            name = workflow.relative_to(REPOSITORY).as_posix()
            versions[name] = pinned(name, WORKFLOW_PIN, REPOSITORY)

    assert ".github/workflows/ci.yml" in versions, versions
    assert len(set(versions.values())) == 1, versions


def test_the_adapter_contract_lists_every_module_that_must_not_import_the_adapter() -> None:
    """A source that contains the forbidden module finds nothing, so the contract lists modules one by one.

    A new module that is neither listed nor one of the two entry points would be free to import Docling.
    """
    contracts = tomllib.loads(read("pyproject.toml"))["tool"]["importlinter"]["contracts"]
    [contract] = [c for c in contracts if c.get("forbidden_modules") == ["formlens.parsing.docling_parser"]]
    package = ROOT / "src" / "formlens"
    units = set()
    for path in package.rglob("*.py"):
        parts = path.relative_to(package).with_suffix("").parts
        if parts[-1] == "__init__":
            parts = parts[:-1]
        if parts:  # the root package itself is not a module to list
            units.add("formlens." + ".".join(parts[:2] if parts[0] == "parsing" else parts[:1]))
    left_out = {"formlens.main", "formlens.__main__", "formlens.parsing", "formlens.parsing.docling_parser"}

    assert units - left_out == set(contract["source_modules"])
