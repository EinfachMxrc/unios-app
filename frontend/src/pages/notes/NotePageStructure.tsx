// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus, X } from 'lucide-react'
import { request, useApi } from '@/api'
import { Failure } from '@/components/State'
import { useT } from '@/i18n/useT'
import { useWritableHost } from '@/hooks/host'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useWorkspaceState } from '@/lib/workspaceState'
import { beginNewFreeNote } from '@/lib/sourceNoteSave'
import { pendingPageParentKey, validPageId } from '@/lib/notePages'
import { queryClient } from '@/offlineCache'
import type { components } from '@/generated/api'
import './NotePages.css'

type PageLink = components['schemas']['LinkItemView']
type PageTarget = components['schemas']['LinkTargetView']
const pathFor = (id: string) => `/api/links/note/${id}`

export function NotePageParents({ id }: { id: string }) {
  const { t } = useT('notes')
  const { data } = useApi<PageLink[]>(pathFor(id))
  const parents =
    data?.filter(
      (link) => link.relation === 'part_of' && link.direction === 'outgoing' && link.target.type === 'note',
    ) ?? []
  if (!parents.length) return null
  return (
    <nav className="note-parent-pages" aria-label={t('pages.parents')}>
      {parents.map((parent) => (
        <Link key={parent.id} to={parent.target.url}>
          ← {parent.target.title}
        </Link>
      ))}
    </nav>
  )
}

export function NoteSubpages({ id, courseId }: { id: string; courseId: number }) {
  const { t } = useT('notes')
  const canWrite = useWritableHost()
  const { data, error: loadError, reload } = useApi<PageLink[]>(pathFor(id))
  const children =
    data?.filter(
      (link) => link.relation === 'part_of' && link.direction === 'incoming' && link.target.type === 'note',
    ) ?? []
  const [pendingParent, setPendingParent] = useWorkspaceState<string | null>(pendingPageParentKey(id), null, {
    valid: (value): value is string | null => value === null || validPageId(value),
  })
  const attemptedParent = useRef<string | null>(null)
  const activeRequest = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const term = useDebouncedValue(query.trim())
  const {
    data: candidates,
    error: searchError,
    loading: searching,
  } = useApi<PageTarget[]>(`/api/links/candidates?q=${encodeURIComponent(term)}`, {
    enabled: adding && term.length >= 2,
  })
  const options =
    candidates?.filter(
      (item) => item.type === 'note' && item.id !== id && !children.some((child) => child.target.id === item.id),
    ) ?? []
  useEffect(() => {
    const abort = () => activeRequest.current?.abort()
    window.addEventListener('unios:workspace-cleared', abort)
    return () => {
      window.removeEventListener('unios:workspace-cleared', abort)
      abort()
    }
  }, [])

  const connect = useCallback(
    async (child: string, parent: string) => {
      if (activeRequest.current) return
      const controller = new AbortController()
      activeRequest.current = controller
      setBusy(true)
      setError('')
      try {
        await request('/api/links', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            from_type: 'note',
            from_id: child,
            to_type: 'note',
            to_id: parent,
            relation: 'part_of',
          }),
        })
        if (controller.signal.aborted) return
        if (child === id) setPendingParent(null)
        setAdding(false)
        setQuery('')
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['api', pathFor(child)] }),
          queryClient.invalidateQueries({ queryKey: ['api', pathFor(parent)] }),
        ])
      } catch (cause) {
        if (!controller.signal.aborted) setError(extractApiErrorMessage(cause))
      } finally {
        activeRequest.current = null
        if (!controller.signal.aborted) setBusy(false)
      }
    },
    [id, setPendingParent],
  )

  useEffect(() => {
    if (!pendingParent || !canWrite || attemptedParent.current === pendingParent) return
    const timer = window.setTimeout(() => {
      attemptedParent.current = pendingParent
      void connect(id, pendingParent)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [pendingParent, canWrite, connect, id])

  async function detach(link: PageLink) {
    if (activeRequest.current) return
    const controller = new AbortController()
    activeRequest.current = controller
    setBusy(true)
    setError('')
    try {
      await request(`/api/links/${link.id}`, { method: 'DELETE', signal: controller.signal })
      if (controller.signal.aborted) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['api', pathFor(id)] }),
        queryClient.invalidateQueries({ queryKey: ['api', pathFor(link.target.id)] }),
      ])
    } catch (cause) {
      if (!controller.signal.aborted) setError(extractApiErrorMessage(cause))
    } finally {
      activeRequest.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <section className="note-subpages" aria-label={t('pages.subpages')}>
      <div className="note-subpages-heading">
        <h3>
          {t('pages.subpages')} <span>{children.length}</span>
        </h3>
        {canWrite && (
          <Link to={`/notes?new=1&course_id=${courseId}&parent_id=${id}`} onClick={() => beginNewFreeNote(courseId)}>
            <Plus size={14} />
            {t('pages.createChild')}
          </Link>
        )}
      </div>
      {loadError && <Failure message={loadError} retry={reload} />}
      {pendingParent && (
        <div className="note-parent-pending" role="status">
          <p>{t('pages.parentPending')}</p>
          {canWrite && (
            <>
              <button type="button" disabled={busy} onClick={() => void connect(id, pendingParent)}>
                {t('pages.retryParent')}
              </button>
              <button type="button" disabled={busy} onClick={() => setPendingParent(null)}>
                {t('pages.cancelParent')}
              </button>
            </>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {!!children.length && (
        <ul>
          {children.map((child) => (
            <li key={child.id}>
              <FileText size={15} aria-hidden="true" />
              <Link to={child.target.url}>{child.target.title}</Link>
              {canWrite && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t('pages.detach', { title: child.target.title })}
                  onClick={() => void detach(child)}
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!children.length && !loadError && <p className="note-subpages-empty">{t('pages.noChildren')}</p>}
      {canWrite && (
        <button
          type="button"
          className="note-attach-toggle"
          disabled={busy}
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          {t('pages.attachExisting')}
        </button>
      )}
      {adding && (
        <div className="note-child-picker">
          <input
            aria-label={t('pages.searchPages')}
            placeholder={t('pages.searchPages')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={120}
          />
          {searchError && <Failure message={searchError} />}
          {searching ? (
            <p role="status">{t('pages.searching')}</p>
          ) : term.length >= 2 && !options.length ? (
            <p>{t('pages.noCandidates')}</p>
          ) : (
            options.map((item) => (
              <button key={item.id} type="button" disabled={busy} onClick={() => void connect(item.id, id)}>
                {item.title}
              </button>
            ))
          )}
        </div>
      )}
    </section>
  )
}
