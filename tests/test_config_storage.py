# SPDX-License-Identifier: AGPL-3.0-or-later

from pathlib import Path

from app.config import Settings


def test_live_database_resolves_inside_local_dir(tmp_path):
    settings = Settings(_env_file=None, data_dir=tmp_path / "shared", local_dir=tmp_path / "private")
    assert settings.database_url == f"sqlite:///{(tmp_path / 'private' / 'uni_os.sqlite3').resolve()}"
    assert Path(settings.database_url.removeprefix("sqlite:///")) == settings.local_dir / "uni_os.sqlite3"


def test_explicit_database_override_is_preserved(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'existing.sqlite3'}"
    settings = Settings(_env_file=None, local_dir=tmp_path / "private", database_url=database_url)
    assert settings.database_url == database_url


def test_empty_optional_ai_budget_in_example_config(tmp_path):
    settings = Settings(_env_file=None, local_dir=tmp_path, ai_adapter_monthly_budget_tokens="")
    assert settings.ai_adapter_monthly_budget_tokens is None
