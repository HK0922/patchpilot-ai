# Setup

## 1. Get the local application running

Requirements: Python 3.11 or later, Node.js 20.19+ or 22.12+, and npm. Docker is required only for live model-generated code execution. Demo mode has no API fees.

Clone the GitHub repository and open a terminal in `patchpilot-ai`, or unzip `PatchPilot_AI_Source.zip` and open `PatchPilot_AI`. A GitHub checkout needs the frontend build; the downloadable full source bundle includes a built dashboard.

macOS / Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock
python -m pip install -e . --no-deps
cd web
npm ci
npm run build
cd ..
patchpilot serve
```

Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m pip install -e . --no-deps
cd web
npm ci
npm run build
cd ..
.\.venv\Scripts\patchpilot.exe serve
```

Using explicit Windows executable paths avoids changing PowerShell's script execution policy.

Open `http://127.0.0.1:8000`. The local dashboard launches real fixture repair runs. Inspect Patch, Tests, Activity, Plan, and Review. Open Review, add a note, and approve or reject a verified patch. Approval records a decision only.

The source ZIP includes a built dashboard, so you can skip the npm steps for the first local run. Rebuild the frontend after changing UI code.

## 2. Use the CLI

```bash
patchpilot run pagination
patchpilot run invoice --attempts 3
patchpilot run invoice --attempts 1
patchpilot inspect <run-id>
```

The single-attempt invoice command exits with status 1 because the fixture's first candidate fails verification. That is an intentional negative case. Successful demo repairs exit with status 0 at `awaiting_review`.

Default runtime data is stored under the project's `.data/` folder. It includes a SQLite database and isolated run snapshots. Set `PATCHPILOT_DATA_DIR` to an absolute directory to change it. The source bundle excludes runtime data and secrets.

## 3. Enable live model calls

Build the sandbox image from the project root:

```bash
docker build -f Dockerfile.sandbox -t patchpilot-sandbox:0.1 .
```

macOS / Linux server environment:

```bash
export OPENAI_API_KEY="your-key"
export PATCHPILOT_MODEL="a-model-your-account-can-use-with-structured-outputs"
export PATCHPILOT_API_TOKEN="a-long-random-local-access-token"
patchpilot serve
```

Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="your-key"
$env:PATCHPILOT_MODEL="a-supported-model"
$env:PATCHPILOT_API_TOKEN="a-long-random-local-access-token"
.\.venv\Scripts\patchpilot.exe serve
```

A configured local access token protects API reads and mutations. Enter it in the local dashboard when prompted. It stays in page memory. Do not put the model API key in the browser.

Select **OpenAI Responses · live**. The issue text becomes editable. Run a small fixture first. Scripted recipes are not sent to the live provider; it receives source and test evidence only.

The `.env.example` file lists supported variables but is not auto-loaded. Set variables in your shell or use your usual secret-management process. Do not commit keys.

Model calls can incur charges. Token budgets stop new calls using a conservative UTF-8 byte estimate plus reserved output tokens. Actual usage comes from the provider's usage response. Retry attempts refer to implementation attempts, not all role calls. A typical successful live run needs a planner call, an implementer call, and a reviewer call.

API cost is unpriced until you set `PATCHPILOT_INPUT_PRICE` and `PATCHPILOT_OUTPUT_PRICE` to your model's current USD price per million tokens. The result is labeled an estimate; it does not handle tiered billing or cached-token discounts. No rate is hardcoded.

## 4. Register a small repository

Supported shape: pure Python code under `src/`, unittest test modules under `tests/`, and package `__init__.py` files. Dependencies beyond the Python standard library are not installed in the current test image. Do not register code containing credentials or real patient information.

```bash
patchpilot register /absolute/path/to/repo \
  --id my-module \
  --title "My module repair" \
  --issue "Describe the failing behavior and expected result"
```

Restart the service after registering so its project catalog refreshes. The command copies Python files into a bounded registered snapshot; it does not modify the original repository. Hidden folders, `.git`, virtual environments, non-Python files, and environment files are excluded. Python symlinks are rejected.

```bash
patchpilot run my-module --mode openai --attempts 3 --tokens 60000
```

Registered projects cannot use scripted demo mode. Live runs require Docker even when the selected case is a bundled fixture. There is no automatic fallback to unsandboxed live execution.

## 5. Apply an approved patch yourself

Download the patch from the local dashboard. Inspect it, then from your original repository:

```bash
git switch -c patchpilot/your-fix
git apply --check /path/to/downloaded.patch
git apply /path/to/downloaded.patch
# Run your repository's complete checks before committing.
```

PatchPilot does not run these commands for you. The branch, commit, and PR are separate human actions. Existing demo fixtures are deliberately small; broader integration checks remain your responsibility.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| Live mode is unavailable | Verify Docker is running, the sandbox image exists, and the server has both key and model variables. |
| HTTP 401 on local API | Enter the configured local access token. |
| HTTP 503 on a live run | Live prerequisites are missing; inspect `/api/config`. |
| Baseline import errors | Use `src/` and `tests/` packages with `__init__.py`; keep dependencies to the standard library. |
| Context or snapshot limit | Register a smaller module snapshot instead of the full monorepo. |
| Budget exhausted | Inspect failures first; raise a budget only when another attempt is justified. |
| Restart interrupted a run | Prior evidence remains saved. Create a new run; the engine does not resume a partially applied model run. |
| Dashboard not served | Build `web/` so the project root contains `dist/index.html`. |

The hosted replay works without running the local service, but does not execute code or save review decisions.

## Version 2: your own repair request

Use the local Your repository page to register a bounded module, or export a `.patchpilot.json` from the hosted page and run `patchpilot import FILE.patchpilot.json`. Then run the imported project in live mode. The complete portable workflow and limits are in [VERSION_2.md](VERSION_2.md).
