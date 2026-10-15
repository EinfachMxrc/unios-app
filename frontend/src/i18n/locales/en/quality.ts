// SPDX-License-Identifier: AGPL-3.0-or-later
export default {
pagination: 'List pages', previousPage: 'Previous', nextPage: 'Next', pageRange: '{{start}}–{{end}} of {{total}}',
versionHistory: 'Earlier versions', noPreviousVersions: 'No earlier versions',
required: 'Required', retry: 'Reload data', connection: 'Check connection', loading: 'Loading data',
focus: 'Focus mode', exitFocus: 'Exit focus', density: 'Spacing', comfortable: 'Comfortable', compact: 'Compact',
clearFilters: 'Reset filters', preview: 'Preview', closePreview: 'Close preview',
lastChecked: 'Last checked: {{date}}', offlineDetails: 'What works offline?',
offlineCapabilities: 'You can open previously loaded content and locally available files. Note drafts stay on this device. Card ratings are stored locally and uploaded later. Bookings, submissions and new data require a connection.', invalidCalendar: 'Please enter a complete HTTPS calendar URL.',
searchHint: 'Enter searches. Filters narrow down the results.', documentPreview: 'Source excerpt', openSource: 'Open source',
newNote: 'Create note', saving: 'Saving', saved: 'Saved', local: 'Saved locally', conflict: 'Review changes',
noiseSummary: 'This preview contains {{count}} material notifications. All notifications remain available under Activity.',
firstReaderHint: 'Search the document, select text or enter a page number directly.', dismissHint: 'Dismiss hint',
whyThis: 'Why this suggestion?', dueReason: 'Anki plans {{count}} for study today. Your selected deck determines which cards are available now.', practiceReason: '{{count}} exercises are available. Choose a suitable task.', deadlineReason: 'This assignment is listed in your upcoming deadlines.', startReason: 'No cards or exercises are due yet. You can prepare a study deck here.'
} as const
