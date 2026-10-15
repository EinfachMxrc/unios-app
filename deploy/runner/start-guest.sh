#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail
test "$(hostname)" = unios-runner
test "$(id -u)" = 0
test -f /sys/fs/cgroup/memory/memory.limit_in_bytes
if curl --max-time 3 --silent --output /dev/null https://example.com; then
    echo 'Outbound network is available; refusing execution service startup.' >&2
    exit 1
fi
cd /opt/judge0
docker-compose up -d
echo 'Judge0 started inside the restricted guest.'
