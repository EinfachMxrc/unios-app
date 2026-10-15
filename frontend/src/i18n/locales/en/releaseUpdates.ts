// SPDX-License-Identifier: AGPL-3.0-or-later
export default {
  title: 'Update UniOS',
  intro: 'Choose which reviewed releases you want to receive. Nothing installs automatically.',
  channel: 'Update channel',
  stable: 'Stable',
  beta: 'Beta preview',
  nightly: 'Nightly builds',
  stableHelp: 'For everyday use. Reviewed stable releases only.',
  betaHelp: 'Preview releases for testing. Keep a full backup as well.',
  nightlyHelp: 'Experimental development builds. Use a separate test dataset.',
  check: 'Check for updates',
  install: 'Back up and install update',
  checking: 'Checking version and compatibility …',
  available: 'Version {{version}} is available.',
  current: 'No newer compatible version found.',
  unavailable: 'This channel is currently unavailable or this build does not support signed updates.',
  incompatible:
    'This update does not match the app version or server schema. Update to a supported server version first.',
  failed: 'The update was not installed. Check the connection and backup, then check for updates again.',
  preparing: 'Creating and verifying a snapshot. The signed update starts afterwards.',
  schema: 'This package expects a different schema version. Schema downgrades are never performed automatically.',
  policy:
    'A fresh snapshot is verified before every installation. The signature and signed package version are checked; experimental channels never enable automatic downgrades.',
  notes: 'Changes',
} as const
