// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { request, useApi } from '@/api'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/editor/StudioDialog'
import { Button } from '@/components/ui/button'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useT } from '@/i18n/useT'
import { changeTask, TASKS_PATH, type Task, type TaskChanges, type TaskStatus, type TasksResponse } from '@/lib/tasks'
import type { CoursesResponse } from '@/types'
import { useStatusName } from './TaskRow'
import './Tasks.css'

export function TaskDialog({
  task,
  disabled,
  onClose,
  onDelete,
}: {
  task: Task
  disabled: boolean
  onClose: () => void
  onDelete: (task: Task) => void
}) {
  const { t } = useT('tasks')
  const statusName = useStatusName()
  const { data: courses } = useApi<CoursesResponse>('/api/courses')
  // The revision the draft was opened with: a later save elsewhere must surface as a conflict, not be overwritten.
  const [opened] = useState(task)
  const [revision, setRevision] = useState(task.revision)
  const [title, setTitle] = useState(opened.title)
  const [notes, setNotes] = useState(opened.notes)
  const [status, setStatus] = useState<TaskStatus>(opened.status)
  const [due, setDue] = useState(opened.due_on ?? '')
  const [course, setCourse] = useState(opened.course_id === null ? '' : String(opened.course_id))
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')

  async function save() {
    const next = {
      title: title.trim(),
      notes,
      status,
      due_on: due || null,
      course_id: course ? Number(course) : null,
    }
    const changes = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => opened[key as keyof typeof next] !== value),
    ) as TaskChanges
    if (!Object.keys(changes).length) return onClose()
    setBusy(true)
    setFailure('')
    try {
      await changeTask({ id: opened.id, revision }, changes)
      onClose()
    } catch (cause) {
      const reason = t('failed', { reason: extractApiErrorMessage(cause) })
      // Saved elsewhere meanwhile: saving again applies only the fields edited here.
      const newer = await request<TasksResponse>(TASKS_PATH)
        .then((list) => list.tasks.find((item) => item.id === opened.id))
        .catch(() => undefined)
      if (newer && newer.revision !== revision) {
        setRevision(newer.revision)
        setFailure(`${reason} ${t('saveAgain')}`)
      } else setFailure(reason)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent className="task-dialog">
        <DialogTitle>{t('editTitle')}</DialogTitle>
        <DialogDescription className="sr-only">{t('editDescription')}</DialogDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label className="task-field task-field-wide">
            <span>{t('titleLabel')}</span>
            <input value={title} maxLength={300} required onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="task-field">
            <span>{t('statusLabel')}</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
              {(['open', 'doing', 'done'] as const).map((value) => (
                <option key={value} value={value}>
                  {statusName(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="task-field">
            <span>{t('dueLabel')}</span>
            <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
          </label>
          <label className="task-field task-field-wide">
            <span>{t('courseLabel')}</span>
            <select value={course} onChange={(event) => setCourse(event.target.value)}>
              <option value="">{t('noCourse')}</option>
              {courses?.courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.display_name || item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="task-field task-field-wide">
            <span>{t('notesLabel')}</span>
            <textarea rows={5} maxLength={20000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {failure && (
            <p role="alert" className="task-error task-field-wide">
              {failure}
            </p>
          )}
          <div className="task-dialog-actions task-field-wide">
            <Button type="button" variant="ghost" disabled={disabled || busy} onClick={() => onDelete(opened)}>
              {t('delete')}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={disabled || busy || !title.trim()}>
              {t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
