# SPDX-License-Identifier: AGPL-3.0-or-later

"""Export the backend API contract; --check fails for stale committed schemas."""

import argparse
import json
import os
import sys
from functools import lru_cache
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
# Contract generation must not consult a local Keychain or require a built UI.
os.environ["MOODLE_ENABLED"] = "false"
os.environ["SERVE_REACT"] = "false"
os.environ["UNIOS_FACTORY_ONLY"] = "true"
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

from app import config


class _ContractSettings(config.Settings):
    model_config = SettingsConfigDict(
        env_file=None, env_file_encoding="utf-8", extra="ignore"
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # A caller's DATABASE_URL or SERVER_MODE must not select a real profile.
        return (init_settings,)


# API schemas need no private environment, keychain or existing study profile.
# Keep the isolated settings alive until schema generation and checking finish.
_contract_directory = TemporaryDirectory(prefix="unios-openapi-")
_contract_settings = _ContractSettings(
    moodle_enabled=False,
    moodle_token="",
    serve_react=False,
    server_mode=False,
    ntfy_url="",
    data_dir=Path(_contract_directory.name) / "data",
    local_dir=Path(_contract_directory.name) / "local",
)


@lru_cache
def _get_contract_settings() -> config.Settings:
    return _contract_settings


config.get_settings = _get_contract_settings
from app.main import create_app

app = create_app(_contract_settings, connectors=[], start_scheduler=False)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    target = Path(__file__).resolve().parents[1] / "frontend" / "openapi.json"
    content = (
        json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    if args.check:
        if not target.is_file() or target.read_text(encoding="utf-8") != content:
            print(
                "frontend/openapi.json ist veraltet; scripts/export_openapi.py ausführen"
            )
            return 1
        print("OpenAPI-Schema aktuell")
        return 0
    target.write_text(content, encoding="utf-8")
    print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
