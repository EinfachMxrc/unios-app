// SPDX-License-Identifier: AGPL-3.0-or-later
import type { components } from '@/generated/api'

type Schemas = components['schemas']
export type Language = Schemas['CodingTaskView']['language']
export type Template = Schemas['CodingTaskView']['template']
export type Check = Schemas['CodingCheckView']
export type Attempt = Pick<Schemas['CodingAttemptView'],
  'id' | 'state' | 'hint_level' | 'job_id' | 'feedback_requested' | 'feedback_level' | 'report'>
export type Task = Pick<Schemas['CodingDetailView'],
  'id' | 'course_id' | 'title' | 'template' | 'language' | 'topic_id' | 'difficulty' | 'learning_goal' |
  'story' | 'contract' | 'rubric' | 'status' | 'draft_revision' | 'highest_hint' | 'created_at' |
  'files' | 'starter_files' | 'public_tests' | 'reviews'> & { attempts: Attempt[] }
