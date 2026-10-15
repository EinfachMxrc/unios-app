#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Run on the operator host after install-guest.sh has completed in the guest.
set -euo pipefail
test "$(id -u)" = 0
root=/opt/unios-runner-vm
unit=/etc/systemd/system/unios-runner-vm.service
test -f "$unit"
test ! -e "$root/before-network-restriction.service"
cp "$unit" "$root/before-network-restriction.service"
ssh -i "$root/admin" -p 23222 -o UserKnownHostsFile="$root/guest-known-hosts" -o StrictHostKeyChecking=yes runneradmin@127.0.0.1 'sudo poweroff' || true
for attempt in $(seq 1 30); do
    if ! systemctl is-active --quiet unios-runner-vm; then break; fi
    sleep 1
done
if systemctl is-active --quiet unios-runner-vm; then echo 'Guest has not shut down; refusing live configuration change.' >&2; exit 1; fi
python3 - <<'PY'
from pathlib import Path
p = Path('/etc/systemd/system/unios-runner-vm.service')
s = p.read_text()
assert '-netdev user,id=net,hostfwd=' in s
s = s.replace('-netdev user,id=net,hostfwd=', '-netdev user,id=net,restrict=on,hostfwd=')
s = s.replace('# Bootstrap only: replaced with restrict=on before any learner submission.', '# No outbound network; only explicit loopback host forwards.')
p.write_text(s)
PY
systemctl daemon-reload
systemctl start unios-runner-vm
echo 'VM started with restricted networking. Start Judge0 only after checking the guest cgroup version.'
