# SPDX-License-Identifier: AGPL-3.0-or-later

import os
import subprocess
import sys

PROGRAM = """
import os
from pathlib import Path
from app.config import Settings
from app.host.lease import HostCoordinator

settings = Settings(_env_file=None, data_dir=Path(os.environ['TEST_SHARED']),
                    local_dir=Path(os.environ['TEST_LOCAL']))
host = HostCoordinator(settings)
if os.environ['TEST_MODE'] == 'owner':
    host.acquire_initial()
active = host.start()
print(active, flush=True)
if os.environ['TEST_MODE'] == 'owner':
    input()
host.close()
"""


def _environment(shared, local, mode):
    return {**os.environ, "TEST_SHARED": str(shared), "TEST_LOCAL": str(local), "TEST_MODE": mode}


def test_only_one_process_on_shared_data_can_be_host(tmp_path):
    shared = tmp_path / "shared"
    first_local = tmp_path / "first"
    second_local = tmp_path / "second"
    owner = subprocess.Popen([sys.executable, "-c", PROGRAM], env=_environment(shared, first_local, "owner"),
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    try:
        assert owner.stdout.readline().strip() == "True"
        same_device = subprocess.run([sys.executable, "-c", PROGRAM], env=_environment(shared, first_local, "standby"),
                                     capture_output=True, text=True, check=True, timeout=10)
        other_device = subprocess.run([sys.executable, "-c", PROGRAM], env=_environment(shared, second_local, "standby"),
                                      capture_output=True, text=True, check=True, timeout=10)
        assert same_device.stdout.strip() == "False"
        assert other_device.stdout.strip() == "False"
    finally:
        owner.communicate(input="\n", timeout=10)
    assert owner.returncode == 0
    resumed = subprocess.run([sys.executable, "-c", PROGRAM], env=_environment(shared, first_local, "standby"),
                             capture_output=True, text=True, check=True, timeout=10)
    assert resumed.stdout.strip() == "True"
