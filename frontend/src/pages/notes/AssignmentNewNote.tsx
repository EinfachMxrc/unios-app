// SPDX-License-Identifier: AGPL-3.0-or-later
import { useApi } from '@/api'
import { Failure, Loading } from '@/components/State'
import { useT } from '@/i18n/useT'
import type { CourseDetail, NotesResponse } from '@/types'
import { heading, linkInline, newBlockId, paragraph, quote, serializeDoc } from '@/editor/doc'
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
  // Imported prose becomes literal quote blocks, so source text can never create structure.
  const quotes = assignment.description.split('\n').map((line) => quote(line))
  const initialBody = serializeDoc({
    version: 1,
    blocks: [
      paragraph([linkInline(t('assignmentCurrentSource'), `/courses/${courseId}#assignment-${assignmentId}`)]),
      heading(2, t('assignmentTask')),
      ...(assignment.description.trim() ? quotes : [paragraph(t('assignmentReadSource'))]),
      heading(2, t('assignmentSolution')),
      paragraph(''),
      heading(2, t('assignmentCheck')),
      paragraph(''),
      {
        id: newBlockId(),
        type: 'callout',
        props: { kind: 'question' },
        content: [],
        children: [paragraph(t('assignmentQuestions'))],
      },
    ],
  })
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
