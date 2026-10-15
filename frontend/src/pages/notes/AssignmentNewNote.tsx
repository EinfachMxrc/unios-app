// SPDX-License-Identifier: AGPL-3.0-or-later
import { useApi } from '@/api'
import { Failure, Loading } from '@/components/State'
import { useT } from '@/i18n/useT'
import type { CourseDetail, NotesResponse } from '@/types'
import { NewNote } from './NewNote'

/** Prepare an editable solution; merely opening it never creates or submits anything. */
export function AssignmentNewNote({
  assignmentId,
  courseId,
  data,
  onCreated,
}: {
  assignmentId: number
  courseId: number
  data: NotesResponse
  onCreated: (id: string) => void
}) {
  const { t } = useT('notes')
  const { data: course, error, loading } = useApi<CourseDetail>(`/api/courses/${courseId}`)
  const assignment = course?.assignments.find((item) => item.id === assignmentId && !item.removed_upstream)
  if (loading && !course) return <Loading />
  if (error || !assignment) return <Failure message={error ?? t('assignmentMissing')} />
  // Quote imported prose literally: source text cannot create extra callout directives.
  const quote = assignment.description
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  const initialBody =
    `[${t('assignmentCurrentSource')}](/courses/${courseId}#assignment-${assignmentId})\n\n` +
    `## ${t('assignmentTask')}\n\n${quote || t('assignmentReadSource')}\n\n` +
    `## ${t('assignmentSolution')}\n\n\n## ${t('assignmentCheck')}\n\n\n` +
    `:::callout {kind="question"}\n\n${t('assignmentQuestions')}\n\n:::\n`
  return (
    <div className="assignment-note-workspace">
      <p className="muted-text">{t('assignmentWorkHint')}</p>
      <NewNote
        data={data}
        courseId={courseId}
        resourceId={null}
        suggestedTitle={t('assignmentWorkTitle', { title: assignment.title }).slice(0, 200)}
        initialBody={initialBody}
        onCreated={onCreated}
      />
    </div>
  )
}
