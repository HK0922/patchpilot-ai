"""No model-selected commands. Live code executes only in a constrained Docker image."""
from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Callable

from .config import Settings
from .models import TestResult

OUTPUT_LIMIT = 65536


class SandboxError(RuntimeError):
    pass


def docker_available(image: str) -> bool:
    if not shutil.which("docker"):
        return False
    try:
        result = subprocess.run(["docker", "image", "inspect", image], stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, timeout=5, check=False)
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


class TestRunner:
    __test__ = False

    def __init__(self, settings: Settings, mode: str, trusted_demo: bool):
        self.settings = settings
        self.local = mode == "demo" and trusted_demo
        if not self.local and not docker_available(settings.sandbox_image):
            raise SandboxError("Live runs require Docker and the prebuilt PatchPilot sandbox image. See docs/SETUP.md.")

    def run(self, repo: Path, phase: str, regression_only: bool = False,
            cancelled: Callable[[], bool] | None = None, timeout: float | None = None) -> TestResult:
        pattern = "test_patchpilot_regression.py" if regression_only else "test*.py"
        name = None
        if self.local:
            command = [sys.executable, "-I", str(Path(__file__).with_name("_test_harness.py")), str(repo), pattern]
            environment = {key: value for key, value in os.environ.items() if key in {"PATH", "SYSTEMROOT", "WINDIR", "LANG"}}
            environment.update(PYTHONDONTWRITEBYTECODE="1", PYTHONHASHSEED="0")
        else:
            name = "patchpilot-" + uuid.uuid4().hex
            command = ["docker", "run", "--rm", "--pull=never", "--name", name,
                       "--network=none", "--read-only", "--cap-drop=ALL",
                       "--security-opt=no-new-privileges", "--user=65534:65534",
                       "--memory=256m", "--memory-swap=256m", "--cpus=1", "--pids-limit=64",
                       "--tmpfs=/tmp:rw,noexec,nosuid,size=16m",
                       "--mount", f"type=bind,src={repo.resolve()},dst=/repo,readonly",
                       self.settings.sandbox_image, "/repo", pattern]
            environment = os.environ.copy()  # Docker CLI; nothing is forwarded to the container.
        started = time.monotonic()
        output, exceeded = bytearray(), threading.Event()
        process = subprocess.Popen(command, cwd=repo, env=environment, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, start_new_session=os.name == "posix")

        def reader() -> None:
            assert process.stdout is not None
            while block := process.stdout.read(4096):
                available = OUTPUT_LIMIT - len(output)
                output.extend(block[:max(available, 0)])
                if len(block) > available:
                    exceeded.set()
                    break

        thread = threading.Thread(target=reader, daemon=True)
        thread.start()
        timed_out = False
        cancelled_run = False
        duration_limit = min(self.settings.test_timeout, timeout) if timeout is not None else self.settings.test_timeout
        try:
            while process.poll() is None:
                cancelled_run = bool(cancelled and cancelled())
                timed_out = time.monotonic() - started >= duration_limit
                if timed_out or exceeded.is_set() or cancelled_run:
                    if os.name == "posix":
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    else:
                        process.kill()
                    break
                time.sleep(0.02)
            process.wait(timeout=5)
            thread.join(timeout=2)
        finally:
            if name and (timed_out or exceeded.is_set() or cancelled_run):
                subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=5, check=False)
            if process.stdout is not None:
                process.stdout.close()
        text = output.decode("utf-8", errors="replace")
        if exceeded.is_set():
            text += "\n[Output limit exceeded; process stopped.]"
        if timed_out:
            text += "\n[Test timeout; process stopped.]"
        if cancelled_run:
            text += "\n[Run cancelled; process stopped.]"
        reports = re.findall(r"^PATCHPILOT_RESULT=(.+)$", text, flags=re.MULTILINE)
        report = {"tests_run": 0, "failures": 0, "errors": 1, "passed": False}
        if reports:
            try:
                report = json.loads(reports[-1])
            except json.JSONDecodeError:
                pass
        passed = bool(report.get("passed") and process.returncode == 0 and not timed_out
                      and not exceeded.is_set() and not cancelled_run and report.get("tests_run", 0) > 0)
        return TestResult(phase=phase, passed=passed, returncode=process.returncode,
                          duration_ms=round((time.monotonic() - started) * 1000),
                          tests_run=report.get("tests_run", 0), failures=report.get("failures", 0),
                          errors=report.get("errors", 0), output=text, timed_out=timed_out,
                          runner="trusted-fixture-subprocess" if self.local else "docker")
