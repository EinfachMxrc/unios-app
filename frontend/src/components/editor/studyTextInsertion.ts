// SPDX-License-Identifier: AGPL-3.0-or-later

export type StudyTextSelection = { from: number; to: number; source: string }
export function studyTextSelection(source: string, from: number, to: number): StudyTextSelection {
  const start = Math.min(source.length, Math.max(0, from))
  return { source, from: start, to: Math.min(source.length, Math.max(start, to)) }
}
export function insertStudyText(
  current: string,
  selection: StudyTextSelection,
  text: string,
  maxLength: number,
): { body: string; caret: number } | 'changed' | 'long' {
  if (current !== selection.source) return 'changed'
  const body = current.slice(0, selection.from) + text + current.slice(selection.to)
  return body.length > maxLength ? 'long' : { body, caret: selection.from + text.length }
}
