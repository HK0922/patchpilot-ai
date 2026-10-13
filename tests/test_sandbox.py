from dataclasses import replace
import subprocess
import sys
import io
import os

import pytest

from patchpilot.sandbox import SandboxError, TestRunner


def test_timeout_stops_a_hung_test_and_does_not_report_success(context, tmp_path):
    repo = tmp_path / "hung"
    (repo / "tests").mkdir(parents=True)
    (repo / "tests/__init__.py").write_text("")
    (repo / "tests/test_hung.py").write_text("import unittest\nclass Hang(unittest.TestCase):\n    def test_hang(self):\n        while True: pass\n")
    runner = TestRunner(context[0], "demo", True)
    result = runner.run(repo, "Hung test", timeout=0.15)
    assert result.timed_out and not result.passed
    assert result.duration_ms < 2000


def test_zero_discovered_tests_are_not_a_passing_suite(context, tmp_path):
    repo = tmp_path / "empty"
    (repo / "tests").mkdir(parents=True)
    (repo / "tests/__init__.py").write_text("")
    runner = TestRunner(context[0], "demo", True)
    result = runner.run(repo, "Empty tests")
    assert result.tests_run == 0 and not result.passed


def test_registered_repositories_cannot_use_the_local_fixture_runner(context, monkeypatch):
    monkeypatch.setattr("patchpilot.sandbox.docker_available", lambda image: False)
    with pytest.raises(SandboxError, match="Docker"):
        TestRunner(context[0], "demo", False)


def test_live_code_cannot_silently_fall_back_to_subprocess(context, monkeypatch):
    monkeypatch.setattr("patchpilot.sandbox.docker_available", lambda image: False)
    with pytest.raises(SandboxError, match="Docker"):
        TestRunner(context[0], "openai", True)


def test_fixture_subprocess_environment_excludes_api_keys(context, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sentinel-key")
    monkeypatch.setenv("PATCHPILOT_API_TOKEN", "sentinel-token")
    seen = []
    original = subprocess.Popen
    def capture(command, **kwargs):
        seen.append(kwargs["env"])
        return original(command, **kwargs)
    monkeypatch.setattr("patchpilot.sandbox.subprocess.Popen", capture)
    project = context[1][0]
    result = TestRunner(context[0], "demo", True).run(project["repo"], "Baseline")
    assert result.tests_run == 6
    assert "OPENAI_API_KEY" not in seen[0]
    assert "PATCHPILOT_API_TOKEN" not in seen[0]


def test_docker_invocation_has_live_isolation_and_no_forwarded_secrets(context, monkeypatch):
    seen = []
    monkeypatch.setattr("patchpilot.sandbox.docker_available", lambda image: True)
    class CompletedProcess:
        returncode = 0
        pid = 12345
        def __init__(self, command, **kwargs):
            seen.append(command)
            self.stdout = io.BytesIO(b'PATCHPILOT_RESULT={"tests_run":1,"failures":0,"errors":0,"passed":true}\n')
        def poll(self): return 0
        def wait(self, **kwargs): return 0
    monkeypatch.setattr("patchpilot.sandbox.subprocess.Popen", CompletedProcess)
    result = TestRunner(context[0], "openai", True).run(context[1][0]["repo"], "Live invocation")
    assert result.passed and result.runner == "docker"
    for flag in ["--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--memory=256m", "--pids-limit=64", "--pull=never", "--user=65534:65534"]:
        assert flag in seen[0]
    assert "readonly" in seen[0][seen[0].index("--mount") + 1]
    assert not any(argument.startswith("--env") for argument in seen[0])


@pytest.mark.skipif(os.getenv("PATCHPILOT_DOCKER_INTEGRATION") != "1", reason="Enable on a Docker-capable machine")
def test_real_docker_executes_baseline_and_repaired_fixture(context, tmp_path):
    from patchpilot.providers import Budget, DemoProvider
    from patchpilot.workspace import Workspace
    spec = context[1][0]
    workspace = Workspace(tmp_path / "docker-run", spec)
    runner = TestRunner(context[0], "openai", True)
    baseline = runner.run(workspace.repo, "Docker baseline")
    assert baseline.tests_run == 6 and not baseline.passed
    patch = DemoProvider(spec).call("implementer", {"attempt": 1, "files": workspace.context()}, Budget(30000, 60))
    workspace.apply(patch)
    repaired = runner.run(workspace.repo, "Docker repaired")
    assert repaired.passed and repaired.tests_run == 7
