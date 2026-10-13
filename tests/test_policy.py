from pathlib import Path

import pytest

from patchpilot.models import Edit, Patch
from patchpilot.providers import Budget, DemoProvider
from patchpilot.workspace import PolicyError, Workspace, copy_repository, safe_relative, validate_python


@pytest.mark.parametrize("path", ["/etc/passwd", "../src/a.py", "src/../a.py", "src\\a.py", "C:/test.py", "src//a.py", "./src/a.py", ".env", ""])
def test_path_escape_variants_are_rejected(path):
    with pytest.raises(PolicyError):
        safe_relative(path)


@pytest.mark.parametrize("source", ["import os", "from subprocess import run", "__import__('os')", "eval('2')", "open('/etc/passwd')", "x.__class__", "import socket"])
def test_unsafe_source_is_rejected(source):
    with pytest.raises(PolicyError):
        validate_python(source, "src/example.py")


def proposal_and_workspace(context):
    settings, projects, _, _ = context
    spec = projects[0]
    workspace = Workspace(settings.data_dir / "policy-work", spec)
    patch = DemoProvider(spec).call("implementer", {"attempt": 1, "files": workspace.context()}, Budget(30000, 10))
    return workspace, patch


def test_edit_validation_is_atomic(context):
    workspace, patch = proposal_and_workspace(context)
    original = (workspace.repo / "src/pagination.py").read_text()
    patch.edits.append(Edit(path="tests/test_behavior.py", before="x", after="y"))
    with pytest.raises(PolicyError):
        workspace.apply(patch)
    assert (workspace.repo / "src/pagination.py").read_text() == original
    assert not (workspace.repo / "tests/test_patchpilot_regression.py").exists()


def test_ambiguous_edit_is_rejected(context):
    workspace, patch = proposal_and_workspace(context)
    patch.edits[0].before = "page"
    with pytest.raises(PolicyError, match="exactly one"):
        workspace.apply(patch)


def test_changed_existing_tests_are_detected(context):
    workspace, patch = proposal_and_workspace(context)
    (workspace.repo / "tests/test_behavior.py").write_text("# weakened tests")
    with pytest.raises(PolicyError, match="Existing tests"):
        workspace.apply(patch)


def test_noop_patch_is_rejected(context):
    workspace, patch = proposal_and_workspace(context)
    patch.edits[0].after = patch.edits[0].before
    with pytest.raises(PolicyError, match="does not change"):
        workspace.apply(patch)


def test_regression_cannot_overwrite_an_existing_test(context):
    workspace, patch = proposal_and_workspace(context)
    patch.regression_test.path = "tests/test_behavior.py"
    with pytest.raises(PolicyError, match="regression tests"):
        workspace.apply(patch)


def test_regression_requires_a_test_method(context):
    workspace, patch = proposal_and_workspace(context)
    patch.regression_test.source = "import unittest\n"
    with pytest.raises(PolicyError, match="test method"):
        workspace.apply(patch)


def test_snapshot_skips_secrets_and_git_metadata(tmp_path):
    source = tmp_path / "source"
    (source / "src").mkdir(parents=True)
    (source / "tests").mkdir()
    (source / ".git").mkdir()
    (source / "src/foo.py").write_text("def f(): return 1\n")
    (source / "tests/test_foo.py").write_text("import unittest\n")
    (source / ".env").write_text("TOP_SECRET=not-to-be-copied")
    (source / ".git/config.py").write_text("SECRET = 1")
    copy_repository(source, tmp_path / "snapshot")
    assert not (tmp_path / "snapshot/.env").exists()
    assert not (tmp_path / "snapshot/.git").exists()


def test_python_symlink_is_rejected(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    target = tmp_path / "outside.py"
    target.write_text("secret = 1")
    (source / "link.py").symlink_to(target)
    with pytest.raises(PolicyError, match="symlinks"):
        copy_repository(source, tmp_path / "snapshot")


def test_huge_python_files_are_rejected(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "huge.py").write_text("#" * 65537)
    with pytest.raises(PolicyError, match="64 KiB"):
        copy_repository(source, tmp_path / "snapshot")
