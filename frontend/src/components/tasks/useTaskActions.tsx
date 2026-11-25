// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { ActionFeedback } from '@/components/ActionFeedback'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useT } from '@/i18n/useT'
import { changeTask, restoreTask, trashTask, type Task, type TaskStatus } from '@/lib/tasks'
import { TaskDialog } from './TaskDialog'

/** Status changes, the edit dialog and delete-with-undo, shared by every place that lists tasks. */
export function useTaskActions() {
  const { t } = useT('tasks')
  const canWrite = useWritableHost()
  const [editing, setEditing] = useState<Task | null>(null)
  const [removed, setRemoved] = useState<Task | null>(null)
  const [failure, setFailure] = useState('')
  const [busyId, setBusyId] = useState('')

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id)
    setFailure('')
    try {
      await action()
      return true
    } catch (cause) {
      setFailure(t('failed', { reason: extractApiErrorMessage(cause) }))
      return false
    } finally {
      setBusyId('')
    }
  }

  const remove = async (task: Task) => {
    setEditing(null)
    if (await run(task.id, () => trashTask(task.id))) setRemoved(task)
  }

  const overlay = (
    <>
      {failure && <ActionFeedback tone="error" message={failure} />}
      {removed && (
        <div className="task-undo">
          <ActionFeedback tone="success" message={t('deleted', { title: removed.title })} />
          <Button
            variant="outline"
            size="sm"
            disabled={!canWrite}
            onClick={() => void run(removed.id, () => restoreTask(removed.id)).then((done) => done && setRemoved(null))}
          >
            {t('undo')}
          </Button>
        </div>
      )}
      {editing && (
        <TaskDialog
          key={editing.id}
          task={editing}
          disabled={!canWrite}
          onClose={() => setEditing(null)}
          onDelete={(task) => void remove(task)}
        />
      )}
    </>
  )

  return {
    canWrite,
    isBusy: (id: string) => busyId === id,
    setStatus: (task: Task, status: TaskStatus) => void run(task.id, () => changeTask(task, { status })),
    open: setEditing,
    overlay,
  }
}
