#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# HTTP validation opens port 80 only for the bounded certificate renewal.
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]]
exec 9>/run/unios-mail-renew.lock
flock -n 9 || exit 0
domain=$(cat /etc/postfix/unios-receiver.marker)
[[ "$domain" =~ ^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$ ]]
certificate="/etc/letsencrypt/live/$domain/fullchain.pem"
openssl x509 -in "$certificate" -checkhost "$domain" -noout
if openssl x509 -in "$certificate" -checkend 2592000 -noout; then
  exit 0
fi
opened=false
cleanup() {
  if [[ "$opened" == true ]]; then
    ufw --force delete allow 80/tcp
  fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
if ! ufw status | grep -q '^80/tcp '; then
  # Refuse to change other HTTP firewall rules or interfere with an existing web server.
  if ufw status | grep -Eq '^80(/|[[:space:]])' || ss -H -ltn 'sport = :80' | grep -q .; then
    echo 'HTTP certificate validation requires manual review.' >&2
    exit 1
  fi
  opened=true
  ufw allow 80/tcp comment 'Temporary UniOS certificate renewal'
fi
timeout --kill-after=10 240 certbot renew --cert-name "$domain" --non-interactive
openssl x509 -in "$certificate" -checkend 604800 -noout
postfix reload
