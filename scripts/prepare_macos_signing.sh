#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail

# Called only on an ephemeral macOS build runner. A partial signing setup is an error.
if [[ -z "${APPLE_CERTIFICATE:-}" ]]; then
  if [[ -n "${APPLE_CERTIFICATE_PASSWORD:-}${APPLE_SIGNING_IDENTITY:-}${APPLE_API_ISSUER:-}${APPLE_API_KEY:-}${APPLE_API_KEY_BASE64:-}" ]]; then
    echo 'Unvollständige macOS-Signierkonfiguration' >&2
    exit 1
  fi
  echo 'APPLE_SIGNING_IDENTITY=-' >> "$GITHUB_ENV"
  echo 'mode=adhoc' >> "$GITHUB_OUTPUT"
  exit 0
fi

for name in APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_BASE64; do
  if [[ -z "${!name:-}" ]]; then
    echo "Mac-Signierung erfordert $name" >&2
    exit 1
  fi
done

keychain="$RUNNER_TEMP/unios-build.keychain-db"
certificate="$RUNNER_TEMP/unios-developer-id.p12"
api_key="$RUNNER_TEMP/unios-notary-key.p8"
password="$(openssl rand -hex 24)"

printf '%s' "$APPLE_CERTIFICATE" | openssl base64 -d -A > "$certificate"
printf '%s' "$APPLE_API_KEY_BASE64" | openssl base64 -d -A > "$api_key"
chmod 600 "$certificate" "$api_key"
security create-keychain -p "$password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$password" "$keychain"
security import "$certificate" -k "$keychain" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$password" "$keychain"
security list-keychains -d user -s "$keychain"
security default-keychain -s "$keychain"
security find-identity -v -p codesigning "$keychain" | grep -F "$APPLE_SIGNING_IDENTITY" > /dev/null
rm -f "$certificate"

{
  echo "APPLE_SIGNING_IDENTITY=$APPLE_SIGNING_IDENTITY"
  echo "APPLE_API_ISSUER=$APPLE_API_ISSUER"
  echo "APPLE_API_KEY=$APPLE_API_KEY"
  echo "APPLE_API_KEY_PATH=$api_key"
} >> "$GITHUB_ENV"
echo 'mode=developer-id' >> "$GITHUB_OUTPUT"
