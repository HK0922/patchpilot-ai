"""Snapshots, atomic edit validation, and immutable existing tests."""
from __future__ import annotations

import ast
import difflib
import hashlib
import json
import os
import re
import shutil
from pathlib import Path, PurePosixPath

from .models import Patch

MAX_FILE_BYTES = 65536
MAX_REPO_BYTES = 512000
MAX_FILES = 60
FORBIDDEN_IMPORTS = {
    "os", "sys", "subprocess", "socket", "http", "urllib", "requests", "httpx",
    "ctypes", "importlib", "shutil", "pickle", "marshal", "multiprocessing",
    "builtins", "resource", "pathlib", "tempfile", "signal", "pty",
}
FORBIDDEN_CALLS = {"eval", "exec", "compile", "__import__", "open", "globals", "locals", "getattr", "setattr", "delattr"}
IGNORED_DIRS = {".git", ".venv", "venv", "node_modules", "__pycache__", ".data", ".pytest_cache"}


class PolicyError(ValueError):
    pass


def safe_relative(path: str) -> str:
    parsed = PurePosixPath(path)
    if (not path or parsed.is_absolute() or ".." in parsed.parts or "\\" in path
            or ":" in path or path != parsed.as_posix() or any(p.startswith(".") for p in parsed.parts)):
        raise PolicyError("Edit paths must be normalized, relative, and inside the snapshot")
    return parsed.as_posix()


def validate_python(source: str, path: str) -> None:
    if len(source.encode()) > MAX_FILE_BYTES:
        raise PolicyError("A proposed file exceeds the 64 KiB limit")
    try:
        tree = ast.parse(source, filename=path)
    except SyntaxError as exc:
        raise PolicyError(f"Invalid Python syntax in {path} at line {exc.lineno}") from exc
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports = [a.name.split(".")[0] for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            imports = [(node.module or "").split(".")[0]]
        else:
            imports = []
        if any(name in FORBIDDEN_IMPORTS for name in imports):
            raise PolicyError(f"Prohibited system or network import in {path}")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FORBIDDEN_CALLS:
            raise PolicyError(f"Prohibited dynamic or file operation in {path}")
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise PolicyError(f"Prohibited reflective attribute in {path}")


def copy_repository(source: Path, dest: Path) -> list[str]:
    """Copy only bounded Python files, excluding secrets and repository metadata."""
    if not source.is_dir():
        raise PolicyError("Repository does not exist")
    staged: list[tuple[str, bytes]] = []
    size = 0
    for directory, dirs, names in os.walk(source, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")
                         and not (Path(directory) / d).is_symlink())
        for name in sorted(names):
            file = Path(directory) / name
            if not name.endswith(".py") or name.startswith("."):
                continue
            if file.is_symlink():
                raise PolicyError("Python symlinks are not supported")
            relative = safe_relative(file.relative_to(source).as_posix())
            if file.stat().st_size > MAX_FILE_BYTES:
                raise PolicyError("Repository contains a Python file larger than 64 KiB")
            data = file.read_bytes()
            data.decode("utf-8")
            size += len(data)
            staged.append((relative, data))
            if size > MAX_REPO_BYTES or len(staged) > MAX_FILES:
                raise PolicyError("Repository exceeds the 500 KiB / 60 Python file snapshot limit")
    if not staged or not any(p.startswith("tests/") and PurePosixPath(p).name.startswith("test") for p, _ in staged):
        raise PolicyError("A Python repository with unittest tests under tests/ is required")
    dest.mkdir(parents=True, exist_ok=False)
    for path, data in staged:
        target = dest / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return [path for path, _ in staged]


def load_catalog(fixtures: Path, registered: Path) -> list[dict]:
    catalog = json.loads((fixtures / "catalog.json").read_text())
    projects = [dict(spec, repo=fixtures / spec.get("fixture", spec["id"]), trusted_demo=True) for spec in catalog]
    if registered.is_dir():
        for config in sorted(registered.glob("*/project.json")):
            spec = json.loads(config.read_text())
            projects.append(dict(spec, repo=config.parent / "repo", trusted_demo=False))
    return projects


def public_project(spec: dict) -> dict:
    return {key: spec[key] for key in ("id", "title", "issue", "tag", "category", "editable_files")} | {
        "demo_available": bool(spec.get("trusted_demo")), "language": "Python"
    }


def register_repository(source: Path, registry: Path, slug: str, title: str, issue: str) -> dict:
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,48}", slug):
        raise PolicyError("Use a lowercase slug with letters, digits, and hyphens")
    dest = registry / slug
    if dest.exists():
        raise PolicyError("This project ID already exists; choose another ID")
    dest.mkdir(parents=True)
    try:
        files = copy_repository(source.resolve(), dest / "repo")
        editable = [p for p in files if p.startswith("src/") and not p.endswith("__init__.py")]
        if not editable:
            raise PolicyError("Put the pure Python code to repair under src/")
        spec = {"id": slug, "title": title, "issue": issue, "tag": "Your repository",
                "category": "registered", "editable_files": editable}
        (dest / "project.json").write_text(json.dumps(spec, indent=2))
        return spec
    except Exception:
        shutil.rmtree(dest)
        raise


class Workspace:
    def __init__(self, root: Path, spec: dict):
        self.root = root
        self.original = root / "original"
        self.repo = root / "repo"
        self.editable = set(spec["editable_files"])
        root.mkdir(parents=True, exist_ok=False)
        self.files = copy_repository(spec["repo"], self.original)
        shutil.copytree(self.original, self.repo)
        self.test_hashes = {p: hashlib.sha256((self.original / p).read_bytes()).hexdigest()
                            for p in self.files if p.startswith("tests/")}

    def context(self) -> dict[str, str]:
        context = {p: (self.repo / p).read_text() for p in self.files if p in self.editable or p.startswith("tests/")}
        if len(json.dumps(context).encode()) > 50000:
            raise PolicyError("Context exceeds the v1 50 KiB limit; use a smaller module snapshot")
        return context

    def check_integrity(self) -> None:
        for path, expected in self.test_hashes.items():
            target = self.repo / path
            if target.is_symlink() or not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != expected:
                raise PolicyError("Existing tests were changed; refusing this run")

    def apply(self, patch: Patch) -> list[str]:
        if not 1 <= len(patch.edits) <= 5:
            raise PolicyError("A patch must contain between one and five source edits")
        proposals: dict[str, str] = {}
        for edit in patch.edits:
            path = safe_relative(edit.path)
            if path not in self.editable:
                raise PolicyError("Only registered source files can be edited; existing tests are immutable")
            target = self.repo / path
            if target.is_symlink() or not target.is_file():
                raise PolicyError("Source target is not a regular existing file")
            source = proposals.get(path, target.read_text())
            if not edit.before or source.count(edit.before) != 1:
                raise PolicyError("Every edit must match exactly one nonempty source span")
            changed = source.replace(edit.before, edit.after, 1)
            if changed == source:
                raise PolicyError("The proposed edit does not change the source")
            validate_python(changed, path)
            proposals[path] = changed
        test_path = safe_relative(patch.regression_test.path)
        if test_path != "tests/test_patchpilot_regression.py":
            raise PolicyError("New regression tests must use tests/test_patchpilot_regression.py")
        if test_path in self.files:
            raise PolicyError("The reserved regression-test name already exists")
        validate_python(patch.regression_test.source, test_path)
        test_tree = ast.parse(patch.regression_test.source)
        if not any(isinstance(node, ast.FunctionDef) and node.name.startswith("test_") for node in ast.walk(test_tree)):
            raise PolicyError("The regression file must contain a test method")
        proposals[test_path] = patch.regression_test.source
        # Validate the entire proposal before writing any file.
        self.check_integrity()
        for path, source in proposals.items():
            target = self.repo / path
            temporary = target.with_suffix(".tmp")
            temporary.write_text(source)
            temporary.replace(target)
        return sorted(proposals)

    def regression_baseline(self) -> Path:
        target = self.root / "regression-baseline"
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(self.original, target)
        shutil.copyfile(self.repo / "tests/test_patchpilot_regression.py", target / "tests/test_patchpilot_regression.py")
        return target

    def diff(self) -> tuple[str, list[str]]:
        paths = sorted(set(self.files) | {p.relative_to(self.repo).as_posix() for p in self.repo.rglob("*.py")})
        output, changed = [], []
        for path in paths:
            original = self.original / path
            current = self.repo / path
            before = original.read_text() if original.is_file() else ""
            after = current.read_text() if current.is_file() else ""
            if before != after:
                changed.append(path)
                output.extend(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                                                  fromfile="a/" + path if original.exists() else "/dev/null",
                                                  tofile="b/" + path))
        return "".join(output), changed
