#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Dedicated receive-only mailbox. Run only on a VPS without an existing MTA.
set -euo pipefail
umask 077
domain=${1:?Dedicated mail hostname required}
mode=${2:-prepare}
[[ $(id -u) == 0 && "$domain" =~ ^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$ ]]
[[ "$mode" == prepare || "$mode" == activate ]]
root=/opt/unios
marker=/etc/postfix/unios-receiver.marker
mailbox="$root/state/local/mailbox"
if [[ "$mode" == prepare ]]; then
  if command -v postconf >/dev/null && [[ ! -f "$marker" ]]; then
    echo 'An existing mail service must not be replaced.' >&2
    exit 1
  fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends postfix certbot
  postconf -e 'inet_interfaces=loopback-only' 'inet_protocols=ipv4'
  systemctl restart postfix
  [[ ! -f "$marker" || $(cat "$marker") == "$domain" ]]
  if [[ ! -f "$marker" ]]; then
    install -d -m 700 "$root/mail-config-backups"
    cp -a /etc/postfix/main.cf "$root/mail-config-backups/main.cf.original"
    cp -a /etc/postfix/master.cf "$root/mail-config-backups/master.cf.original"
    printf '%s\n' "$domain" > "$marker"
  fi
  for path in "$mailbox" "$mailbox/inbox" "$mailbox/inbox/new" "$mailbox/inbox/cur" "$mailbox/inbox/tmp"; do
    [[ ! -L "$path" ]]
    install -d -m 700 "$path"
    chown 10001:10001 "$path"
  done
  printf 'eingang@%s inbox/\n' "$domain" > /etc/postfix/unios-mailboxes
  postmap /etc/postfix/unios-mailboxes
  postconf -e "myhostname=$domain" 'mydestination=' 'recipient_delimiter=' 'inet_interfaces=loopback-only' \
    'inet_protocols=ipv4' 'mynetworks=127.0.0.0/8' 'relay_domains=' \
    "virtual_mailbox_domains=$domain" 'virtual_mailbox_maps=hash:/etc/postfix/unios-mailboxes' \
    "virtual_mailbox_base=$mailbox" 'virtual_uid_maps=static:10001' 'virtual_gid_maps=static:10001' \
    'virtual_minimum_uid=10001' 'virtual_alias_maps=' \
    'smtpd_relay_restrictions=reject_unauth_destination' 'smtpd_recipient_restrictions=reject_unlisted_recipient' \
    'smtpd_sasl_auth_enable=no' 'default_transport=error:UniOS receives mail only' \
    'relay_transport=error:UniOS receives mail only' 'smtpd_tls_security_level=encrypt' \
    "smtpd_tls_cert_file=/etc/letsencrypt/live/$domain/fullchain.pem" \
    "smtpd_tls_key_file=/etc/letsencrypt/live/$domain/privkey.pem" \
    'smtpd_tls_mandatory_protocols=>=TLSv1.2' 'smtpd_tls_mandatory_ciphers=high' \
    'message_size_limit=8388608' 'smtpd_client_connection_count_limit=10' \
    'smtpd_client_message_rate_limit=30' 'smtpd_client_recipient_rate_limit=30' \
    'smtpd_recipient_limit=1' 'smtpd_banner=$myhostname ESMTP' 'disable_vrfy_command=yes'
  systemctl restart postfix
  python3 - "$domain" <<'PY'
import json, os, sys
from pathlib import Path
p=Path('/opt/unios/state/local/mail-forwarding-server-connection.json')
if p.is_symlink(): raise SystemExit('Invalid mailbox configuration path')
if not p.exists():
    fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as stream: json.dump({'address':'eingang@'+sys.argv[1],'ready':False},stream)
    os.chown(p,10001,10001)
PY
  echo 'Mailbox prepared; not yet accepting public mail.'
else
  [[ -f "$marker" && $(cat "$marker") == "$domain" ]]
  certificate="/etc/letsencrypt/live/$domain/fullchain.pem"
  [[ -f "$certificate" ]]
  openssl x509 -in "$certificate" -checkend 604800 -noout
  openssl x509 -in "$certificate" -checkhost "$domain" -noout
  postconf -e 'inet_interfaces=all'
  postfix check
  systemctl restart postfix
  ufw allow 25/tcp comment 'UniOS receive-only mail'
  python3 - <<'PY'
import json, os
from pathlib import Path
p=Path('/opt/unios/state/local/mail-forwarding-server-connection.json')
if p.is_symlink(): raise SystemExit('Invalid mailbox configuration path')
data=json.loads(p.read_text())
# Keep readiness false until an administrator verifies public SMTP reception.
data['ready']=data.get('ready') is True
tmp=p.with_name(p.name+'.ready')
fd=os.open(tmp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
with os.fdopen(fd,'w') as stream: json.dump(data,stream)
os.chown(tmp,10001,10001); os.replace(tmp,p)
PY
  install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
  printf '#!/bin/sh\n# SPDX-License-Identifier: AGPL-3.0-or-later\npostfix reload\n' > /etc/letsencrypt/renewal-hooks/deploy/unios-postfix
  chmod 755 /etc/letsencrypt/renewal-hooks/deploy/unios-postfix
  install -m 700 "$(dirname "$0")/renew-mail.sh" "$root/renew-mail.sh"
  cat > /etc/systemd/system/unios-mail-renew.service <<'UNIT'
[Unit]
Description=Renew the dedicated UniOS mail certificate
After=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/unios/renew-mail.sh
TimeoutStartSec=300
UNIT
  cat > /etc/systemd/system/unios-mail-renew.timer <<'UNIT'
[Unit]
Description=Check the UniOS mail certificate daily

[Timer]
OnCalendar=*-*-* 04:00:00
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now unios-mail-renew.timer
  echo 'TLS listener activated. Verify external SMTP and mark readiness before enabling forwarding.'
fi
