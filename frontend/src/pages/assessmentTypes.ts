// SPDX-License-Identifier: AGPL-3.0-or-later
import type { components } from '@/generated/api'

type Schemas = components['schemas']
export type AssessmentKind = Schemas['AssessmentTaskView']['type']
export type AssessmentReport = Schemas['AssessmentReportView']
export type AssessmentTask = Pick<Schemas['AssessmentDetailView'],
  'id' | 'course_id' | 'title' | 'type' | 'status' | 'level' | 'highest_hint' |
  'question' | 'choices' | 'options' | 'expression' | 'math_operation' | 'topic' | 'mode' | 'objective' | 'provenance'> & {
    attempts: Pick<Schemas['AssessmentAttemptView'], 'id' | 'task_id' | 'confidence' | 'hint_level' | 'report' | 'feedback_requested'>[]
    reviews: Schemas['AssessmentReviewView'][]
  }
export type Exam = Pick<Schemas['AssessmentExamView'], 'id' | 'state' | 'ends_at' | 'task_ids' | 'answered' | 'remaining_seconds'> & {
  report?: Pick<Schemas['AssessmentExamReportView'], 'points' | 'maximum' | 'pending_points' | 'unanswered'>
}
