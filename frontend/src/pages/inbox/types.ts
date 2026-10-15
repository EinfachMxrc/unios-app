// SPDX-License-Identifier: AGPL-3.0-or-later

export type IntakeState = 'new' | 'review' | 'accepted' | 'rejected' | 'snoozed' | 'duplicate'
export type IntakeItem = {
  source_kind: string
  source_id: string
  title: string
  detail: string
  url: string
  course_id: number | null
  state: IntakeState
  revision: number
  snoozed_until: string | null
  target_kind: string | null
  target_id: string | null
  duplicate_of: string | null
  created_at: string
  critical: boolean
}
export type IntakeTarget = { kind: string; id: string; label: string }
