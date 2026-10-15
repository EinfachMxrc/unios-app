// SPDX-License-Identifier: AGPL-3.0-or-later
export type TaskWorkflowStatus = 'open' | 'working' | 'done' | null
export type TaskMetadata = {
  object_type: 'assignment' | 'deadline'; object_id: string; revision: number
  tags: string[]; priority: 'low' | 'medium' | 'high' | null
  exam_relevant: boolean | null; difficulty: 'easy' | 'medium' | 'hard' | null
  workflow_status: TaskWorkflowStatus
}

/** Preserve every other confirmed property; the revision prevents clearing a concurrent edit. */
export function taskWorkflowPayload(base: TaskMetadata, status: TaskWorkflowStatus) {
  return { tags: base.tags, priority: base.priority, exam_relevant: base.exam_relevant,
    difficulty: base.difficulty, workflow_status: status, expected_revision: base.revision }
}
