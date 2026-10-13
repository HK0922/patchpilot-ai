from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    root: Path = ROOT
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("PATCHPILOT_DATA_DIR", str(ROOT / ".data"))).resolve())
    api_token: str = field(default_factory=lambda: os.getenv("PATCHPILOT_API_TOKEN", ""), repr=False)
    openai_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""), repr=False)
    model: str = field(default_factory=lambda: os.getenv("PATCHPILOT_MODEL", ""))
    sandbox_image: str = field(default_factory=lambda: os.getenv("PATCHPILOT_SANDBOX_IMAGE", "patchpilot-sandbox:0.1"))
    test_timeout: int = field(default_factory=lambda: int(os.getenv("PATCHPILOT_TEST_TIMEOUT", "20")))
    max_run_seconds: int = field(default_factory=lambda: int(os.getenv("PATCHPILOT_MAX_RUN_SECONDS", "240")))
    input_price: float | None = field(default_factory=lambda: _price("PATCHPILOT_INPUT_PRICE"))
    output_price: float | None = field(default_factory=lambda: _price("PATCHPILOT_OUTPUT_PRICE"))

    @property
    def fixtures_dir(self) -> Path:
        return self.root / "examples"

    @property
    def registered_dir(self) -> Path:
        return self.data_dir / "registered"

    @property
    def web_dir(self) -> Path:
        return self.root / "dist"


def _price(name: str) -> float | None:
    value = os.getenv(name)
    if not value:
        return None
    rate = float(value)
    if rate < 0:
        raise ValueError(f"{name} must not be negative")
    return rate
