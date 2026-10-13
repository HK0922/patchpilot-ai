from dataclasses import replace
import json

import httpx
import pytest

from patchpilot.providers import Budget, BudgetExceeded, OpenAIProvider, ProviderError


PLAN = {"summary": "Fix the slice endpoint", "steps": ["Fix and test"], "target_files": ["src/pagination.py"], "acceptance_criteria": ["Returns a full page"], "risks": []}


def response_payload(text=PLAN, status="completed", refusal=False):
    return {"status": status, "usage": {"input_tokens": 300, "output_tokens": 100, "total_tokens": 400,
                                         "input_tokens_details": {"cached_tokens": 40}},
            "output": [{"type": "message", "content": [{"type": "refusal", "refusal": "declined"}] if refusal else
                        [{"type": "output_text", "text": json.dumps(text)}]}]}


def provider(context, handler):
    settings = replace(context[0], openai_key="test-secret-value", model="test-model", input_price=1.0, output_price=2.0)
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return settings, OpenAIProvider(settings, client)


def test_live_provider_sends_strict_schema_and_records_actual_usage(context):
    seen = []
    def handle(request):
        seen.append(request)
        return httpx.Response(200, json=response_payload())
    settings, live = provider(context, handle)
    budget = Budget(30000, 60)
    result = live.call("planner", {"issue": "fix the slice"}, budget)
    assert result.summary == PLAN["summary"]
    body = json.loads(seen[0].content)
    assert body["text"]["format"]["strict"] is True
    assert body["text"]["format"]["schema"]["additionalProperties"] is False
    assert body["store"] is False
    assert seen[0].url == "https://api.openai.com/v1/responses"
    assert budget.total_tokens == 400 and budget.cached_tokens == 40
    assert budget.metrics(settings, False)["estimated_cost_usd"] == 0.0005


@pytest.mark.parametrize("response", [response_payload(status="incomplete"), response_payload(refusal=True), response_payload(text={"wrong": True})])
def test_invalid_incomplete_or_refused_outputs_are_not_applied(context, response):
    _, live = provider(context, lambda request: httpx.Response(200, json=response))
    with pytest.raises(ProviderError):
        live.call("planner", {}, Budget(30000, 60))


def test_http_failure_never_leaks_provider_body_or_key(context):
    _, live = provider(context, lambda request: httpx.Response(401, text="test-secret-value sensitive error body"))
    with pytest.raises(ProviderError) as caught:
        live.call("planner", {}, Budget(30000, 60))
    assert "test-secret-value" not in str(caught.value)
    assert "sensitive" not in str(caught.value)
    assert "401" in str(caught.value)


def test_budget_rejection_happens_before_any_network_call(context):
    called = []
    _, live = provider(context, lambda request: called.append(request) or httpx.Response(200, json=response_payload()))
    with pytest.raises(BudgetExceeded):
        live.call("planner", {"large": "x" * 20000}, Budget(8000, 60))
    assert called == []


def test_unconfigured_cost_is_not_invented(context):
    budget = Budget(30000, 60)
    budget.record({"input_tokens": 1, "output_tokens": 1})
    assert budget.metrics(context[0], False)["estimated_cost_usd"] is None
