from pathlib import Path

import pytest

from patchpilot.config import Settings
from patchpilot.engine import Engine
from patchpilot.store import Store
from patchpilot.workspace import load_catalog


@pytest.fixture
def context(tmp_path):
    settings = Settings(data_dir=tmp_path, openai_key="", model="", api_token="")
    projects = load_catalog(settings.fixtures_dir, settings.registered_dir)
    store = Store(tmp_path / "runs.db")
    return settings, projects, store, Engine(settings, store, projects)
