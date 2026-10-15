# SPDX-License-Identifier: AGPL-3.0-or-later

"""The contract gate must not read a user's environment or study profile."""

import os
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize("factory_only", ["true", "false"])
def test_schema_check_ignores_dotenv_and_local_profile(tmp_path, factory_only):
    # Invalid settings would abort generation if the private file were consulted.
    (tmp_path / ".env").write_text("HOST_HEARTBEAT_SECONDS=not-a-number\n")
    local = tmp_path / "local"
    local.mkdir()
    (local / "institution.json").write_text("invalid-profile")
    private_database = local / "must-not-open.sqlite3"
    private_database.write_bytes(b"synthetic invalid private database")
    private_files = {path.name: path.read_bytes() for path in local.iterdir()}
    script = Path(__file__).resolve().parents[1] / "scripts" / "export_openapi.py"
    result = subprocess.run(
        [sys.executable, str(script), "--check"],
        cwd=tmp_path,
        env={**os.environ, "UNIOS_FACTORY_ONLY": factory_only, "SERVER_MODE": "true",
             "HOST_HEARTBEAT_SECONDS": "not-a-number", "LOCAL_DIR": str(local),
             "DATA_DIR": str(tmp_path / "data"), "DATABASE_URL": f"sqlite:///{private_database}"},
        capture_output=True,
        check=False,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert "OpenAPI-Schema aktuell" in result.stdout
    assert not (tmp_path / "data").exists()
    assert {path.name: path.read_bytes() for path in local.iterdir()} == private_files
