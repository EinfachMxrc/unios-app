// SPDX-License-Identifier: AGPL-3.0-or-later
export default {
  title: 'Text index', description: 'The text index makes this document searchable. The original file is retained.',
  reextract: 'Rebuild text index', cancel: 'Cancel processing', confirm: 'Confirm', back: 'Back',
  confirmDescription: 'Processing runs in the background. Cancelling keeps the previous index intact.',
  progress: 'Reading text · {{completed}} / {{total}} pages', cancelled: 'Processing cancelled.',
  completed: 'Text index updated.', failed: 'Text could not be read. You can retry processing.',
} as const
