"""Portable source plus built dashboard, without secrets, runtime data, or nested bundles."""
import argparse
import hashlib
import os
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDE_DIRS = {".git", ".openai", ".data", ".venv", "node_modules", "__pycache__", ".pytest_cache", "artifacts"}
EXCLUDE_PATHS = {"web/public/downloads", "dist/downloads"}


def package(output: Path) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    members = []
    for folder, directories, files in os.walk(ROOT):
        directories[:] = sorted(directory for directory in directories
                                if directory not in EXCLUDE_DIRS and not directory.endswith(".egg-info")
                                and (Path(folder) / directory).relative_to(ROOT).as_posix() not in EXCLUDE_PATHS)
        for name in sorted(files):
            path = Path(folder) / name
            if path.is_symlink() or (name.startswith(".env") and name != ".env.example"):
                continue
            if name.endswith((".db", ".db-shm", ".db-wal", ".pyc", ".tsbuildinfo", ".tmp")):
                continue
            members.append(path)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in members:
            member = zipfile.ZipInfo("PatchPilot_AI/" + path.relative_to(ROOT).as_posix(), date_time=(2026, 10, 10, 0, 0, 0))
            member.compress_type = zipfile.ZIP_DEFLATED
            member.external_attr = 0o100644 << 16
            archive.writestr(member, path.read_bytes())
    return {"files": len(members), "bytes": output.stat().st_size,
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT.parent / "output/PatchPilot_AI_Source.zip")
    print(package(parser.parse_args().output.resolve()))
