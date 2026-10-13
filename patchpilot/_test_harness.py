"""Trusted test harness, executed in a child interpreter or a locked-down container."""
import json
import sys
import unittest
from pathlib import Path

if __name__ == "__main__":
    root = Path(sys.argv[1]).resolve()
    pattern = sys.argv[2] if len(sys.argv) > 2 else "test*.py"
    sys.path.insert(0, str(root))
    suite = unittest.defaultTestLoader.discover(str(root / "tests"), pattern=pattern, top_level_dir=str(root))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    report = {"tests_run": result.testsRun, "failures": len(result.failures), "errors": len(result.errors),
              "passed": result.wasSuccessful() and result.testsRun > 0}
    print("PATCHPILOT_RESULT=" + json.dumps(report), flush=True)
    sys.exit(0 if report["passed"] else 1)
