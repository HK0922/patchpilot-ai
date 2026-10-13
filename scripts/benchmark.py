"""Compare a single attempt with a retry loop on known, explicitly scripted fixtures."""
from __future__ import annotations

import json
import hashlib
import statistics
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from patchpilot.config import Settings
from patchpilot.engine import Engine
from patchpilot.models import RunRequest
from patchpilot.store import Store, now
from patchpilot.workspace import load_catalog, public_project


def benchmark() -> dict:
    with TemporaryDirectory(prefix="patchpilot-benchmark-") as temp:
        settings = Settings(data_dir=Path(temp))
        projects = load_catalog(settings.fixtures_dir, settings.registered_dir)
        store = Store(Path(temp) / "runs.db")
        engine = Engine(settings, store, projects)
        comparison, runs = [], []
        repairs = [project for project in projects if project["category"] == "repair"]
        for project in repairs:
            variants = []
            for attempts in (1, 3):
                request = RunRequest(project_id=project["id"], max_attempts=attempts)
                created = store.create(request.model_dump(), public_project(project))
                result = engine.execute(created["id"])
                result["experiment"] = "one-shot" if attempts == 1 else "repair-loop"
                # The raw evidence stays intact; only the transient absolute scratch path is made portable.
                portable = json.dumps(result).replace(str(temp), "<benchmark-workspace>")
                result = json.loads(portable)
                runs.append(result)
                variants.append(result)
            first, loop = variants
            comparison.append({"project_id": project["id"], "title": project["title"],
                               "one_shot_success": first["status"] == "awaiting_review",
                               "loop_success": loop["status"] == "awaiting_review",
                               "loop_attempts": loop["attempt"],
                               "one_shot_ms": first["metrics"]["duration_ms"],
                               "loop_ms": loop["metrics"]["duration_ms"],
                               "final_tests": loop["tests"][-1]["tests_run"]})
        probe = next(p for p in projects if p["category"] == "policy")
        created = store.create(RunRequest(project_id=probe["id"]).model_dump(), public_project(probe))
        blocked = engine.execute(created["id"])
        blocked["experiment"] = "policy-probe"
        blocked = json.loads(json.dumps(blocked).replace(str(temp), "<benchmark-workspace>"))
        runs.append(blocked)
        report = {
            "implementation_sha256": hashlib.sha256(b"".join(
                p.relative_to(ROOT).as_posix().encode() + b"\0" + p.read_bytes()
                for p in sorted((ROOT / "patchpilot").glob("*.py"))
            )).hexdigest(),
            "schema_version": 1, "generated_at": now(), "python_version": sys.version.split()[0],
            "mode": "scripted-fixture-evaluation", "model_calls": 0,
            "disclosure": "Known demo recipes, real subprocess tests. This evaluates orchestration and evidence gates, not LLM repair ability or SWE-bench performance. Each variant is executed once per fixture.",
            "summary": {"repair_cases": len(repairs),
                        "one_shot_successes": sum(c["one_shot_success"] for c in comparison),
                        "loop_successes": sum(c["loop_success"] for c in comparison),
                        "loop_median_ms": round(statistics.median(c["loop_ms"] for c in comparison)),
                        "policy_probes": 1, "policy_blocks": int(blocked["status"] == "needs_attention" and not blocked["diff"]),
                        "final_passing_tests": sum(c["final_tests"] for c in comparison)},
            "comparisons": comparison, "projects": [public_project(p) for p in projects], "runs": runs,
        }
        return report


if __name__ == "__main__":
    result = benchmark()
    (ROOT / "benchmarks" / "results.json").write_text(json.dumps(result, indent=2))
    public = ROOT / "web" / "public"
    public.mkdir(parents=True, exist_ok=True)
    (public / "demo-data.json").write_text(json.dumps(result))
    print(json.dumps({"mode": result["mode"], "summary": result["summary"]}, indent=2))
