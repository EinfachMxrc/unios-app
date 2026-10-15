// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookOpenCheck, FileJson } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { request, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApiMutation, extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import { ownCardSourceUrl, ownCardSourceTitle, isNoteCardSource, type OwnCardResponse } from '@/noteCardTypes'
import { invalidateManualCardReads } from '@/manualCardDraft'
import type { components } from '@/generated/api'
import { LearningTabs } from '@/components/LearningTabs'
import { useAnchorScroll } from '@/hooks/useAnchorScroll'
import './CardQueuePage.css'

type QueueItem = components['schemas']['QueueItem']
type ProposalDraft = Pick<QueueItem['card'], 'front' | 'back' | 'topic'>
type ProposalDraftState = { dirty: boolean; pending: boolean }
type DraftStateListener = (id: number, state: ProposalDraftState | null) => void

const sameDraft = (left: ProposalDraft, right: ProposalDraft) =>
  left.front === right.front && left.back === right.back && left.topic === right.topic

const QUEUE_PATH = '/api/anki/queue'
const PAGE_SIZE = 20

function useQueueWindow(
  items: QueueItem[],
  targetId: number | null,
  scope: string,
  pinnedIds: Set<number> = new Set(),
) {
  const [choice, setChoice] = useState<{ scope: string; page: number } | null>(null)
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const targetIndex = items.findIndex((item) => item.id === targetId)
  const requested = choice?.scope === scope ? choice.page : targetIndex >= 0 ? Math.floor(targetIndex / PAGE_SIZE) : 0
  const page = Math.min(Math.max(0, requested), pages - 1)
  const rows = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  // A refetch may reorder the queue. Keep edited rows mounted until saved.
  for (const item of items.filter((item) => pinnedIds.has(item.id))) {
    if (rows.some((row) => row.id === item.id)) continue
    if (rows.length >= PAGE_SIZE) {
      const clean = rows.findLastIndex((row) => !pinnedIds.has(row.id))
      if (clean < 0) continue
      rows.splice(clean, 1)
    }
    rows.push(item)
  }
  return { page, pages, rows, setPage: (next: number) => setChoice({ scope, page: next }) }
}

function QueuePagination({
  page,
  pages,
  count,
  visible,
  disabled = false,
  onChange,
}: {
  page: number
  pages: number
  count: number
  visible: number
  disabled?: boolean
  onChange: (page: number) => void
}) {
  const { t } = useT('cardQueue')
  if (!count) return null
  return (
    <nav className="mt-3 flex flex-wrap items-center gap-3" aria-label={t('queuePagination')}>
      <p className="muted-text text-sm">{t('queuePageSummary', { page: page + 1, pages, visible, count })}</p>
      {pages > 1 && (
        <>
          <Button size="sm" variant="outline" disabled={disabled || page === 0} onClick={() => onChange(page - 1)}>
            {t('queuePrevious')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || page + 1 >= pages}
            onClick={() => onChange(page + 1)}
          >
            {t('queueNext')}
          </Button>
        </>
      )}
    </nav>
  )
}

function targetCardId(hash: string) {
  const match = /^#card-([1-9]\d*)$/.exec(hash)
  const value = match ? Number(match[1]) : null
  return value && Number.isSafeInteger(value) ? value : null
}

function ProposalRow({
  item,
  canWrite,
  bulkPending = false,
  onDraftStateChange,
}: {
  item: QueueItem
  canWrite: boolean
  bulkPending?: boolean
  onDraftStateChange?: DraftStateListener
}) {
  const { t } = useT('cardQueue')
  const { t: study } = useT('study')
  const [front, setFront] = useState(item.card.front)
  const [back, setBack] = useState(item.card.back)
  const [topic, setTopic] = useState(item.card.topic)
  const draftRef = useRef<ProposalDraft>({ front: item.card.front, back: item.card.back, topic: item.card.topic })
  const confirmedRef = useRef(draftRef.current)
  const pendingRef = useRef(false)
  const mountedRef = useRef(true)
  const save = useApiMutation(
    (ticket: { status: 'proposed' | 'approved' | 'rejected'; draft: ProposalDraft }) =>
      request<QueueItem>(`${QUEUE_PATH}/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: ticket.status, ...ticket.draft }),
      }),
    { invalidate: [QUEUE_PATH] },
  )
  const busy = save.pending || bulkPending
  const [transfer, setTransfer] = useState<OwnCardResponse | null>(null)
  const retry = useApiMutation(
    () =>
      request<OwnCardResponse>(`/api/anki/manual-cards/${item.id}/transfer`, {
        method: 'POST',
      }),
    {
      onSuccess: (result) => {
        setTransfer(result)
        invalidateManualCardReads()
      },
    },
  )
  const manual = item.origin === 'manual'
  const status = item.status === 'pushed' ? item.status : (transfer?.status ?? item.status)
  const source = transfer?.source ?? item.source
  const sourceUrl = source && ownCardSourceUrl(source)

  function reportDraftState() {
    if (mountedRef.current)
      onDraftStateChange?.(item.id, {
        dirty: !sameDraft(draftRef.current, confirmedRef.current),
        pending: pendingRef.current,
      })
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      onDraftStateChange?.(item.id, null)
    }
  }, [item.id, onDraftStateChange])

  function updateDraft(field: keyof ProposalDraft, value: string) {
    if (!canWrite || item.status !== 'proposed' || bulkPending || pendingRef.current) return
    draftRef.current = { ...draftRef.current, [field]: value }
    if (field === 'front') setFront(value)
    else if (field === 'back') setBack(value)
    else setTopic(value)
    // The parent guard sees the edit immediately, before another click/render.
    reportDraftState()
  }

  async function decide(status: 'proposed' | 'approved' | 'rejected') {
    if (!canWrite || bulkPending || pendingRef.current) return
    const draft = draftRef.current
    pendingRef.current = true
    reportDraftState()
    try {
      const saved = await save.mutateAsync({ status, draft })
      confirmedRef.current = { front: saved.card.front, back: saved.card.back, topic: saved.card.topic }
      if (mountedRef.current && draftRef.current === draft) {
        draftRef.current = confirmedRef.current
        setFront(saved.card.front)
        setBack(saved.card.back)
        setTopic(saved.card.topic)
      }
    } catch {
      // useApiMutation keeps the failure visible; the unsaved draft stays dirty.
    } finally {
      pendingRef.current = false
      reportDraftState()
    }
  }

  return (
    <article className="data-row card-queue-row" id={`card-${item.id}`} tabIndex={-1}>
      <p className="row-subtitle mb-3">
        <Link to={`/courses/${item.course_id}`}>{item.course_name}</Link> · {item.resource_name}
        {item.card.source_page ? t('sourcePageSuffix', { page: item.card.source_page }) : ''}
        {!manual && item.card.source_question_id && (
          <>
            {' '}
            · <Link to={`/courses/${item.course_id}`}>{t('fromQuestionLink')}</Link>
          </>
        )}
        {sourceUrl && (
          <>
            {' '}
            · <Link to={sourceUrl}>{study('manual.openSource')}</Link>
          </>
        )}
      </p>
      {manual ? (
        <dl className="manual-card-content">
          <div>
            <dt>{study('manual.front')}</dt>
            <dd className="manual-card-question">{item.card.front}</dd>
          </div>
          <div>
            <dt>{study('manual.back')}</dt>
            <dd>{item.card.back}</dd>
          </div>
          <div>
            <dt>{study('manual.topic')}</dt>
            <dd>{item.card.topic}</dd>
          </div>
        </dl>
      ) : (
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            {t('frontLabel')}
            <textarea
              className="native-select min-h-20 w-full"
              value={front}
              onChange={(event) => updateDraft('front', event.target.value)}
              disabled={!canWrite || item.status !== 'proposed' || busy}
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t('backLabel')}
            <textarea
              className="native-select min-h-24 w-full"
              value={back}
              onChange={(event) => updateDraft('back', event.target.value)}
              disabled={!canWrite || item.status !== 'proposed' || busy}
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t('topicLabel')}
            <Input
              value={topic}
              onChange={(event) => updateDraft('topic', event.target.value)}
              disabled={!canWrite || item.status !== 'proposed' || busy}
            />
          </label>
        </div>
      )}
      <p className="row-subtitle mt-2">
        {study(manual ? 'manual.originManual' : 'manual.originAi')} ·{' '}
        {item.card.card_type === 'cloze' ? t('clozeType') : t('basicType')} ·{' '}
        {status === 'proposed'
          ? t('statusProposed')
          : status === 'approved'
            ? manual
              ? study('manual.pendingTransfer')
              : t('statusApproved')
            : status === 'rejected'
              ? t('statusRejected')
              : t('statusPushed')}
      </p>
      {!manual && item.card.confidence && (
        <p className="row-subtitle">
          {study('manual.confidence', { value: study(`manual.confidence${item.card.confidence}`) })}
        </p>
      )}
      {manual && (
        <>
          {(transfer?.deck_name ?? item.deck_name) && (
            <p className="row-subtitle">
              {study('manual.destination', { deck: transfer?.deck_name ?? item.deck_name })}
            </p>
          )}
          {status === 'approved' && (
            <div className="mt-3 grid gap-2">
              <p className="muted-text">{study('manual.queuePending')}</p>
              {transfer?.transfer_error && <p role="status">{transfer.transfer_error}</p>}
              <Button size="sm" variant="outline" disabled={!canWrite || retry.pending} onClick={() => retry.mutate()}>
                {study('manual.retryTransfer')}
              </Button>
            </div>
          )}
          {retry.error && <p role="alert">{retry.error}</p>}
        </>
      )}
      {save.error && (
        <p role="alert" className="text-destructive">
          {save.error}
        </p>
      )}
      {!manual && item.status === 'proposed' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => void decide('approved')}
            disabled={!canWrite || busy || !front.trim() || !back.trim() || !topic.trim()}
          >
            {t('approveButton')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void decide('proposed')} disabled={!canWrite || busy}>
            {t('saveChangesButton')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void decide('rejected')} disabled={!canWrite || busy}>
            {t('rejectButton')}
          </Button>
        </div>
      )}
    </article>
  )
}

function AiCardQueuePage() {
  const { t } = useT('cardQueue')
  const { hash, key: locationKey } = useLocation()
  const { data, error, loading, reload } = useApi<QueueItem[]>(QUEUE_PATH)
  const { data: outbox, reload: reloadOutbox } = useApi<{ pending: number }>('/api/ai/outbox/status')
  const canWrite = useWritableHost()
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const [importError, setImportError] = useState('')
  const draftStatesRef = useRef(new Map<number, ProposalDraftState>())
  const [blockedIds, setBlockedIds] = useState<Set<number>>(new Set())
  const bulkClaimed = useRef(false)
  const onDraftStateChange = useCallback<DraftStateListener>((id, state) => {
    if (state?.dirty || state?.pending) draftStatesRef.current.set(id, state)
    else draftStatesRef.current.delete(id)
    setBlockedIds(new Set(draftStatesRef.current.keys()))
  }, [])
  const open = data?.filter((item) => item.status === 'proposed') ?? []
  const accepted = data?.filter((item) => item.status === 'approved') ?? []
  const completed = data?.filter((item) => item.status === 'pushed') ?? []
  const bulkBlocked = open.some((item) => blockedIds.has(item.id))
  const targetId = targetCardId(hash)
  const reviewWindow = useQueueWindow(open, targetId, `${locationKey}:proposed`, blockedIds)
  const decidedWindow = useQueueWindow([...accepted, ...completed], targetId, `${locationKey}:decided`)
  useAnchorScroll(
    [...reviewWindow.rows, ...decidedWindow.rows].some((item) => item.id === targetId),
    reviewWindow.page + decidedWindow.page,
  )

  async function importCards() {
    setBusy(true)
    setImportError('')
    try {
      await request(`${QUEUE_PATH}/import`, { method: 'POST', body: JSON.stringify(JSON.parse(raw)) })
      setRaw('')
      reload()
    } catch (cause) {
      setImportError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const approveAll = useApiMutation(
    (ids: number[]) => {
      // Recheck synchronous row state: a disabled button alone is not a guard
      // against an edit/individual save queued before the mutation starts.
      if (open.some((item) => draftStatesRef.current.has(item.id)))
        return Promise.reject(new Error(t('bulkReviewBlocked')))
      if (ids.length < 1 || ids.length > 100) return Promise.reject(new Error(t('bulkSelectionInvalid')))
      return request(`${QUEUE_PATH}/approve`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      })
    },
    { onSuccess: () => reload() },
  )

  async function approveVisible() {
    if (!canWrite || bulkClaimed.current || open.some((item) => draftStatesRef.current.has(item.id))) return
    bulkClaimed.current = true
    try {
      await approveAll.mutateAsync(reviewWindow.rows.map((item) => item.id))
    } catch {
      /* The mutation retains its visible failure. */
    } finally {
      bulkClaimed.current = false
    }
  }

  function changeReviewPage(page: number) {
    if (bulkClaimed.current || open.some((item) => draftStatesRef.current.has(item.id))) return
    reviewWindow.setPage(page)
  }

  async function readFile(file: File | undefined) {
    if (!file) return
    setImportError('')
    if (file.size > 1_000_000) {
      setImportError(t('jsonTooLargeError'))
      return
    }
    setRaw(await file.text())
  }

  const collectOutbox = useApiMutation(
    () =>
      request<{
        processed: number
        cards: number
        exercises: number
        explanations: number
        rejected: number
        duplicates: number
      }>('/api/ai/outbox/process', { method: 'POST' }),
    {
      onSuccess: () => {
        reload()
        reloadOutbox()
      },
    },
  )
  const outboxMessage =
    collectOutbox.error ??
    (collectOutbox.data
      ? t('outboxSummary', {
          cards: collectOutbox.data.cards,
          exercises: collectOutbox.data.exercises,
          explanations: collectOutbox.data.explanations,
          rejected: collectOutbox.data.rejected,
          duplicates: collectOutbox.data.duplicates,
        })
      : '')

  return (
    <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')}>
      <p className="muted-text mb-5">
        {t('pageIntro', { open: open.length, accepted: accepted.length, completed: completed.length })}
      </p>
      <Panel title={t('importPanelTitle')} action={<FileJson size={20} />}>
        <label className="mb-3 grid gap-2 text-sm">
          {t('chooseJsonFileLabel')}
          <Input
            type="file"
            accept=".json,application/json"
            disabled={!canWrite || busy}
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
        </label>
        <label className="grid gap-2 text-sm">
          {t('pasteJsonLabel')}
          <textarea
            className="native-select min-h-32 w-full"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            disabled={!canWrite || busy}
          />
        </label>
        {importError && (
          <p role="alert" className="mt-2 text-destructive">
            {importError}
          </p>
        )}
        <Button className="mt-3" onClick={() => void importCards()} disabled={!canWrite || busy || !raw.trim()}>
          {t('reviewProposalsButton')}
        </Button>
      </Panel>
      <div className="mt-5">
        <Panel title={t('savedAnswersPanelTitle')}>
          <p className="muted-text">{t('pendingOutboxText', { count: outbox?.pending ?? 0 })}</p>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => collectOutbox.mutate()}
            disabled={!canWrite || collectOutbox.pending || !outbox?.pending}
          >
            {t('collectNowButton')}
          </Button>
          {outboxMessage && (
            <p className="mt-2 text-sm" role="status">
              {outboxMessage}
            </p>
          )}
        </Panel>
      </div>
      <div className="mt-5">
        <Panel
          title={t('reviewPanelTitle')}
          action={
            open.length ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void approveVisible()}
                aria-describedby={bulkBlocked ? 'card-queue-bulk-hint' : undefined}
                disabled={!canWrite || approveAll.pending || bulkBlocked}
              >
                {t('approveAllButton', { count: reviewWindow.rows.length })}
              </Button>
            ) : (
              <BookOpenCheck size={20} />
            )
          }
        >
          {bulkBlocked && (
            <p id="card-queue-bulk-hint" role="status" className="mb-3 muted-text">
              {t('bulkReviewBlocked')}
            </p>
          )}
          {approveAll.error && (
            <p role="alert" className="mb-3 text-destructive">
              {approveAll.error}
            </p>
          )}
          {error && <Failure message={error} retry={reload} />}
          {loading && !data ? (
            <Loading />
          ) : (
            data &&
            (open.length ? (
              <>
                <p className="mb-3 muted-text">{t('bulkVisibleScope', { count: reviewWindow.rows.length })}</p>
                <div className="grid gap-4">
                  {reviewWindow.rows.map((item) => (
                    <ProposalRow
                      item={item}
                      key={item.id}
                      canWrite={canWrite}
                      bulkPending={approveAll.pending}
                      onDraftStateChange={onDraftStateChange}
                    />
                  ))}
                </div>
                <QueuePagination
                  {...reviewWindow}
                  count={open.length}
                  visible={reviewWindow.rows.length}
                  disabled={approveAll.pending || bulkBlocked}
                  onChange={changeReviewPage}
                />
              </>
            ) : (
              <Empty title={t('emptyProposalsTitle')} text={t('emptyProposalsText')} />
            ))
          )}
        </Panel>
      </div>
      {(accepted.length > 0 || completed.length > 0) && (
        <div className="mt-5">
          <Panel title={t('decidedPanelTitle')}>
            <div className="grid gap-4">
              {decidedWindow.rows.map((item) => (
                <ProposalRow item={item} key={item.id} canWrite={canWrite} />
              ))}
            </div>
            <QueuePagination
              {...decidedWindow}
              count={accepted.length + completed.length}
              visible={decidedWindow.rows.length}
              onChange={decidedWindow.setPage}
            />
          </Panel>
        </div>
      )}
    </Shell>
  )
}

function ManualCardQueuePage() {
  const { t } = useT('study')
  const { hash, key: locationKey } = useLocation()
  const { data, error, loading, reload } = useApi<QueueItem[]>(`${QUEUE_PATH}?origin=manual`)
  const canWrite = useWritableHost()
  const targetId = targetCardId(hash)
  const listed = data?.some((item) => item.origin === 'manual' && item.id === targetId)
  const {
    data: target,
    error: targetError,
    loading: targetLoading,
    reload: reloadTarget,
  } = useApi<OwnCardResponse>(`/api/anki/manual-cards/${targetId ?? 0}`, { enabled: !!targetId && !listed })
  const items = data?.filter((item) => item.origin === 'manual') ?? []
  // The direct source-card link remains addressable beyond the newest queue window.
  if (targetId && !listed && target?.queue_id === targetId) {
    items.unshift({
      id: target.queue_id,
      status: target.status,
      card: target.card,
      origin: 'manual',
      guid: null,
      source: target.source,
      deck_name: target.deck_name,
      resource_id: isNoteCardSource(target.source) ? null : target.source.resource_id,
      resource_name: ownCardSourceTitle(target.source),
      course_id: target.source.course_id,
      course_name: target.source.course_name,
    })
  }
  const window = useQueueWindow(items, targetId, locationKey)
  const targetVisible = targetId ? window.rows.some((item) => item.id === targetId) : false
  useAnchorScroll(targetVisible, window.page)
  return (
    <Shell title={t('manual.queueTitle')} eyebrow={t('manual.queueEyebrow')}>
      <LearningTabs />
      <p className="muted-text mb-5">{t('manual.queueIntro')}</p>
      {(data || targetVisible) && <p className="muted-text mb-5">{t('manual.queueCount', { count: items.length })}</p>}
      <Panel title={t('manual.savedCardsTitle')}>
        {targetId && !targetVisible && targetLoading && <Loading variant="rows" />}
        {targetId && !targetVisible && targetError && <Failure message={targetError} retry={reloadTarget} />}
        {loading && !data && <Loading variant="rows" />}
        {error && <Failure message={error} retry={reload} />}
        {items.length ? (
          <>
            <div className="grid gap-4">
              {window.rows.map((item) => (
                <ProposalRow item={item} key={item.id} canWrite={canWrite} />
              ))}
            </div>
            <QueuePagination {...window} count={items.length} visible={window.rows.length} onChange={window.setPage} />
          </>
        ) : (
          !targetId && !loading && !error && <Empty title={t('manual.emptyTitle')} text={t('manual.emptyText')} />
        )}
      </Panel>
    </Shell>
  )
}

export function CardQueuePage({ manualOnly = false }: { manualOnly?: boolean }) {
  return manualOnly ? <ManualCardQueuePage /> : <AiCardQueuePage />
}
