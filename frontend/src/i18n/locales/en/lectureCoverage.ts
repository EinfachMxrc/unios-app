// SPDX-License-Identifier: AGPL-3.0-or-later
export default {
  title: 'Covered today',
  description: 'Record the date and PDF pages covered in this lecture. Your own note text can remain empty.',
  source: 'Source for this lecture',
  chooseSource: 'Choose PDF',
  noSources: 'Open a course PDF to record its covered pages beside your lecture note.',
  sourcesPartial:
    'The loaded course files are shown here. Open another PDF in its course to record pages beside a note.',
  version: 'Version {{version}}',
  date: 'Lecture date',
  pages: 'Covered PDF pages',
  pagesHint: 'Page numbers in the PDF, not printed slide numbers. Example: 5-12, 18. PDF pages: {{count}}.',
  record: 'Record pages',
  copy: 'Copy prompt for GPT',
  recorded: 'Page references added to the note. Save a new note to keep them permanently.',
  copied: 'Page references added and prompt copied. Use it in GPT with your shared sources.',
  copyFailed: 'Page references are kept. The prompt could not be copied to the clipboard.',
  error_date: 'Choose a valid lecture date.',
  error_pages: 'Enter pages, for example 5-12, 18.',
  error_range: 'Pages must exist in the open PDF and ranges must be ascending.',
  error_limit: 'Record at most 200 PDF pages per lecture.',
  error_document: 'The page references exceed this note’s size limit or its source is incomplete.',
} as const
