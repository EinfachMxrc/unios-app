// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ManualCardContext, ManualCardInput, ManualCardResponse } from './manualCardTypes'

export type ManualCardDraft = {
  context: ManualCardContext
  mutationId: string
  writeId: string
  updatedAt: number
  front: string
  back: string
  topic: string
  sent: ManualCardInput | null
  result: ManualCardResponse | null
  rejection?: 'MANUAL_SOURCE_CHANGED'
}
export type DraftBranch = { id: string; writerInstanceId: string; draft: ManualCardDraft }
export type DraftEnvelope = {
  schema: 2
  revision: number
  head: { revision: number; writerInstanceId: string; draft: ManualCardDraft }
  branches: Record<string, DraftBranch>
  intents: Record<
    string,
    { payload: ManualCardInput; result: ManualCardResponse | null; rejection?: 'MANUAL_SOURCE_CHANGED' }
  >
}
export type DraftWorkspace = {
  schema: 2
  id: string
  backend: 'idb' | 'local'
  generation: number
  binding: 'ready' | 'changing'
  legacyNamespace?: string
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function validManualResult(value: unknown): value is ManualCardResponse {
  if (!value || typeof value !== 'object') return false
  const result = value as ManualCardResponse
  return (
    Number.isSafeInteger(result.queue_id) &&
    result.queue_id > 0 &&
    (result.status === 'approved' || result.status === 'pushed') &&
    typeof result.deck_name === 'string' &&
    !!result.card &&
    typeof result.card.front === 'string' &&
    typeof result.card.back === 'string' &&
    !!result.source &&
    Number.isSafeInteger(result.source.version_id) &&
    result.source.version_id > 0 &&
    Number.isSafeInteger(result.source.page) &&
    result.source.page > 0 &&
    typeof result.source.resource_name === 'string' &&
    typeof result.source.quote === 'string'
  )
}
export function validManualDraft(value: unknown, context?: ManualCardContext): value is ManualCardDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as ManualCardDraft
  return (
    !!draft.context &&
    (!context ||
      (draft.context.version_id === context.version_id && draft.context.annotation_id === context.annotation_id)) &&
    uuid.test(draft.mutationId) &&
    uuid.test(draft.writeId) &&
    Number.isFinite(draft.updatedAt) &&
    typeof draft.front === 'string' &&
    typeof draft.back === 'string' &&
    typeof draft.topic === 'string' &&
    Number.isSafeInteger(draft.context.version_id) &&
    draft.context.version_id > 0 &&
    uuid.test(draft.context.annotation_id) &&
    Number.isSafeInteger(draft.context.page) &&
    draft.context.page > 0 &&
    Number.isSafeInteger(draft.context.annotation_revision) &&
    draft.context.annotation_revision > 0 &&
    typeof draft.context.quote === 'string' &&
    typeof draft.context.resource_name === 'string' &&
    typeof draft.context.course_name === 'string' &&
    (draft.sent === null ||
      (!!draft.sent &&
        draft.sent.mutation_id === draft.mutationId &&
        draft.sent.front === draft.front &&
        draft.sent.back === draft.back &&
        draft.sent.topic === draft.topic &&
        !!draft.sent.source &&
        draft.sent.source.version_id === draft.context.version_id &&
        draft.sent.source.annotation_id === draft.context.annotation_id &&
        draft.sent.source.expected_revision === draft.context.annotation_revision &&
        draft.sent.source.page === draft.context.page)) &&
    (draft.result === null || (validManualResult(draft.result) && draft.sent !== null)) &&
    (draft.rejection === undefined ||
      (draft.rejection === 'MANUAL_SOURCE_CHANGED' && draft.sent !== null && draft.result === null))
  )
}
export function validDraftWorkspace(value: unknown): value is DraftWorkspace {
  const workspace = value as DraftWorkspace | null
  return (
    !!workspace &&
    workspace.schema === 2 &&
    uuid.test(workspace.id) &&
    (workspace.backend === 'idb' || workspace.backend === 'local') &&
    Number.isSafeInteger(workspace.generation) &&
    workspace.generation > 0 &&
    (workspace.binding === 'ready' || workspace.binding === 'changing') &&
    (workspace.legacyNamespace === undefined || uuid.test(workspace.legacyNamespace))
  )
}
export function sameManualPayload(a: ManualCardInput, b: ManualCardInput) {
  return (
    a.mutation_id === b.mutation_id &&
    a.front === b.front &&
    a.back === b.back &&
    a.topic === b.topic &&
    a.source.version_id === b.source.version_id &&
    a.source.annotation_id === b.source.annotation_id &&
    a.source.expected_revision === b.source.expected_revision &&
    a.source.page === b.source.page
  )
}
export function validDraftEnvelope(value: unknown, context: ManualCardContext): value is DraftEnvelope {
  const envelope = value as DraftEnvelope | null
  if (
    !envelope ||
    envelope.schema !== 2 ||
    !Number.isSafeInteger(envelope.revision) ||
    envelope.revision < 1 ||
    !envelope.head ||
    !Number.isSafeInteger(envelope.head.revision) ||
    envelope.head.revision < 1 ||
    !uuid.test(envelope.head.writerInstanceId) ||
    !validManualDraft(envelope.head.draft, context) ||
    !envelope.branches ||
    typeof envelope.branches !== 'object' ||
    !envelope.intents ||
    typeof envelope.intents !== 'object'
  )
    return false
  if (
    !Object.entries(envelope.branches).every(
      ([id, branch]) =>
        branch.id === id &&
        uuid.test(id) &&
        uuid.test(branch.writerInstanceId) &&
        validManualDraft(branch.draft, context),
    )
  )
    return false
  if (
    !Object.entries(envelope.intents).every(
      ([id, intent]) =>
        uuid.test(id) &&
        !!intent.payload &&
        intent.payload.mutation_id === id &&
        typeof intent.payload.front === 'string' &&
        typeof intent.payload.back === 'string' &&
        typeof intent.payload.topic === 'string' &&
        !!intent.payload.source &&
        intent.payload.source.version_id === context.version_id &&
        intent.payload.source.annotation_id === context.annotation_id &&
        Number.isSafeInteger(intent.payload.source.expected_revision) &&
        intent.payload.source.expected_revision > 0 &&
        Number.isSafeInteger(intent.payload.source.page) &&
        intent.payload.source.page > 0 &&
        (intent.result === null || validManualResult(intent.result)) &&
        (intent.rejection === undefined || intent.rejection === 'MANUAL_SOURCE_CHANGED'),
    )
  )
    return false
  const draft = envelope.head.draft
  return (
    !draft.sent ||
    (!!envelope.intents[draft.mutationId] &&
      sameManualPayload(envelope.intents[draft.mutationId].payload, draft.sent) &&
      (envelope.intents[draft.mutationId].result?.status !== 'pushed' || draft.result?.status === 'pushed'))
  )
}
