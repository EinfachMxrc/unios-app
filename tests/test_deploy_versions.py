# SPDX-License-Identifier: AGPL-3.0-or-later

"""The server image tag in every deploy file follows the application version."""

import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_server_deploy_files_use_the_current_version_as_default_image_tag():
    version = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))["project"]["version"]
    for name in ("compose.yaml", "compose.mcp.yaml", "provision.sh"):
        text = (ROOT / "deploy" / "server" / name).read_text(encoding="utf-8")
        assert not re.search(r"unios-server:\d", text), f"{name} pins a literal image tag"
        assert "${UNIOS_VERSION:-" + version + "}" in text, f"{name} default tag differs from {version}"
