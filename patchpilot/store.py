"""SQLite transactions persist every event; no model output is used as SQL."""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class Conflict(ValueError):
    pass


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.lock = threading.RLock()
        with self._connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL REFERENCES runs(id),
                    payload TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS events_by_run ON events(run_id, sequence);
            """)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=10)
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def create(self, request: dict, project: dict) -> dict:
        stamp = now()
        run = {
            "id": uuid.uuid4().hex,
            "project_id": project["id"],
            "project_title": project["title"],
            "issue": request.get("issue") or project["issue"],
            "mode": request["mode"],
            "status": "queued", "stage": "intake", "attempt": 0,
            "max_attempts": request["max_attempts"],
            "token_budget": request["token_budget"],
            "created_at": stamp, "updated_at": stamp,
            "started_at": None, "finished_at": None,
            "cancel_requested": False, "plan": None, "review": None,
            "patch_summary": "", "diff": "", "files_changed": [],
            "tests": [], "regression_verified": False,
            "error": None, "decision": None,
            "metrics": {"duration_ms": 0, "input_tokens": 0, "output_tokens": 0,
                        "total_tokens": 0, "model_calls": 0, "cached_input_tokens": 0,
                        "estimated_cost_usd": 0.0 if request["mode"] == "demo" else None},
        }
        with self.lock, self._connect() as db:
            db.execute("INSERT INTO runs VALUES (?, ?, ?)", (run["id"], stamp, json.dumps(run)))
        return run

    def get(self, run_id: str, include_events: bool = True) -> dict:
        with self._connect() as db:
            row = db.execute("SELECT payload FROM runs WHERE id=?", (run_id,)).fetchone()
        if not row:
            raise KeyError(run_id)
        run = json.loads(row[0])
        if include_events:
            run["events"] = self.events(run_id)
        return run

    def list(self, limit: int = 50) -> list[dict]:
        with self._connect() as db:
            rows = db.execute("SELECT payload FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def update(self, run_id: str, **fields: Any) -> dict:
        with self.lock, self._connect() as db:
            row = db.execute("SELECT payload FROM runs WHERE id=?", (run_id,)).fetchone()
            if not row:
                raise KeyError(run_id)
            run = json.loads(row[0])
            run.update(fields, updated_at=now())
            db.execute("UPDATE runs SET payload=? WHERE id=?", (json.dumps(run), run_id))
        return run

    def event(self, run_id: str, role: str, stage: str, message: str,
              level: str = "info", **data: Any) -> dict:
        event = {"created_at": now(), "role": role, "stage": stage,
                 "message": message, "level": level, "data": data}
        with self.lock, self._connect() as db:
            cursor = db.execute("INSERT INTO events(run_id,payload) VALUES (?,?)", (run_id, json.dumps(event)))
            event["sequence"] = cursor.lastrowid
        return event

    def events(self, run_id: str, after: int = 0) -> list[dict]:
        with self._connect() as db:
            rows = db.execute("SELECT sequence,payload FROM events WHERE run_id=? AND sequence>? ORDER BY sequence",
                              (run_id, after)).fetchall()
        return [dict(json.loads(payload), sequence=seq) for seq, payload in rows]

    def cancel(self, run_id: str) -> dict:
        with self.lock:
            run = self.get(run_id, False)
            if run["status"] not in {"queued", "running"}:
                raise Conflict("Only queued or running jobs can be cancelled")
            self.update(run_id, cancel_requested=True)
            self.event(run_id, "human", run["stage"], "Cancellation requested; the next checkpoint will stop the run.")
            return self.get(run_id)

    def decide(self, run_id: str, decision: str, note: str) -> dict:
        with self.lock:
            run = self.get(run_id, False)
            if run["status"] != "awaiting_review":
                raise Conflict("Only a verified patch awaiting human review can be decided")
            status = "approved" if decision == "approve" else "rejected"
            self.update(run_id, status=status, decision={"decision": decision, "note": note, "created_at": now()})
            self.event(run_id, "human", "complete", f"Human {status} the patch. Original repository remains untouched.", note=note)
            return self.get(run_id)

    def recover(self) -> int:
        interrupted = [r for r in self.list(10000) if r["status"] in {"queued", "running"}]
        for run in interrupted:
            self.update(run["id"], status="interrupted", finished_at=now(), error="Service restarted. Create a new run to retry.")
            self.event(run["id"], "system", "complete", "Run interrupted by a service restart.", "warning")
        return len(interrupted)
