# SPDX-License-Identifier: AGPL-3.0-or-later
"""Permit only the existing default and UniOS Docker bridges to the VM API."""

import ipaddress
import json
import os
import subprocess

assert os.geteuid() == 0
status = subprocess.check_output(['ufw', 'status'], text=True)
assert 'Status: active' in status
bridge = json.loads(subprocess.check_output(['ip', '-j', '-4', 'addr', 'show', 'docker0']))
address = next(info['local'] for info in bridge[0]['addr_info'] if info['family'] == 'inet')
assert ipaddress.IPv4Address(address).is_private
for name in ('bridge', 'unios_default'):
    network = json.loads(subprocess.check_output(['docker', 'network', 'inspect', name]))[0]
    assert network['Driver'] == 'bridge'
    interface = network['Options'].get('com.docker.network.bridge.name') or 'br-' + network['Id'][:12]
    subnets = [ipaddress.ip_network(row['Subnet']) for row in network['IPAM']['Config']]
    for subnet in subnets:
        if subnet.version == 4:
            assert subnet.is_private
            subprocess.run(['ufw', 'allow', 'in', 'on', interface, 'from', str(subnet),
                            'to', address, 'port', '2358', 'proto', 'tcp', 'comment', 'UniOS private runner'],
                           check=True)
print('Private bridge rules installed; no public port rule added.')
