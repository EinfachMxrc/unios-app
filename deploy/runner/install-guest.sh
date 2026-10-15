#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Run inside the dedicated guest, never on the application host.
set -euo pipefail
umask 077
test "$(hostname)" = unios-runner
test "$(id -u)" = 0
test ! -e /opt/judge0
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose curl unzip
install -d -m 700 /opt/judge0
cd /opt/judge0
curl --fail --silent --show-error -L https://github.com/judge0/judge0/releases/download/v1.13.1/judge0-v1.13.1.zip -o source.zip
unzip -q source.zip
mv judge0-v1.13.1/* .
python3 - <<'PY'
from pathlib import Path
import secrets
p=Path('judge0.conf')
s=p.read_text()
values={'AUTHN_TOKEN': secrets.token_urlsafe(48), 'REDIS_PASSWORD': secrets.token_urlsafe(48),
        'POSTGRES_PASSWORD': secrets.token_urlsafe(48), 'ENABLE_NETWORK': 'false',
        'ALLOW_ENABLE_NETWORK': 'false', 'ENABLE_COMPILER_OPTIONS': 'false',
        'ENABLE_COMMAND_LINE_ARGUMENTS': 'false', 'ENABLE_BATCHED_SUBMISSIONS': 'false',
        'ENABLE_CALLBACKS': 'false', 'MAX_QUEUE_SIZE': '64'}
for key,value in values.items():
    lines=s.splitlines()
    found=False
    for index,line in enumerate(lines):
        if line.startswith(key+'='):
            lines[index]=key+'='+value
            found=True
    s='\n'.join(lines)+'\n'
    if not found: s+=key+'='+value+'\n'
p.write_text(s)
p.chmod(0o600)
# No operator or learner can invoke optional authorization callbacks.
PY
docker-compose pull --quiet
# The image runs as judge0, not root. Keep the bind-mounted secret file private
# while allowing exactly that container UID to read it.
runner_uid=$(docker run --rm --network none --entrypoint id judge0/judge0:1.13.1 -u judge0)
test "$runner_uid" = 1000
chown "$runner_uid":root judge0.conf
printf 'GRUB_CMDLINE_LINUX="$GRUB_CMDLINE_LINUX systemd.unified_cgroup_hierarchy=0"\n' > /etc/default/grub.d/99-judge0.cfg
update-grub > /dev/null
# API remains stopped until restricted host networking and a legacy-cgroup reboot.
echo 'Images downloaded; reboot and restrict VM networking before starting Judge0.'
