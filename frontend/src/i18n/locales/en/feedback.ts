// SPDX-License-Identifier: AGPL-3.0-or-later

export default {
  openIssue: 'Open report on GitHub',
  githubHint:
    'GitHub opens a draft with your description. Review and submit it there yourself (you need a GitHub account). Diagnostic data is not transferred.',
  goalLabel: 'What were you trying to do?',
  goalPlaceholder: 'Briefly describe your goal.',
  attachDiagnostics: 'Include diagnostics in the downloaded file',
  panelTitle: 'Alpha feedback',
  intro: 'What held you up? A short report helps us more than a technical error message.',
  kindGroupAria: 'Kind of feedback',
  reportProblemButton: 'Report a problem',
  suggestImprovementButton: 'Suggest an improvement',
  affectedPagePrefix: 'Affected page: {{page}}',
  descriptionLabel: 'Your description',
  problemPlaceholder: 'What were you trying to do, and what happened?',
  ideaPlaceholder: 'What would help you in everyday student life?',
  saveReportButton: 'Download report',
  creatingDiagnosticsButton: 'Creating diagnostics …',
  createDiagnosticsButton: 'Create diagnostics',
  privacyNote:
    'Reports are only saved on your device here. The diagnostics include version and state information, no note contents, PDFs, names, or tokens.',
  emptyMessageWarning: "Please briefly describe what happened or what you'd like.",
  reportSaved: 'Report downloaded, not sent. Open the GitHub draft and attach the reviewed file there.',
  diagnosticsSaved: 'Diagnostics saved. Review the file before sharing it.',
  diagnosticsFailed: "The diagnostics couldn't be created right now.",
} as const
