// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest'
import { taskWorkflowPayload, type TaskMetadata } from './taskWorkflow'

const metadata: TaskMetadata = { object_type: 'assignment', object_id: '9', revision: 4,
  tags: ['math', 'exam'], priority: 'high', exam_relevant: false, difficulty: 'hard', workflow_status: 'working' }

it('changes only the personal workflow and keeps every other confirmed property and its revision', () => {
  expect(taskWorkflowPayload(metadata, 'done')).toEqual({ tags: ['math', 'exam'], priority: 'high',
    exam_relevant: false, difficulty: 'hard', workflow_status: 'done', expected_revision: 4 })
  expect(metadata.workflow_status).toBe('working')
  expect(taskWorkflowPayload({ ...metadata, revision: 5, workflow_status: 'done' }, 'working').expected_revision).toBe(5)
})

it('can restore the original unset status without inventing tags or replacing false with unknown', () => {
  const clean: TaskMetadata = { ...metadata, tags: [], priority: null, difficulty: null, workflow_status: null }
  expect(taskWorkflowPayload(clean, null)).toEqual({ tags: [], priority: null, difficulty: null,
    exam_relevant: false, workflow_status: null, expected_revision: 4 })
})
