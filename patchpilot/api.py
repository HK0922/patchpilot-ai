from __future__ import annotations

import asyncio
import hmac
import io
import json
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings
from .engine import ENGINE_TERMINAL, Engine
from .models import Decision, RunRequest
from .models import RepairRequest
from .intake import MAX_REQUEST_BYTES, import_request
from .workspace import PolicyError
from pydantic import ValidationError
from .sandbox import docker_available
from .store import Conflict, Store
from .workspace import load_catalog, public_project


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    store = Store(settings.data_dir / "runs.db")
    projects = load_catalog(settings.fixtures_dir, settings.registered_dir)
    engine = Engine(settings, store, projects)
    submit_lock = threading.Lock()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store.recover()
        app.state.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="patchpilot")
        yield
        # Give the active runner a cancellation checkpoint before shutting down.
        for run in store.list(10000):
            if run["status"] in {"queued", "running"}:
                store.update(run["id"], cancel_requested=True)
        app.state.pool.shutdown(wait=True, cancel_futures=True)

    app = FastAPI(title="PatchPilot AI", version="0.2.0", lifespan=lifespan)
    app.state.store, app.state.engine = store, engine
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver", "[::1]"])

    @app.middleware("http")
    async def local_access(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
                allowed = {f"http://localhost:{request.url.port or 80}", f"http://127.0.0.1:{request.url.port or 80}"}
                if request.url.hostname == "testserver":
                    allowed.add("http://testserver")
                if origin not in allowed:
                    return JSONResponse({"detail": "Cross-origin mutations are blocked"}, status_code=403)
            public = request.url.path in {"/api/config", "/api/health"}
            if settings.api_token and not public:
                supplied = request.headers.get("authorization", "")
                if not hmac.compare_digest(supplied, "Bearer " + settings.api_token):
                    return JSONResponse({"detail": "A server access token is required"}, status_code=401)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api/") else "no-cache"
        return response

    def get_run(run_id: str) -> dict:
        try:
            return store.get(run_id)
        except KeyError:
            raise HTTPException(404, "Run not found") from None

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "0.2.0"}

    @app.get("/api/config")
    def config():
        docker = docker_available(settings.sandbox_image)
        return {"kind": "local-service", "auth_required": bool(settings.api_token), "repository_intake": True,
                "live_ready": bool(settings.openai_key and settings.model and docker),
                "model_configured": bool(settings.model), "model": settings.model or None,
                "docker_ready": docker, "key_configured": bool(settings.openai_key),
                "source_archive_available": (settings.web_dir / "downloads/PatchPilot_AI_Source.zip").is_file(),
                "max_run_seconds": settings.max_run_seconds, "test_timeout": settings.test_timeout,
                "live_blocker": None if settings.openai_key and settings.model and docker else "Live mode requires a server-side API key, a supported model, and the Docker sandbox image."}

    @app.get("/api/projects")
    def list_projects():
        return [public_project(project) for project in projects]

    @app.post("/api/projects/import", status_code=201)
    async def register_request(request: Request):
        payload = bytearray()
        async for chunk in request.stream():
            payload.extend(chunk)
            if len(payload) > MAX_REQUEST_BYTES:
                raise HTTPException(413, "Repair request exceeds the 600 KB import limit")
        try:
            body = RepairRequest.model_validate_json(payload)
        except ValidationError:
            raise HTTPException(422, "Invalid repair request. Check the schema, fields, and limits.") from None
        try:
            with submit_lock:
                spec = import_request(body, settings.registered_dir, set(engine.projects))
                projects.append(spec)
                engine.projects[spec["id"]] = spec
            return public_project(spec)
        except FileExistsError as exc:
            raise HTTPException(409, str(exc)) from exc
        except (PolicyError, UnicodeError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/runs")
    def list_runs():
        return store.list()

    @app.post("/api/runs", status_code=202)
    def start_run(body: RunRequest):
        spec = engine.projects.get(body.project_id)
        if spec is None:
            raise HTTPException(404, "Registered project not found")
        if body.mode == "demo":
            if not spec.get("trusted_demo"):
                raise HTTPException(400, "Demo mode supports bundled fixtures only")
            if body.issue and body.issue != spec["issue"]:
                raise HTTPException(400, "Custom issues require live mode; scripted demos use the fixture's issue")
        elif not (settings.openai_key and settings.model and docker_available(settings.sandbox_image)):
            raise HTTPException(503, "Live mode requires a server-side key, model, and Docker sandbox image")
        with submit_lock:
            if sum(run["status"] in {"queued", "running"} for run in store.list(10000)) >= 6:
                raise HTTPException(429, "The local worker queue is full")
            run = store.create(body.model_dump(), public_project(spec))
            store.event(run["id"], "system", "intake", "Job queued for the single local worker.")
            app.state.pool.submit(engine.execute, run["id"])
        return store.get(run["id"])

    @app.get("/api/runs/{run_id}")
    def run_detail(run_id: str):
        return get_run(run_id)

    @app.post("/api/runs/{run_id}/cancel")
    def cancel_run(run_id: str):
        get_run(run_id)
        try:
            return store.cancel(run_id)
        except Conflict as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/runs/{run_id}/decision")
    def decide(run_id: str, body: Decision):
        get_run(run_id)
        try:
            return store.decide(run_id, body.decision, body.note)
        except Conflict as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/api/runs/{run_id}/events")
    async def events(run_id: str, request: Request, after: int = 0):
        get_run(run_id)
        async def stream():
            cursor = max(after, 0)
            while not await request.is_disconnected():
                pending = store.events(run_id, cursor)
                for event in pending:
                    cursor = event["sequence"]
                    yield f"id: {cursor}\nevent: update\ndata: {json.dumps(event)}\n\n"
                if store.get(run_id, False)["status"] in ENGINE_TERMINAL:
                    yield "event: done\ndata: {}\n\n"
                    break
                if not pending:
                    yield ": heartbeat\n\n"
                await asyncio.sleep(0.5)
        return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

    @app.get("/api/runs/{run_id}/patch")
    def patch(run_id: str):
        run = get_run(run_id)
        if run["status"] not in {"awaiting_review", "approved", "rejected"}:
            raise HTTPException(409, "A verified patch is not available for this run")
        return Response(run["diff"], media_type="text/plain", headers={"Content-Disposition": f'attachment; filename="patchpilot-{run_id[:8]}.patch"'})

    @app.get("/api/runs/{run_id}/export")
    def export(run_id: str):
        run = get_run(run_id)
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
            bundle.writestr("run.json", json.dumps(run, indent=2))
            if run["diff"]:
                verified = run["status"] in {"awaiting_review", "approved", "rejected"}
                bundle.writestr("verified.patch" if verified else "unverified-candidate.patch", run["diff"])
            if run.get("pr_body"):
                bundle.writestr("PR_DESCRIPTION.md", run["pr_title"] + "\n\n" + run["pr_body"])
        return Response(archive.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="patchpilot-evidence-{run_id[:8]}.zip"'})

    if settings.web_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=settings.web_dir / "assets"), name="assets")
        if (settings.web_dir / "downloads").is_dir():
            app.mount("/downloads", StaticFiles(directory=settings.web_dir / "downloads"), name="downloads")
        @app.get("/favicon.svg")
        def favicon():
            return FileResponse(settings.web_dir / "favicon.svg")
        @app.get("/demo-data.json")
        def demo_data():
            return FileResponse(settings.web_dir / "demo-data.json")
        @app.get("/")
        def index():
            return FileResponse(settings.web_dir / "index.html")
    return app
