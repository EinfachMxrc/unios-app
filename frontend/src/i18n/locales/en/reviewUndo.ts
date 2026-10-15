// SPDX-License-Identifier: AGPL-3.0-or-later

export default {
  undo: 'Undo last rating',
  undoHint: 'Z · Undo',
  undone: 'Rating undone. You can rate the answer again.',
  failed: 'The rating could not be undone. {{reason}}',
  newerReview: 'A newer rating already exists. Only the last rating can be undone.',
  identityMismatch: 'The undo receipt belongs to a different rating.',
  unavailable: 'The rating remains saved. After a newer change or a restart it can no longer be undone.',
} as const
