from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import Settings
from .engine import Engine
from .models import RunRequest
from .models import RepairRequest
from .intake import MAX_REQUEST_BYTES, import_request
from .workspace import PolicyError
from pydantic import ValidationError
from .store import Store
from .workspace import load_catalog, public_project, register_repository


def main() -> None:
    parser = argparse.ArgumentParser(prog="patchpilot", description="Reviewable issue-to-patch repair agent")
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve", help="Serve the local API and built dashboard")
    serve.add_argument("--port", type=int, default=8000)
    run = sub.add_parser("run", help="Run a repair synchronously")
    run.add_argument("project", help="A bundled fixture or registered project ID")
    run.add_argument("--mode", choices=["demo", "openai"], default="demo")
    run.add_argument("--issue", default=None)
    run.add_argument("--attempts", type=int, default=None)
    run.add_argument("--tokens", type=int, default=None)
    register = sub.add_parser("register", help="Copy a bounded Python/unittest repository snapshot")
    register.add_argument("path", type=Path)
    register.add_argument("--id", required=True)
    register.add_argument("--title", required=True)
    register.add_argument("--issue", required=True)
    inspect = sub.add_parser("inspect", help="Read persisted run evidence")
    inspect.add_argument("run_id")
    intake = sub.add_parser("import", help="Import a portable .patchpilot.json repair request")
    intake.add_argument("file", type=Path)
    args = parser.parse_args()
    settings = Settings()
    if args.command == "import":
        try:
            if args.file.stat().st_size > MAX_REQUEST_BYTES:
                parser.error("Repair request exceeds the 600 KB import limit")
            body = RepairRequest.model_validate_json(args.file.read_bytes())
            reserved = {project["id"] for project in load_catalog(settings.fixtures_dir, settings.registered_dir)}
            spec = import_request(body, settings.registered_dir, reserved)
            print(json.dumps(public_project(spec), indent=2))
        except (OSError, PolicyError, ValidationError) as exc:
            parser.error(str(exc) if not isinstance(exc, ValidationError) else "Invalid repair request schema")
        return
    if args.command == "serve":
        import uvicorn
        from .api import create_app
        uvicorn.run(create_app(settings), host="127.0.0.1", port=args.port)
        return
    if args.command == "register":
        reserved = {project["id"] for project in load_catalog(settings.fixtures_dir, settings.registered_dir)}
        if args.id in reserved:
            parser.error("This project ID is already used")
        print(json.dumps(register_repository(args.path, settings.registered_dir, args.id, args.title, args.issue), indent=2))
        return
    store = Store(settings.data_dir / "runs.db")
    if args.command == "inspect":
        print(json.dumps(store.get(args.run_id), indent=2))
        return
    projects = load_catalog(settings.fixtures_dir, settings.registered_dir)
    spec = next((p for p in projects if p["id"] == args.project), None)
    if not spec:
        parser.error("Project not found")
    request = RunRequest(project_id=spec["id"], mode=args.mode, issue=args.issue,
                         max_attempts=args.attempts if args.attempts is not None else spec.get("max_attempts", 3),
                         token_budget=args.tokens if args.tokens is not None else spec.get("token_budget", 30000))
    if args.mode == "demo" and args.issue and args.issue != spec["issue"]:
        parser.error("Custom issues require live mode")
    run = store.create(request.model_dump(), public_project(spec))
    result = Engine(settings, store, projects).execute(run["id"])
    print(json.dumps(result, indent=2))
    if result["status"] != "awaiting_review":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
