import hashlib
import json

import pytest

from patchpilot.engine import Engine
from patchpilot.models import RunRequest
from patchpilot.providers import DemoProvider
from patchpilot.store import Conflict, Store
from patchpilot.workspace import public_project


def create(context, project_id="pagination", max_attempts=3):
    _, projects, store, engine = context
    project = next(p for p in projects if p["id"] == project_id)
    run = store.create(RunRequest(project_id=project_id, max_attempts=max_attempts).model_dump(), public_project(project))
    return project, run


@pytest.mark.parametrize("project_id,attempts", [("pagination", 1), ("invoice", 2), ("appointments", 1), ("slug", 1)])
def test_repairs_have_before_after_evidence_and_leave_original_untouched(context, project_id, attempts):
    _, _, store, engine = context
    project, run = create(context, project_id)
    before = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in project["repo"].rglob("*.py")}
    result = engine.execute(run["id"])
    assert result["status"] == "awaiting_review", result["error"]
    assert result["attempt"] == attempts
    assert result["regression_verified"]
    assert result["tests"][-1]["passed"]
    assert result["tests"][-1]["tests_run"] == 7
    assert result["tests"][0]["failures"] > 0
    assert result["review"]["verdict"] == "approve"
    assert result["decision"] is None
    assert result["metrics"]["model_calls"] == 0
    assert result["metrics"]["total_tokens"] == 0
    assert before == {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in project["repo"].rglob("*.py")}
    assert len(result["files_changed"]) == 2


def test_budget_failure_does_not_claim_verified_success(context):
    _, _, _, engine = context
    _, run = create(context, "invoice", 1)
    result = engine.execute(run["id"])
    assert result["status"] == "needs_attention"
    assert result["tests"][-1]["failures"] > 0
    assert result["review"] is None
    assert "Attempt limit" in result["error"]


def test_prohibited_edit_stops_before_application(context):
    _, _, _, engine = context
    _, run = create(context, "guardrail-probe")
    result = engine.execute(run["id"])
    assert result["status"] == "needs_attention"
    assert result["diff"] == ""
    assert len(result["tests"]) == 1
    assert "Prohibited" in result["error"]


def test_queued_cancellation_stops_without_a_workspace(context):
    settings, _, store, engine = context
    _, run = create(context)
    store.cancel(run["id"])
    result = engine.execute(run["id"])
    assert result["status"] == "cancelled"
    assert not (settings.data_dir / "runs" / run["id"]).exists()


def test_cancellation_after_model_proposal_stops_before_write(context):
    settings, _, store, engine = context
    project, run = create(context)
    class CancelProvider(DemoProvider):
        def call(self, role, context, budget):
            response = super().call(role, context, budget)
            if role == "implementer":
                store.cancel(run["id"])
            return response
    result = engine.execute(run["id"], CancelProvider(project))
    assert result["status"] == "cancelled"
    assert result["diff"] == ""


def test_human_decision_is_persisted_and_cannot_be_repeated(context):
    _, _, store, engine = context
    _, run = create(context)
    with pytest.raises(Conflict):
        store.decide(run["id"], "approve", "too early")
    engine.execute(run["id"])
    result = store.decide(run["id"], "approve", "Verified slice boundaries and regression")
    assert result["status"] == "approved"
    assert result["decision"]["note"] == "Verified slice boundaries and regression"
    with pytest.raises(Conflict):
        store.decide(run["id"], "reject", "changed mind")
    assert Store(store.path).get(run["id"])["status"] == "approved"


def test_rejected_patches_remain_available_for_inspection(context):
    _, _, store, engine = context
    _, run = create(context)
    engine.execute(run["id"])
    result = store.decide(run["id"], "reject", "Need broader integration coverage")
    assert result["status"] == "rejected"
    assert result["diff"]


def test_restart_preserves_events_and_marks_unfinished_runs(context):
    _, _, store, _ = context
    _, run = create(context)
    store.update(run["id"], status="running")
    first = store.event(run["id"], "system", "baseline", "Started")
    assert store.recover() == 1
    recovered = store.get(run["id"])
    assert recovered["status"] == "interrupted"
    assert recovered["events"][0]["sequence"] == first["sequence"]
    assert store.recover() == 0


def test_events_are_ordered_and_cursor_resumption_does_not_duplicate(context):
    _, _, store, _ = context
    _, run = create(context)
    first = store.event(run["id"], "planner", "plan", "A")
    second = store.event(run["id"], "implementer", "patch", "B")
    assert store.events(run["id"], after=first["sequence"]) == [second]


def test_time_budget_stops_before_the_first_tool(context):
    from dataclasses import replace
    settings, projects, store, _ = context
    _, run = create(context)
    result = Engine(replace(settings, max_run_seconds=0), store, projects).execute(run["id"])
    assert result["status"] == "needs_attention"
    assert "time budget" in result["error"]
