"""Validate portable repair requests without executing uploaded Python."""
from __future__ import annotations

import json
import tempfile
import shutil
from pathlib import Path

from .models import RepairRequest
from .workspace import MAX_FILES, MAX_REPO_BYTES, PolicyError, register_repository, safe_relative, validate_python

MAX_REQUEST_BYTES = 600_000


def prepare_request(body: RepairRequest) -> tuple[dict[str, str], str]:
    if len(body.title.strip()) < 3 or len(body.issue.strip()) < 10:
        raise PolicyError("Add a nonempty title and a reproducible issue description")
    files = dict(body.files)
    size = 0
    for path, source in files.items():
        safe_relative(path)
        if not path.endswith(".py") or not path.startswith(("src/", "tests/")):
            raise PolicyError("Include only Python files under src/ and tests/")
        if path == "tests/test_patchpilot_regression.py":
            raise PolicyError("The regression-test filename is reserved for the repair agent")
        validate_python(source, path)
        size += len(source.encode("utf-8"))
    if size > MAX_REPO_BYTES:
        raise PolicyError("Repository exceeds the 500 KiB snapshot limit")
    if not any(path.startswith("tests/") and Path(path).name.startswith("test")
               and Path(path).name != "test_patchpilot_regression.py" for path in files):
        raise PolicyError("Include unittest tests under tests/test*.py")
    if len(body.editable_files) != len(set(body.editable_files)):
        raise PolicyError("Edit scope contains duplicate paths")
    for path in body.editable_files:
        if path not in files or not path.startswith("src/") or path.endswith("__init__.py"):
            raise PolicyError("Edit scope must select existing source modules under src/")
    # Discovery needs packages. Do not replace uploaded initializers.
    for path in list(files):
        parent = Path(path).parent
        while parent.as_posix() != ".":
            files.setdefault((parent / "__init__.py").as_posix(), "")
            parent = parent.parent
    if len(files) > MAX_FILES:
        raise PolicyError("Snapshot exceeds the 60-file limit including package initializers")
    context = {path: source for path, source in files.items()
               if path in body.editable_files or path.startswith("tests/")}
    if len(json.dumps(context).encode()) > 50_000:
        raise PolicyError("Source and tests exceed the 50 KiB model-context limit; select a smaller module")
    criteria = [criterion.strip() for criterion in body.acceptance_criteria]
    if any(not criterion or len(criterion) > 240 for criterion in criteria):
        raise PolicyError("Use 1–12 nonempty acceptance criteria, each at most 240 characters")
    issue = body.issue.strip() + "\n\nAcceptance criteria:\n" + "\n".join("- " + item for item in criteria)
    if len(issue) > 4000:
        raise PolicyError("Issue and acceptance criteria together exceed 4,000 characters")
    return files, issue


def import_request(body: RepairRequest, registry: Path, reserved: set[str]) -> dict:
    files, issue = prepare_request(body)
    if body.project_id in reserved or (registry / body.project_id).exists():
        raise FileExistsError("This project ID already exists; choose another ID")
    registry.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".intake-", dir=registry) as stage:
        for path, source in files.items():
            target = Path(stage) / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(source, encoding="utf-8")
        spec = register_repository(Path(stage), registry, body.project_id, body.title.strip(), issue)
    spec.update(editable_files=body.editable_files, acceptance_criteria=body.acceptance_criteria,
                priority=body.priority, max_attempts=body.max_attempts, token_budget=body.token_budget)
    try:
        temporary = registry / body.project_id / "project.tmp"
        temporary.write_text(json.dumps(spec, indent=2))
        temporary.replace(registry / body.project_id / "project.json")
    except OSError:
        shutil.rmtree(registry / body.project_id)
        raise
    return dict(spec, repo=registry / body.project_id / "repo", trusted_demo=False)
