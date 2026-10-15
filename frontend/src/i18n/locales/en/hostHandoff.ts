// SPDX-License-Identifier: AGPL-3.0-or-later

export default {
  "prepareHandoffButton": "Prepare handoff",
  "releasedTitle": "Baton released",
  "releasedTextPrefix": "This device now only reads. Once Syncthing has fully synced, the other device can take over with",
  "releasedTextSuffix": ".",
  "dialogTitle": "Release the baton?",
  "dialogIntro": "Only continue if the second host device is set up. UniOS checks the Syncthing sync, waits for ongoing writes and creates a final database snapshot. After that this device becomes read-only.",
  "dialogHintPrefix": "To take over, the other device must stop its UniOS service and then run",
  "dialogHintSuffix": ".",
  "errorTitle": "Handoff not possible",
  "cancelButton": "Cancel",
  "checkingButton": "Checking and saving…",
  "releaseButton": "Release the baton"
} as const
