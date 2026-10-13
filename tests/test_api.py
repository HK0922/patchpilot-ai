from dataclasses import replace
import io
import json
import time
import zipfile

from fastapi.testclient import TestClient
import pytest

from patchpilot.api import create_app


def complete(client, run_id):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] not in {"queued", "running"}:
            return run
        time.sleep(0.03)
    raise AssertionError("Run did not finish within the fixture deadline")


def test_api_runs_and_exports_a_verified_patch(context):
    with TestClient(create_app(context[0])) as client:
        response = client.post("/api/runs", json={"project_id": "pagination"})
        assert response.status_code == 202
        run_id = response.json()["id"]
        run = complete(client, run_id)
        assert run["status"] == "awaiting_review"
        assert "return items[start:start + page_size]" in client.get(f"/api/runs/{run_id}/patch").text
        exported = client.get(f"/api/runs/{run_id}/export")
        with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
            assert set(archive.namelist()) == {"run.json", "verified.patch", "PR_DESCRIPTION.md"}
            assert json.loads(archive.read("run.json"))["regression_verified"]
        decision = client.post(f"/api/runs/{run_id}/decision", json={"decision": "approve", "note": "Checked the new page-size-one case"})
        assert decision.json()["status"] == "approved"
        assert client.post(f"/api/runs/{run_id}/decision", json={"decision": "reject"}).status_code == 409


def test_failed_candidates_are_labeled_and_not_served_as_verified_patches(context):
    with TestClient(create_app(context[0])) as client:
        run = client.post("/api/runs", json={"project_id": "invoice", "max_attempts": 1}).json()
        final = complete(client, run["id"])
        assert final["status"] == "needs_attention"
        assert client.get(f"/api/runs/{run['id']}/patch").status_code == 409
        assert client.post(f"/api/runs/{run['id']}/decision", json={"decision": "approve"}).status_code == 409
        with zipfile.ZipFile(io.BytesIO(client.get(f"/api/runs/{run['id']}/export").content)) as archive:
            assert "unverified-candidate.patch" in archive.namelist()
            assert "verified.patch" not in archive.namelist()


def test_custom_issues_cannot_use_a_known_demo_solution(context):
    with TestClient(create_app(context[0])) as client:
        response = client.post("/api/runs", json={"project_id": "pagination", "issue": "a different issue"})
        assert response.status_code == 400


def test_live_mode_fails_closed_when_docker_and_credentials_are_absent(context):
    with TestClient(create_app(context[0])) as client:
        assert client.post("/api/runs", json={"project_id": "pagination", "mode": "openai"}).status_code == 503
        assert client.get("/api/runs").json() == []


def test_token_authentication_and_public_configuration(context):
    settings = replace(context[0], api_token="local-secret-token", openai_key="model-secret-key")
    with TestClient(create_app(settings)) as client:
        config = client.get("/api/config")
        assert config.json()["auth_required"] is True
        assert "local-secret-token" not in config.text
        assert "model-secret-key" not in config.text
        assert client.get("/api/runs").status_code == 401
        assert client.get("/api/runs", headers={"Authorization": "Bearer wrong"}).status_code == 401
        assert client.get("/api/runs", headers={"Authorization": "Bearer local-secret-token"}).status_code == 200


def test_cross_origin_mutations_are_blocked(context):
    with TestClient(create_app(context[0])) as client:
        assert client.post("/api/runs", json={"project_id": "pagination"}, headers={"Origin": "https://unrelated.example"}).status_code == 403
        response = client.post("/api/runs", json={"project_id": "pagination"}, headers={"Origin": "http://testserver"})
        assert response.status_code == 202
        complete(client, response.json()["id"])


@pytest.mark.parametrize("payload", [{"project_id": "pagination", "max_attempts": 20}, {"project_id": "pagination", "token_budget": 1}, {"project_id": "pagination", "arbitrary_shell": "rm -rf /"}])
def test_invalid_or_extra_request_fields_are_rejected(context, payload):
    with TestClient(create_app(context[0])) as client:
        assert client.post("/api/runs", json=payload).status_code == 422


def test_unknown_projects_and_runs_return_404(context):
    with TestClient(create_app(context[0])) as client:
        assert client.post("/api/runs", json={"project_id": "missing"}).status_code == 404
        assert client.get("/api/runs/missing").status_code == 404
        projects = client.get("/api/projects").json()
        assert len(projects) == 5
        assert all("demo_solution" not in project and "repo" not in project for project in projects)


def test_completed_event_stream_has_cursor_and_terminal_event(context):
    with TestClient(create_app(context[0])) as client:
        run = client.post("/api/runs", json={"project_id": "pagination"}).json()
        final = complete(client, run["id"])
        cursor = final["events"][-2]["sequence"]
        stream = client.get(f"/api/runs/{run['id']}/events?after={cursor}").text
        assert stream.count("event: update") == 1
        assert "event: done" in stream
