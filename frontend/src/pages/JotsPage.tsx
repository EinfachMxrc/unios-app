// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Lightbulb, MessageCircleQuestion, SquareCheckBig, Trash2 } from 'lucide-react'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { JotCapture } from '@/components/JotCapture'
import { Shell } from '@/components/Shell'
import { Empty, Failure, ListRows, Loading, Panel } from '@/components/State'
import { localDate, request } from '@/api'
import { extractApiErrorMessage, useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import { useJotOutbox } from '@/hooks/useJotOutbox'
import { LinkedItems } from '@/components/LinkedItems'
import { TrashUndo, type Trashed } from '@/components/TrashUndo'
import { moveToTrash } from '@/lib/trash'
import { flushJots } from '@/jotQueue'
import { mayCache, queryClient } from '@/offlineCache'
import { JotTransferBlocked, prepareJotNoteDraft, transferJotToNote } from '@/lib/jotNoteTransfer'
import type { Jot, JotsResponse } from '@/types'

const icons = { thought: Lightbulb, question: MessageCircleQuestion, todo: SquareCheckBig }
/** How a quick note is named in messages: its first words. */
const TITLE_LENGTH = 60
const jotTitle = (jot: Jot) => jot.body.length > TITLE_LENGTH ? `${jot.body.slice(0, TITLE_LENGTH).trimEnd()}…` : jot.body
const PAGE_SIZE = 20
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type JotList = JotsResponse & { page?: { total: number; offset: number; limit: number; has_more: boolean } | null }

function invalidateJots() {
  // The base key also matches every paginated/targeted read. The existing
  // offline outbox invalidates this same prefix when its upload completes.
  void queryClient.invalidateQueries({ queryKey: ['api', '/api/jots'] })
}

function JotPagination({ offset, total, hasMore, onChange }: {
  offset: number; total: number; hasMore: boolean; onChange: (offset: number) => void
}) {
  const { t } = useT('jots')
  if (total <= PAGE_SIZE && offset === 0) return null
  return <nav className="flex flex-wrap items-center gap-2 mt-3" aria-label={t('paginationAria')}>
    <Button type="button" variant="outline" size="sm" disabled={offset === 0}
      onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}>{t('previousPage')}</Button>
    <span className="muted-text text-sm">{t('pageSummary', { page: Math.floor(offset / PAGE_SIZE) + 1,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), count: total })}</span>
    <Button type="button" variant="outline" size="sm" disabled={!hasMore}
      onClick={() => onChange(offset + PAGE_SIZE)}>{t('nextPage')}</Button>
  </nav>
}

function kindLabels(t: TypedT<'jots'>): Record<Jot['kind'], string> {
  return { thought: t('kindThought'), question: t('kindQuestion'), todo: t('kindTodo') }
}

function StoredJot({ jot, data, canWrite, onTrash }: {
  jot: Jot & { task_course_id?: number | null }; data: JotsResponse; canWrite: boolean; onTrash: (jot: Jot) => void
}) {
  const { t: trash } = useT('trash')
  const { t } = useT('jots')
  const navigate = useNavigate()
  const labels = kindLabels(t)
  const [courseId, setCourseId] = useState(jot.course_id?.toString() ?? '')
  const [noteId, setNoteId] = useState(jot.note_id ?? '')
  const [showLinks, setShowLinks] = useState(false)
  const [showAssignment, setShowAssignment] = useState(false)
  const [transferPending, setTransferPending] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)
  const [transferResult, setTransferResult] = useState<{ noteId: string; alreadyLinked: boolean } | null>(null)
  const operationPending = useRef(false)
  const mounted = useRef(true)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; abort.current?.abort() }
  }, [])
  const Icon = icons[jot.kind]
  const course = data.courses.find((item) => item.id === jot.course_id)
  const note = data.notes.find((item) => item.id === jot.note_id)
  const changed = courseId !== (jot.course_id?.toString() ?? '') || noteId !== (jot.note_id ?? '')
  const save = useApiMutation(
    (assignment: { course_id: number | null; note_id: string | null }) => request(`/api/jots/${jot.id}/assignment`, {
      method: 'PATCH',
      body: JSON.stringify(assignment),
    }),
    { onSuccess: invalidateJots },
  )
  const busy = save.pending || transferPending
  async function assign() {
    if (!canWrite || operationPending.current || !changed) return
    operationPending.current = true
    try { await save.mutateAsync({ course_id: courseId ? Number(courseId) : null, note_id: noteId || null }) }
    catch { /* useApiMutation displays the failure. */ }
    finally { operationPending.current = false }
  }
  function transferMessage(cause: unknown) {
    if (cause instanceof JotTransferBlocked) {
      const keys = { localDraft: 'transferLocalDraft', hostUnavailable: 'transferHostUnavailable',
        wrongNote: 'transferWrongNote', tooLong: 'transferTooLong' } as const
      return t(keys[cause.reason])
    }
    return cause instanceof Error ? cause.message : t('transferFailed')
  }
  async function transfer() {
    if (!canWrite || operationPending.current || !noteId || !courseId) return
    operationPending.current = true
    setTransferPending(true); setTransferError(null); setTransferResult(null)
    const controller = new AbortController()
    abort.current = controller
    try {
      const result = await transferJotToNote(jot, noteId, Number(courseId), t('originalJotLabel'), controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      queryClient.setQueryData(['api', `/api/notes/${noteId}`], result.detail)
      void queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === 'api' &&
        typeof query.queryKey[1] === 'string' && query.queryKey[1].startsWith('/api/notes') })
      setTransferResult({ noteId, alreadyLinked: result.alreadyLinked })
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setTransferError(transferMessage(cause))
    } finally {
      operationPending.current = false
      if (mounted.current) setTransferPending(false)
    }
  }
  function newNote() {
    if (!canWrite || operationPending.current || !courseId) return
    try {
      const path = prepareJotNoteDraft(jot, Number(courseId), t('newNoteTitle'), t('originalJotLabel'))
      navigate(path)
    } catch (cause) { setTransferError(cause instanceof JotTransferBlocked ? transferMessage(cause) : t('newNoteDraftFailed')) }
  }

  return (
    <article className="jot-row" id={`jot-${jot.id}`} tabIndex={-1}>
      <div className="jot-row-heading">
        <Icon size={17} /> <strong>{labels[jot.kind]}</strong>
        <span className="row-subtitle">{localDate(jot.created_at)}</span>
        {canWrite && <button type="button" className="jot-trash" aria-label={trash('moveToTrashLabel', { title: jotTitle(jot) })}
          title={trash('moveToTrash')} onClick={() => onTrash(jot)}><Trash2 size={15} /></button>}
      </div>
      <p className="jot-body">{jot.body}</p>
      {(course || note) && (
        <p className="row-subtitle">
          {course?.name ?? ''}
          {note && (
            <>
              {' · '}
              <Link to={`/notes?id=${note.id}`}>{note.title}</Link>
            </>
          )}
        </p>
      )}
      {jot.task_id && jot.task_course_id && <p className="row-subtitle">
        <Link to={`/courses/${jot.task_course_id}#assignment-${jot.task_id}`}>{t('openTaskInCourse')}</Link>
      </p>}
      <Button type="button" size="sm" variant="ghost" aria-expanded={showAssignment}
        aria-controls={`jot-assignment-${jot.id}`} onClick={() => setShowAssignment(!showAssignment)}>
        {showAssignment ? t('hideAssignment') : t('showAssignment')}
      </Button>
      {showAssignment && <div id={`jot-assignment-${jot.id}`}>
      <p className="muted-text text-sm">{t('assignmentHint')}</p>
      <div className="jot-assignment">
        <select
          className="native-select"
          aria-label={t('courseForAria', { body: jot.body })}
          value={courseId}
          disabled={!canWrite || busy}
          onChange={(event) => {
            setCourseId(event.target.value)
            setNoteId('')
          }}
        >
          <option value="">{t('noCourseOption')}</option>
          {data.courses.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          className="native-select"
          aria-label={t('noteForAria', { body: jot.body })}
          value={noteId}
          disabled={!canWrite || busy || !courseId}
          onChange={(event) => setNoteId(event.target.value)}
        >
          <option value="">{t('noNoteOption')}</option>
          {data.notes
            .filter((item) => item.course_id.toString() === courseId)
            .map((item) => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
        </select>
        <Button type="button" variant="outline" disabled={!canWrite || busy || !changed} onClick={() => void assign()}>
          {t('assignButton')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <Button type="button" size="sm" disabled={!canWrite || busy || !noteId || !courseId} onClick={() => void transfer()}>
          {transferPending ? t('transferPending') : t('transferButton')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!canWrite || busy || !courseId} onClick={newNote}>
          {t('newNoteButton')}
        </Button>
      </div>
      <p className="muted-text text-sm">{t('transferHint')}</p>
      </div>}
      {save.error && (
        <p role="alert" className="text-destructive">
          {save.error}
        </p>
      )}
      {transferError && <p role="alert" className="text-destructive">{transferError}</p>}
      {transferResult && <p role="status" className="muted-text">
        {transferResult.alreadyLinked ? t('alreadyLinked') : t('transferSucceeded')}{' '}
        <Link to={`/notes?id=${transferResult.noteId}`}>{t('openTransferredNote')}</Link>
      </p>}
      <Button type="button" size="sm" variant="ghost" onClick={() => setShowLinks(!showLinks)}>
        {showLinks ? t('closeLinksButton') : t('showLinksButton')}
      </Button>
      {showLinks && <LinkedItems kind="jot" id={jot.id} />}
    </article>
  )
}

export function JotsPage() {
  const { t } = useT('jots')
  const labels = kindLabels(t)
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const requestedOffset = Number(params.get('offset') ?? 0)
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0
  const target = location.hash.startsWith('#jot-') && UUID.test(location.hash.slice(5)) ? location.hash.slice(5).toLowerCase() : null
  const queryParams = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(target ? 0 : offset) })
  if (target) queryParams.set('jot_id', target)
  const course = Number(params.get('course_id'))
  if (Number.isSafeInteger(course) && course > 0) queryParams.set('course_id', String(course))
  const path = `/api/jots?${queryParams}`
  const result = useQuery<JotList, Error>({ queryKey: ['api', '/api/jots', path],
    queryFn: ({ signal }) => request<JotList>(path, { signal }), networkMode: 'always',
    meta: { offlineCache: mayCache('/api/jots') } })
  const data = result.data
  const { pending } = useJotOutbox()
  const [pendingOffset, setPendingOffset] = useState(0)
  const actualPendingOffset = Math.min(pendingOffset, Math.max(0, Math.ceil(pending.length / PAGE_SIZE) - 1) * PAGE_SIZE)
  const canWrite = useWritableHost()
  const { t: trash } = useT('trash')
  const [trashed, setTrashed] = useState<Trashed | null>(null)
  const [trashError, setTrashError] = useState('')
  async function trashJot(jot: Jot) {
    setTrashError('')
    try {
      await moveToTrash('jot', jot.id)
      setTrashed({ kind: 'jot', id: jot.id, title: jotTitle(jot) })
    } catch (cause) {
      setTrashError(trash('failed', { reason: extractApiErrorMessage(cause) }))
    }
  }
  useEffect(() => {
    if (!target || !data?.jots.some(jot => jot.id === target)) return
    const element = document.getElementById(`jot-${target}`)
    element?.scrollIntoView({ block: 'center' })
    element?.focus({ preventScroll: true })
  }, [target, data, result.dataUpdatedAt])
  const setOffset = (next: number) => { const nextParams = new URLSearchParams(params); nextParams.set('offset', String(next)); setParams(nextParams) }
  return (
    <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')} cachedAt={result.dataUpdatedAt}>
      <Panel title={t('newEntryPanelTitle')}>
        <JotCapture />
      </Panel>
      {pending.length > 0 && (
        <Panel
          title={t('pendingCountTitle', { count: pending.length })}
          action={
            <Button variant="outline" disabled={!canWrite} onClick={() => void flushJots()}>
              {t('flushNowButton')}
            </Button>
          }
        >
          <p className="muted-text mb-3">
            {t('pendingHint')}
          </p>
          <ListRows>
            {pending.slice(actualPendingOffset, actualPendingOffset + PAGE_SIZE).map((item) => (
              <article key={item.id} className="jot-row">
                <strong>{labels[item.kind]}</strong> <span className="row-subtitle">{localDate(item.created_at)}</span>
                <p className="jot-body">{item.body}</p>
              </article>
            ))}
          </ListRows>
          <JotPagination offset={actualPendingOffset} total={pending.length} hasMore={actualPendingOffset + PAGE_SIZE < pending.length}
            onChange={setPendingOffset} />
        </Panel>
      )}
      <Panel title={t('storedEntriesPanelTitle')}>
        {target && <p className="muted-text mb-3"><Link to={{ pathname: '/jots', search: location.search }}>{t('showAllEntries')}</Link></p>}
        {trashed && <TrashUndo item={trashed} onDismiss={() => setTrashed(null)} onRestored={() => setTrashed(null)} />}
        {trashError && <Failure message={trashError} />}
        {result.error && <Failure message={result.error.message} retry={() => void result.refetch()} />}
        {result.isPending && !data ? (
          <Loading />
        ) : data?.jots.length ? (
          <ListRows>
            {data.jots.map((item) => (
              <StoredJot key={item.id} jot={item} data={data} canWrite={canWrite} onTrash={jot => void trashJot(jot)} />
            ))}
          </ListRows>
        ) : data ? <Empty icon={Lightbulb} title={target ? t('targetMissingTitle') : t('emptyTitle')}
          text={target ? t('targetMissingText') : t('emptyText')} /> : null}
        {!target && data?.page && <JotPagination offset={offset} total={data.page.total} hasMore={data.page.has_more} onChange={setOffset} />}
      </Panel>
    </Shell>
  )
}
