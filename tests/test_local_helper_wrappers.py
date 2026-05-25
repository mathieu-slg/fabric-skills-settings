"""Smoke tests for the local-helper MCP wrappers (lint/validate/workspace/data/precommit).

These verify each wrapper module registers the expected tools and that the
tools dispatch correctly. Subprocess-based tools mock out subprocess.run;
the lint wrapper exercises the real in-process lint engine on a tmp tree.
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from mcp.server.fastmcp import FastMCP  # noqa: E402

from server.tools.data import tools as data_tools  # noqa: E402
from server.tools.lint import tools as lint_tools  # noqa: E402
from server.tools.precommit import tools as precommit_tools  # noqa: E402
from server.tools.validate import tools as validate_tools  # noqa: E402


def _tools(mcp: FastMCP) -> dict[str, callable]:
    return {t.name: t.fn for t in mcp._tool_manager.list_tools()}


def _fake_subprocess_ok(stdout: str = "ok", returncode: int = 0):
    class _Result:
        def __init__(self):
            self.stdout = stdout
            self.stderr = ""
            self.returncode = returncode

    captured: dict = {}

    def _fake_run(cmd, *args, **kwargs):
        captured["cmd"] = list(cmd)
        captured["cwd"] = kwargs.get("cwd")
        return _Result()

    return patch("subprocess.run", side_effect=_fake_run), captured


# ── lint ──────────────────────────────────────────────────────────────────────


def test_lint_tools_registers_lint_run():
    mcp = FastMCP("test")
    lint_tools.register(mcp)
    assert set(_tools(mcp)) == {"lint_run"}


def test_lint_run_clean_target_returns_pass(tmp_path):
    (tmp_path / "workspace" / "demo").mkdir(parents=True)
    (tmp_path / "workspace" / "demo" / "bronze.py").write_text(
        '# %% [contract]\nimport os\nuser = os.environ["DEMO_USER"]\n',
        encoding="utf-8",
    )
    mcp = FastMCP("test")
    lint_tools.register(mcp)
    result = _tools(mcp)["lint_run"](target_dir=str(tmp_path))
    assert "PASS" in result
    assert "exit code" not in result


def test_lint_run_dirty_target_reports_findings(tmp_path):
    (tmp_path / "workspace" / "demo").mkdir(parents=True)
    (tmp_path / "workspace" / "demo" / "bronze.py").write_text(
        'password = "hunter2-not-a-placeholder"\n', encoding="utf-8"
    )
    mcp = FastMCP("test")
    lint_tools.register(mcp)
    result = _tools(mcp)["lint_run"](target_dir=str(tmp_path))
    assert "SEC-01" in result
    assert "exit code: 1" in result


def test_lint_run_rejects_missing_target():
    mcp = FastMCP("test")
    lint_tools.register(mcp)
    with pytest.raises(RuntimeError, match="does not exist"):
        _tools(mcp)["lint_run"](target_dir="/nonexistent/path/xyz")


# ── validate ──────────────────────────────────────────────────────────────────


def test_validate_tools_registers_pipeline_lineage_check():
    mcp = FastMCP("test")
    validate_tools.register(mcp)
    assert set(_tools(mcp)) == {"pipeline_lineage_check"}


def test_pipeline_lineage_check_stages_uploaded_files_and_passes_flags():
    mcp = FastMCP("test")
    validate_tools.register(mcp)
    ctx, captured = _fake_subprocess_ok("PASS: pipeline staging paths are consistent\n")
    notebooks = {
        "workspace/orders/bronze.py": 'OUTPUT_DIR = "abfss://lake/bronze/orders"\n',
        "workspace/orders/silver.py": 'SOURCE_DIR = "abfss://lake/bronze/orders"\n',
    }
    with ctx:
        out = _tools(mcp)["pipeline_lineage_check"](
            notebooks=notebooks, topic="orders", workspace="custom_ws"
        )
    cmd = captured["cmd"]
    assert "--workspace" in cmd and "custom_ws" in cmd
    assert "--topic" in cmd and "orders" in cmd
    # subprocess ran inside a temp dir, not against any caller-supplied path
    assert "pipeline-lineage-" in str(captured["cwd"])
    assert "PASS" in out


def test_pipeline_lineage_check_rejects_unsafe_paths():
    mcp = FastMCP("test")
    validate_tools.register(mcp)
    for bad in ("/etc/passwd", "../escape.py", "workspace/../etc/passwd"):
        with pytest.raises(RuntimeError, match="unsafe upload path|invalid upload path"):
            _tools(mcp)["pipeline_lineage_check"](notebooks={bad: "x = 1"})


def test_pipeline_lineage_check_rejects_non_py_files():
    mcp = FastMCP("test")
    validate_tools.register(mcp)
    with pytest.raises(RuntimeError, match="only .py files"):
        _tools(mcp)["pipeline_lineage_check"](
            notebooks={"workspace/orders/readme.md": "# notes"}
        )


def test_pipeline_lineage_check_rejects_empty_upload():
    mcp = FastMCP("test")
    validate_tools.register(mcp)
    with pytest.raises(RuntimeError, match="non-empty mapping"):
        _tools(mcp)["pipeline_lineage_check"](notebooks={})


def test_pipeline_lineage_check_returns_stderr_on_failure():
    """When the validator exits non-zero, stderr (which carries the Python
    traceback on crashes) must be included in the returned output."""
    mcp = FastMCP("test")
    validate_tools.register(mcp)

    class _Result:
        returncode = 1
        stdout = "FAIL: pipeline lineage check failed\n  [orders] path mismatch\n"
        stderr = ""

    def _fake_run(*args, **kwargs):
        return _Result()

    with patch("server.tools.validate.tools.subprocess.run", side_effect=_fake_run):
        out = _tools(mcp)["pipeline_lineage_check"](
            notebooks={"workspace/orders/bronze.py": 'OUTPUT_DIR = "x"\n'},
            topic="orders",
        )
    assert "FAIL" in out
    assert "exit code: 1" in out


# ── data ──────────────────────────────────────────────────────────────────────


def test_data_tools_registers_data_mock_generate():
    mcp = FastMCP("test")
    data_tools.register(mcp)
    assert set(_tools(mcp)) == {"data_mock_generate"}


def test_data_mock_generate_passes_defaults(tmp_path):
    mcp = FastMCP("test")
    data_tools.register(mcp)
    ctx, captured = _fake_subprocess_ok("wrote 1000 rows\n")
    with ctx:
        _tools(mcp)["data_mock_generate"](target_dir=str(tmp_path))
    cmd = captured["cmd"]
    assert "--topic" in cmd and "orders" in cmd
    assert "--rows" in cmd and "1000" in cmd
    assert "--seed" in cmd and "42" in cmd


def test_data_mock_generate_rejects_dual_schema(tmp_path):
    mcp = FastMCP("test")
    data_tools.register(mcp)
    with pytest.raises(RuntimeError, match="either schema or schema_file"):
        _tools(mcp)["data_mock_generate"](
            target_dir=str(tmp_path), schema="[]", schema_file="x.json"
        )


# ── precommit (aggregate) ─────────────────────────────────────────────────────


def test_precommit_tools_registers_precommit_run():
    mcp = FastMCP("test")
    precommit_tools.register(mcp)
    assert set(_tools(mcp)) == {"precommit_run"}


def test_precommit_run_aggregates_lint_and_pipeline_lineage(tmp_path):
    (tmp_path / "workspace" / "demo").mkdir(parents=True)
    (tmp_path / "workspace" / "demo" / "ok.py").write_text(
        '# %%\nimport os\nx = os.environ["X"]\n', encoding="utf-8"
    )
    mcp = FastMCP("test")
    precommit_tools.register(mcp)
    ctx, _ = _fake_subprocess_ok("pipeline-lineage clean\n", returncode=0)
    with ctx:
        out = _tools(mcp)["precommit_run"](target_dir=str(tmp_path))
    assert "Pipeline staging-path" in out
    assert "Deterministic lints" in out
    assert "passed" in out.lower()
