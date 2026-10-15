# SPDX-License-Identifier: AGPL-3.0-or-later
"""Recovery configuration cannot inherit broken connector or secret settings."""

from pathlib import Path

from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

from app.config import Settings


class RecoverySettings(Settings):
    model_config = SettingsConfigDict(env_file=None, extra='ignore')

    @classmethod
    def settings_customise_sources(cls, settings_cls: type[BaseSettings],
                                   init_settings: PydanticBaseSettingsSource,
                                   env_settings: PydanticBaseSettingsSource,
                                   dotenv_settings: PydanticBaseSettingsSource,
                                   file_secret_settings: PydanticBaseSettingsSource
                                   ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (init_settings,)


def recovery_settings(home: Path, dist: Path, *, server: bool = False,
                      allowed_hosts: str = '127.0.0.1,localhost,[::1]') -> Settings:
    return RecoverySettings(data_dir=home / 'data', local_dir=home / 'local',
                            react_dist_dir=dist, server_mode=server, allowed_hosts=allowed_hosts,
                            moodle_enabled=False, automatic_takeover_enabled=False)
