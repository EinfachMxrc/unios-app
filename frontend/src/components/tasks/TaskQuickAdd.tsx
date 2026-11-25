// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useT } from '@/i18n/useT'
import { createTask } from '@/lib/tasks'
import { randomId } from '@/lib/uuid'
import { useWorkspaceState } from '@/lib/workspaceState'
import type { CoursesResponse } from '@/types'
import './Tasks.css'

// One object, so an empty draft keeps the same identity between renders.
const EMPTY_DRAFT = { id: '', title: '' }

/** One line to write a task down. The text stays until the server has it. */
export function TaskQuickAdd({
  defaultDue = '',
  withCourse = false,
  inputId,
}: {
  defaultDue?: string
  withCourse?: boolean
  inputId?: string
}) {
  const { t } = useT('tasks')
  const canWrite = useWritableHost()
  const { data: courses } = useApi<CoursesResponse>('/api/courses', { enabled: withCourse })
  // The id travels with the draft: a retry of the same text reaches the server
  // under the same id, even after leaving the page.
  const [draft, setDraft] = useWorkspaceState('tasks:draft', EMPTY_DRAFT)
  const title = draft.title
  const [due, setDueValue] = useState(defaultDue)
  const [course, setCourseValue] = useState('')
  const setTitle = (value: string) => setDraft({ id: value ? randomId() : '', title: value })
  const renew = () => setDraft((current) => ({ ...current, id: randomId() }))
  const setDue = (value: string) => {
    setDueValue(value)
    renew()
  }
  const setCourse = (value: string) => {
    setCourseValue(value)
    renew()
  }
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')

  async function submit() {
    if (!title.trim() || busy) return
    setBusy(true)
    setFailure('')
    const sent = draft.id || randomId()
    if (!draft.id) setDraft({ id: sent, title })
    try {
      await createTask({
        id: sent,
        title: title.trim(),
        due_on: due || null,
        course_id: course ? Number(course) : null,
      })
      // Anything typed while this was saving is the next task and stays.
      setDraft((current) => (current.id === sent ? EMPTY_DRAFT : current))
      setDueValue(defaultDue)
    } catch (cause) {
      setFailure(t('failed', { reason: extractApiErrorMessage(cause) }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="task-add"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Plus size={15} aria-hidden="true" />
      <input
        id={inputId}
        className="task-add-title"
        aria-label={t('addLabel')}
        placeholder={t('addPlaceholder')}
        maxLength={300}
        value={title}
        disabled={!canWrite}
        title={canWrite ? undefined : t('readOnly')}
        onChange={(event) => setTitle(event.target.value)}
      />
      {title.trim() && (
        <>
          <input type="date" aria-label={t('dueLabel')} value={due} onChange={(event) => setDue(event.target.value)} />
          {withCourse && (
            <select aria-label={t('courseLabel')} value={course} onChange={(event) => setCourse(event.target.value)}>
              <option value="">{t('noCourse')}</option>
              {courses?.courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.display_name || item.name}
                </option>
              ))}
            </select>
          )}
          <Button type="submit" size="sm" disabled={!canWrite || busy}>
            {t('add')}
          </Button>
        </>
      )}
      {failure && (
        <p role="alert" className="task-error">
          {failure}
        </p>
      )}
    </form>
  )
}
