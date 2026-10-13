import json
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from patchpilot.api import create_app
from patchpilot.intake import import_request, prepare_request
from patchpilot.models import RepairRequest
from patchpilot.workspace import PolicyError, load_catalog


def request_payload():
    return {
        'schema_version': 1, 'kind': 'patchpilot-repair-request', 'project_id': 'store-rounding',
        'title': 'Currency rounding mismatch', 'issue': 'Rounding should use half-up for currency ties.',
        'acceptance_criteria': ['2.675 rounds to 2.68', 'Preserve existing discount behavior'],
        'editable_files': ['src/discounts.py'], 'files': {
            'src/discounts.py': 'def total(value):\n    return round(value, 2)\n',
            'src/helper.py': 'FACTOR = 100\n',
            'tests/test_discounts.py': 'import unittest\nfrom src.discounts import total\n\nclass Totals(unittest.TestCase):\n    def test_tie(self):\n        self.assertEqual(total(2.675), 2.68)\n',
        }, 'priority': 'high', 'max_attempts': 2, 'token_budget': 16000,
    }


def test_import_creates_a_snapshot_preserves_scope_and_survives_restart(context):
    settings = context[0]
    payload = request_payload()
    with TestClient(create_app(settings)) as client:
        response = client.post('/api/projects/import', json=payload)
        assert response.status_code == 201
        assert response.json()['editable_files'] == ['src/discounts.py']
        assert not response.json()['demo_available']
        assert 'Acceptance criteria:' in response.json()['issue']
        assert client.get('/api/runs').json() == []  # Import does not execute code.
        assert client.get('/api/projects').json()[-1]['id'] == 'store-rounding'
        assert client.post('/api/runs', json={'project_id': 'store-rounding'}).status_code == 400
        assert client.post('/api/runs', json={'project_id': 'store-rounding', 'mode': 'openai'}).status_code == 503
    destination = settings.registered_dir / 'store-rounding'
    assert (destination / 'repo/tests/__init__.py').exists()
    assert (destination / 'repo/src/helper.py').read_text() == payload['files']['src/helper.py']
    spec = json.loads((destination / 'project.json').read_text())
    assert spec['max_attempts'] == 2 and spec['token_budget'] == 16000
    with TestClient(create_app(settings)) as client:
        assert next(x for x in client.get('/api/projects').json() if x['id'] == 'store-rounding')['editable_files'] == ['src/discounts.py']


def test_duplicate_ids_do_not_overwrite_a_snapshot(context):
    with TestClient(create_app(context[0])) as client:
        payload = request_payload()
        assert client.post('/api/projects/import', json=payload).status_code == 201
        payload['files']['src/discounts.py'] = 'def total(value):\n    return 0\n'
        assert client.post('/api/projects/import', json=payload).status_code == 409
    assert 'round(value, 2)' in (context[0].registered_dir / 'store-rounding/repo/src/discounts.py').read_text()


@pytest.mark.parametrize('path', ['../escape.py', 'src/../../escape.py', '/tmp/escape.py', 'src\\escape.py', 'src/.secret.py', 'notes.py'])
def test_file_escapes_and_unscoped_files_are_rejected_before_writing(context, path):
    payload = request_payload()
    payload['files'][path] = 'VALUE = 1\n'
    with TestClient(create_app(context[0])) as client:
        assert client.post('/api/projects/import', json=payload).status_code == 422
    assert not (context[0].registered_dir / 'store-rounding').exists()


@pytest.mark.parametrize('change', ['system-import', 'tests-editable', 'missing-tests', 'reserved-test', 'huge-context'])
def test_invalid_snapshots_fail_closed(context, change):
    payload = request_payload()
    if change == 'system-import': payload['files']['src/discounts.py'] = 'import os\nos.system("echo bad")\n'
    if change == 'tests-editable': payload['editable_files'] = ['tests/test_discounts.py']
    if change == 'missing-tests': del payload['files']['tests/test_discounts.py']
    if change == 'reserved-test': payload['files']['tests/test_patchpilot_regression.py'] = 'VALUE=1\n'
    if change == 'huge-context': payload['files']['src/discounts.py'] = '# ' + 'a' * 51000
    with TestClient(create_app(context[0])) as client:
        assert client.post('/api/projects/import', json=payload).status_code == 422
    assert not (context[0].registered_dir / 'store-rounding').exists()


def test_intake_auth_and_origin_rules_match_run_mutations(context):
    settings = replace(context[0], api_token='test-token')
    with TestClient(create_app(settings)) as client:
        assert client.post('/api/projects/import', json=request_payload()).status_code == 401
        headers = {'Authorization': 'Bearer test-token', 'Origin': 'https://unrelated.example'}
        assert client.post('/api/projects/import', json=request_payload(), headers=headers).status_code == 403
        headers.pop('Origin')
        assert client.post('/api/projects/import', json=request_payload(), headers=headers).status_code == 201


def test_malformed_and_oversized_payloads_do_not_register_projects(context):
    with TestClient(create_app(context[0])) as client:
        assert client.post('/api/projects/import', content=b'{broken').status_code == 422
        assert client.post('/api/projects/import', content=b' ' * 600001).status_code == 413
        payload = request_payload() | {'shell_command': 'echo bad'}
        assert client.post('/api/projects/import', json=payload).status_code == 422
        payload = request_payload() | {'project_id': 'pagination'}
        assert client.post('/api/projects/import', json=payload).status_code == 409
    assert not context[0].registered_dir.exists()


def test_nested_packages_are_discoverable_and_original_initializers_preserved(context):
    body = request_payload()
    del body['files']['tests/test_discounts.py']
    body['files']['tests/unit/test_small.py'] = 'import unittest\nclass Small(unittest.TestCase):\n    def test_small(self):\n        self.assertTrue(True)\n'
    body['files']['src/__init__.py'] = 'NAME = "checkout"\n'
    spec = import_request(RepairRequest(**body), context[0].registered_dir, set())
    assert not spec['trusted_demo']
    assert (spec['repo'] / 'tests/unit/__init__.py').exists()
    assert (spec['repo'] / 'src/__init__.py').read_text() == 'NAME = "checkout"\n'
    assert load_catalog(context[0].fixtures_dir, context[0].registered_dir)[-1]['editable_files'] == ['src/discounts.py']


def test_exported_request_imports_through_cli_without_running_code(context, monkeypatch, capsys):
    from patchpilot.cli import main
    manifest = context[0].data_dir / 'checkout.patchpilot.json'
    manifest.write_text(json.dumps(request_payload()))
    monkeypatch.setenv('PATCHPILOT_DATA_DIR', str(context[0].data_dir))
    monkeypatch.setattr('sys.argv', ['patchpilot', 'import', str(manifest)])
    main()
    result = json.loads(capsys.readouterr().out)
    assert result['id'] == 'store-rounding'
    assert result['demo_available'] is False
    assert not (context[0].data_dir / 'runs').exists()
