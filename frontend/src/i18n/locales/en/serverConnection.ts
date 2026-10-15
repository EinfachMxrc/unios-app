// SPDX-License-Identifier: AGPL-3.0-or-later
export default {
  title: 'Your UniOS server',
  welcome: 'Set up UniOS',
  heading: 'Your studies on every device',
  description:
    'Your server keeps materials, events and notes up to date. This app connects to it and keeps drafts on this device.',
  address: 'Server address',
  code: 'Device code',
  codeHint:
    'Get a one-time code from your server or from Settings → Devices on an already connected device. It expires after ten minutes.',
  connect: 'Connect',
  connecting: 'Connecting …',
  paired: 'Paired with your server',
  offlineHint:
    'Previously loaded views and note drafts remain available when disconnected. New changes are checked and sent after reconnecting.',
  renew: 'Pair this device again',
  invalidCode: 'The device code is invalid or expired. Please use a new code.',
  unavailable: 'Your server is unreachable. Please check the address and connection.',
  bindingError: 'Pairing could not be stored safely. Local drafts must not be mixed with a different server.',
  keyringUnavailable: 'The secure keychain on this device is unavailable.',
  deviceLabel: 'UniOS Desktop',
  cancel: 'Cancel',
} as const
