// SPDX-License-Identifier: AGPL-3.0-or-later

export default {
  "failureTitle": "Couldn't load data",
  "failureGenericDetail": "Please try again. If the problem persists, check the connection in Settings.",
  "syncNeverTitle": "No usable university sync yet",
  "syncOverdueTitle": "University sync is overdue",
  "syncCurrentTitle": "Sync is up to date again",
  "syncNeverDescription": "Start the sync and then check the connector status.",
  "syncOverdueDescription": "The last usable university sync was {{hours}} hours ago. New content and deadlines might be missing.",
  "syncRecoveredDescription": "Synced successfully again after a {{hours}}-hour gap.",
  "status": {
    "success": "Successful",
    "ok": "OK",
    "warning": "Warning",
    "error": "Error",
    "running": "Running",
    "paused": "Paused",
    "unknown": "Unclear",
    "not_configured": "Not set up"
  }
} as const
