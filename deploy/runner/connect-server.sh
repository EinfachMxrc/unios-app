#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Proxy the API from the existing private Docker bridge into host loopback.
set -euo pipefail
umask 077
test "$(id -u)" = 0
root=/opt/unios-runner-vm
unit=/etc/systemd/system/unios-runner-vm.service
test -f "$root/before-network-restriction.service"
test ! -e "$root/before-loopback-proxy.service"
test ! -e /etc/systemd/system/unios-runner-proxy.socket
test ! -e /etc/systemd/system/unios-runner-proxy.service
test -x /usr/lib/systemd/systemd-socket-proxyd
bridge=$(python3 - <<'PY'
import ipaddress
import json
import subprocess
rows = json.loads(subprocess.check_output(['ip', '-j', '-4', 'addr', 'show', 'docker0']))
addresses = [info['local'] for row in rows for info in row['addr_info'] if info['family'] == 'inet']
assert len(addresses) == 1
address = ipaddress.IPv4Address(addresses[0])
assert address.is_private and not address.is_loopback and not address.is_link_local
print(address)
PY
)
cp "$unit" "$root/before-loopback-proxy.service"
ssh -i "$root/admin" -p 23222 -o UserKnownHostsFile="$root/guest-known-hosts" -o StrictHostKeyChecking=yes runneradmin@127.0.0.1 'sudo poweroff' || true
systemctl stop unios-runner-vm
for attempt in $(seq 1 30); do
    if ! systemctl is-active --quiet unios-runner-vm; then break; fi
    sleep 1
done
if systemctl is-active --quiet unios-runner-vm; then echo 'Guest has not stopped.' >&2; exit 1; fi
python3 - "$bridge" <<'PY'
from pathlib import Path
import sys
p = Path('/etc/systemd/system/unios-runner-vm.service')
s = p.read_text()
assert 'restrict=on' in s and 'hostfwd=tcp:127.0.0.1:2358-:2358' in s
assert 'hostfwd=tcp:0.0.0.0:' not in s
s = s.replace(f',hostfwd=tcp:{sys.argv[1]}:2358-:2358', '')
if 'Wants=docker.service' not in s:
    s = s.replace('After=network.target', 'After=network.target docker.service\nWants=docker.service')
s = s.replace('Restart=on-failure', 'Restart=always')
p.write_text(s)
PY
cat > /etc/systemd/system/unios-runner-proxy.socket <<UNIT
[Unit]
Description=UniOS private runner API socket
[Socket]
# Bind the private address before docker0 exists; waiting for Docker here
# would create a sockets.target -> basic.target -> Docker ordering cycle.
FreeBind=yes
ListenStream=$bridge:2358
[Install]
WantedBy=sockets.target
UNIT
cat > /etc/systemd/system/unios-runner-proxy.service <<'UNIT'
[Unit]
Description=UniOS private runner loopback proxy
After=unios-runner-vm.service
Requires=unios-runner-vm.service
[Service]
ExecStart=/usr/lib/systemd/systemd-socket-proxyd --connections-max=32 --exit-idle-time=5min 127.0.0.1:2358
DynamicUser=yes
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
RestrictAddressFamilies=AF_INET AF_UNIX
UNIT
systemctl daemon-reload
systemctl start unios-runner-vm
systemctl enable --now unios-runner-proxy.socket
echo 'Runner API uses loopback; private Docker bridge clients reach a bounded local proxy.'
