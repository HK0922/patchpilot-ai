"""A bounded role workflow. Tool evidence, never the model's confidence, gates review."""
from __future__ import annotations

import hashlib
import time
from pathlib import Path

from .config import Settings
from .models import Patch, Plan, Review
from .providers import Budget, BudgetExceeded, DemoProvider, OpenAIProvider, ProviderError
from .sandbox import SandboxError, TestRunner
from .store import Store, now
from .workspace import PolicyError, Workspace

ENGINE_TERMINAL = {"awaiting_review", "approved", "rejected", "needs_attention", "cancelled", "interrupted"}


class Cancelled(RuntimeError):
    pass


class Engine:
    def __init__(self, settings: Settings, store: Store, projects: list[dict]):
        self.settings, self.store = settings, store
        self.projects = {project["id"]: project for project in projects}

    def execute(self, run_id: str, provider=None) -> dict:
        run = self.store.get(run_id, False)
        if run["status"] != "queued":
            return self.store.get(run_id)
        spec = self.projects[run["project_id"]]
        budget = Budget(run["token_budget"], self.settings.max_run_seconds)
        workspace = None
        owned_provider = provider is None
        tests: list[dict] = []
        current_stage = "intake"

        def checkpoint() -> None:
            budget.remaining_seconds()
            if self.store.get(run_id, False)["cancel_requested"]:
                raise Cancelled("Run cancelled at a tool checkpoint")

        def stage(name: str, role: str, message: str, **data) -> None:
            nonlocal current_stage
            checkpoint()
            current_stage = name
            self.store.update(run_id, stage=name, metrics=budget.metrics(self.settings, run["mode"] == "demo"))
            self.store.event(run_id, role, name, message, **data)

        def test(repo: Path, phase: str, regression_only: bool = False):
            checkpoint()
            result = runner.run(repo, phase, regression_only=regression_only,
                                cancelled=lambda: self.store.get(run_id, False)["cancel_requested"],
                                timeout=budget.remaining_seconds())
            tests.append(result.model_dump())
            self.store.update(run_id, tests=tests)
            self.store.event(run_id, "verifier", current_stage,
                             f"{phase}: {result.tests_run} tests; {result.failures} failures; {result.errors} errors.",
                             "success" if result.passed else "warning", result=result.model_dump())
            checkpoint()
            return result

        try:
            checkpoint()
            self.store.update(run_id, status="running", started_at=now())
            provider = provider or (DemoProvider(spec) if run["mode"] == "demo" else OpenAIProvider(self.settings))
            runner = TestRunner(self.settings, run["mode"], bool(spec.get("trusted_demo")))
            stage("intake", "system", "Created an isolated snapshot. The original repository will not be modified.",
                  mode=run["mode"], provider=provider.name)
            workspace = Workspace(self.settings.data_dir / "runs" / run_id, spec)
            stage("baseline", "verifier", "Running the existing suite before changing code.")
            baseline = test(workspace.repo, "Baseline")
            if baseline.tests_run == 0 or baseline.errors or baseline.timed_out:
                raise PolicyError("Baseline tests must be discoverable and complete without import errors or timeout")
            stage("plan", "planner", "Preparing the repair plan from source and baseline evidence.")
            context = {"issue": run["issue"], "editable_files": sorted(workspace.editable),
                       "files": workspace.context(), "baseline": baseline.model_dump()}
            plan: Plan = provider.call("planner", context, budget)
            checkpoint()
            if not plan.target_files or not set(plan.target_files).issubset(workspace.editable):
                raise PolicyError("The plan references files outside the registered edit scope")
            self.store.update(run_id, plan=plan.model_dump())
            self.store.event(run_id, "planner", "plan", plan.summary, plan=plan.model_dump())
            feedback: dict = {}
            for attempt in range(1, run["max_attempts"] + 1):
                self.store.update(run_id, attempt=attempt)
                stage("patch", "implementer", f"Proposing a scoped patch, attempt {attempt} of {run['max_attempts']}.")
                context.update(files=workspace.context(), plan=plan.model_dump(), attempt=attempt, feedback=feedback)
                patch: Patch = provider.call("implementer", context, budget)
                checkpoint()
                changed = workspace.apply(patch)
                diff, files_changed = workspace.diff()
                self.store.update(run_id, patch_summary=patch.summary, diff=diff, files_changed=files_changed)
                self.store.event(run_id, "implementer", "patch", patch.summary, files=changed)
                stage("test", "verifier", "Checking the regression against the original source, then running the complete patched suite.")
                regression = test(workspace.regression_baseline(), f"Regression on original / attempt {attempt}", regression_only=True)
                reproduced = bool(not regression.passed and regression.failures > 0 and regression.errors == 0
                                  and regression.tests_run > 0 and not regression.timed_out)
                candidate = test(workspace.repo, f"Patched suite / attempt {attempt}")
                workspace.check_integrity()
                self.store.update(run_id, regression_verified=reproduced)
                enough_tests = candidate.tests_run >= baseline.tests_run + regression.tests_run
                if not reproduced or not candidate.passed or not enough_tests:
                    feedback = {"reason": "Verification did not pass", "regression_reproduced": reproduced,
                                "regression": regression.model_dump(), "patched_suite": candidate.model_dump()}
                    self.store.event(run_id, "verifier", "test", "Patch failed the evidence gate. Returning test output to the implementer.",
                                     "warning", attempt=attempt)
                    continue
                stage("review", "reviewer", "Reviewing the diff independently against the issue and executed tests.")
                review: Review = provider.call("reviewer", {
                    "issue": run["issue"], "plan": plan.model_dump(), "diff": diff,
                    "regression_verified": reproduced, "tests": [regression.model_dump(), candidate.model_dump()],
                }, budget)
                checkpoint()
                self.store.update(run_id, review=review.model_dump())
                self.store.event(run_id, "reviewer", "review", review.summary,
                                 "success" if review.verdict == "approve" else "warning", review=review.model_dump())
                if review.verdict != "approve":
                    feedback = {"reason": "Reviewer requested changes", "review": review.model_dump()}
                    continue
                stage("complete", "system", "Verified patch is ready for human review. A patch file and PR description are available.")
                self.store.update(run_id, status="awaiting_review", finished_at=now(),
                                  patch_sha256=hashlib.sha256(diff.encode()).hexdigest(),
                                  pr_title=f"Fix: {spec['title']}", pr_body=self._pr_body(run, patch.summary, baseline, candidate, attempt))
                break
            else:
                self.store.update(run_id, status="needs_attention", finished_at=now(), error="Attempt limit reached without a verified, reviewer-approved patch")
                self.store.event(run_id, "system", "complete", "Attempt budget exhausted. Human investigation is required.", "warning")
        except Cancelled as exc:
            self.store.update(run_id, status="cancelled", finished_at=now(), error=str(exc))
            self.store.event(run_id, "system", current_stage, str(exc), "warning")
        except (PolicyError, ProviderError, SandboxError) as exc:
            self.store.update(run_id, status="needs_attention", finished_at=now(), error=str(exc))
            self.store.event(run_id, "system", current_stage, str(exc), "error")
        except Exception as exc:
            # Never leak arbitrary exception text, paths, environment values, or provider bodies.
            self.store.update(run_id, status="needs_attention", finished_at=now(), error=f"Unexpected {type(exc).__name__}; see server diagnostics")
            self.store.event(run_id, "system", current_stage, "The run stopped on an unexpected tool failure.", "error")
        finally:
            if workspace is not None:
                diff, files_changed = workspace.diff()
                self.store.update(run_id, diff=diff, files_changed=files_changed)
            self.store.update(run_id, metrics=budget.metrics(self.settings, run["mode"] == "demo"))
            if owned_provider and isinstance(provider, OpenAIProvider):
                provider.close()
        return self.store.get(run_id)

    @staticmethod
    def _pr_body(run, summary, baseline, candidate, attempt) -> str:
        mode = "Scripted fixture run (no LLM calls)" if run["mode"] == "demo" else "Live structured model run"
        return (f"{summary}\n\n"
                f"Validation: existing suite before repair: {baseline.tests_run} tests, {baseline.failures} failures. "
                f"Patched suite: {candidate.tests_run} tests, all passing. "
                "New regression fails on original code and passes after repair. Existing tests are unchanged.\n\n"
                f"Run: {run['id']}. Mode: {mode}. Attempts: {attempt}.\n\n"
                "Human review is required. Approval records a decision; it does not apply, push, or merge the patch.")
