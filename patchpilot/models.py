"""The model may propose typed plans and edits; tools control all side effects."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Plan(StrictModel):
    summary: str
    steps: list[str]
    target_files: list[str]
    acceptance_criteria: list[str]
    risks: list[str]


class Edit(StrictModel):
    path: str
    before: str
    after: str


class RegressionTest(StrictModel):
    path: str
    source: str


class Patch(StrictModel):
    summary: str
    edits: list[Edit]
    regression_test: RegressionTest


class Review(StrictModel):
    verdict: Literal["approve", "request_changes"]
    summary: str
    concerns: list[str]


class RunRequest(StrictModel):
    project_id: str = Field(min_length=1, max_length=64)
    mode: Literal["demo", "openai"] = "demo"
    issue: str | None = Field(default=None, max_length=4000)
    max_attempts: int = Field(default=3, ge=1, le=4)
    token_budget: int = Field(default=30000, ge=8000, le=100000)


class Decision(StrictModel):
    decision: Literal["approve", "reject"]
    note: str = Field(default="", max_length=1500)


class RepairRequest(StrictModel):
    schema_version: Literal[1] = 1
    kind: Literal["patchpilot-repair-request"]
    project_id: str = Field(pattern=r"^[a-z][a-z0-9-]{1,48}$")
    title: str = Field(min_length=3, max_length=120)
    issue: str = Field(min_length=10, max_length=4000)
    acceptance_criteria: list[str] = Field(min_length=1, max_length=12)
    editable_files: list[str] = Field(min_length=1, max_length=60)
    files: dict[str, str] = Field(min_length=1, max_length=60)
    priority: Literal["high", "normal", "low"] = "normal"
    max_attempts: int = Field(default=3, ge=1, le=4)
    token_budget: int = Field(default=30000, ge=8000, le=100000)


class TestResult(StrictModel):
    phase: str
    passed: bool
    returncode: int
    duration_ms: int
    tests_run: int
    failures: int
    errors: int
    output: str
    timed_out: bool
    runner: str


ROLE_MODELS: dict[str, type[StrictModel]] = {
    "planner": Plan,
    "implementer": Patch,
    "reviewer": Review,
}
