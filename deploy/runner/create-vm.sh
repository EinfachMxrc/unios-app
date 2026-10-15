#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Dedicated KVM guest. No application data, host shares or Docker socket inside it.
set -euo pipefail
umask 077
root=/opt/unios-runner-vm
test "$(id -u)" = 0
test -c /dev/kvm
if test -e "$root"; then echo 'Runner directory already exists; refusing replacement.' >&2; exit 1; fi
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends qemu-system-x86 qemu-utils cloud-image-utils curl openssh-client
useradd --system --home-dir "$root" --shell /usr/sbin/nologin unios-runner
usermod -a -G kvm unios-runner
install -d -m 700 -o unios-runner -g unios-runner "$root"
cd "$root"
ssh-keygen -q -t ed25519 -N '' -f admin
curl --fail --silent --show-error -O https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img
curl --fail --silent --show-error -O https://cloud-images.ubuntu.com/jammy/current/SHA256SUMS
awk '$2=="*jammy-server-cloudimg-amd64.img" || $2=="jammy-server-cloudimg-amd64.img"' SHA256SUMS | sha256sum --check --status
mv jammy-server-cloudimg-amd64.img base.img
qemu-img create -q -f qcow2 -F qcow2 -b "$root/base.img" guest.qcow2 20G
printf 'instance-id: unios-runner-v1\nlocal-hostname: unios-runner\n' > meta-data
printf '#cloud-config\nssh_pwauth: false\ndisable_root: true\nusers:\n  - name: runneradmin\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    shell: /bin/bash\n    lock_passwd: true\n    ssh_authorized_keys:\n      - %s\n' "$(cat admin.pub)" > user-data
cloud-localds seed.img user-data meta-data
chown -R unios-runner:unios-runner "$root"
chmod 600 "$root"/*
cat > /etc/systemd/system/unios-runner-vm.service <<'UNIT'
[Unit]
Description=UniOS isolated coding runner VM
After=network.target
[Service]
User=unios-runner
Group=unios-runner
SupplementaryGroups=kvm
WorkingDirectory=/opt/unios-runner-vm
# Bootstrap only: replaced with restrict=on before any learner submission.
ExecStart=/usr/bin/qemu-system-x86_64 -enable-kvm -machine q35 -cpu host -m 2048 -smp 2 -drive file=guest.qcow2,if=virtio,format=qcow2 -drive file=seed.img,format=raw,media=cdrom,readonly=on -netdev user,id=net,hostfwd=tcp:127.0.0.1:23222-:22,hostfwd=tcp:127.0.0.1:2358-:2358 -device virtio-net-pci,netdev=net -display none -serial file:console.log -monitor none -no-reboot
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/unios-runner-vm
DevicePolicy=closed
DeviceAllow=/dev/kvm rw
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
LockPersonality=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now unios-runner-vm
echo 'VM bootstrap started. API is not yet configured or authorized for learner code.'
