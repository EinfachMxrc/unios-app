// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { Failure } from '@/components/State'
import { request, useApi } from '@/api'
import { useWritableHost } from '@/hooks/host'
import { usePreferences } from '@/preferences'
import { StudyPeekLink } from '@/components/StudyPeekLink'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

type LinkKind = 'course' | 'resource' | 'jot' | 'note' | 'project' | 'topic' | 'assignment' | 'exam' | 'exercise'
type Relation = 'related' | 'prerequisite' | 'explains' | 'exercise_for' | 'part_of' | 'duplicate' | 'prepares_for'
type Target = { type: LinkKind; id: string; title: string; url: string }
type Linked = { id: number; relation: Relation; label: string; direction: 'outgoing' | 'incoming'; target: Target; created_at: string }
type Catalog = { entities: { kind: LinkKind; label: string }[];
  relationships: { kind: Relation; forward_label: string; reverse_label: string }[] }
type SuggestedNote = { id: string; title: string; course_name: string;
  semester_name: string | null; shared_terms: string[] }

export function LinkedItems({ kind, id }: { kind: LinkKind; id: string }) {
  const { t } = useT('links')
  const preferences = usePreferences()
  const showProjects = preferences.modules.projects
  const canWrite = useWritableHost()
  const { data, error, reload } = useApi<Linked[]>(`/api/links/${kind}/${id}`)
  const { data: catalog } = useApi<Catalog>('/api/schema')
  const { data: suggested, reload: reloadSuggested } = useApi<SuggestedNote[]>(
    `/api/notes/${id}/related`, { enabled: kind === 'note' })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Target[]>([])
  const [searchError, setSearchError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [relation, setRelation] = useState<Relation>('related')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void request<Target[]>(`/api/links/candidates?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then((items) => {
          setResults(items.filter((item) => (item.type !== kind || item.id !== id)
            && (showProjects || item.type !== 'project')))
          setSearchError('')
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setSearchError(extractApiErrorMessage(cause))
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [id, kind, query, showProjects])

  const visibleLinks = data?.filter((item) => showProjects || item.target.type !== 'project')
  const groupedLinks = Object.values((visibleLinks ?? []).reduce<Record<string, { label: string; items: Linked[] }>>(
    (groups, item) => {
      const key = `${item.relation}:${item.direction}`
      groups[key] ??= { label: item.label, items: [] }
      groups[key].items.push(item)
      return groups
    }, {}))
  const labelFor = (targetKind: LinkKind) => catalog?.entities.find((item) => item.kind === targetKind)?.label ?? targetKind

  async function add(target: Target) {
    setBusy(true)
    setActionError('')
    try {
      await request('/api/links', {
        method: 'POST',
        body: JSON.stringify({ from_type: kind, from_id: id, to_type: target.type, to_id: target.id, relation }),
      })
      setQuery('')
      setResults([])
      reload()
      if (kind === 'note') reloadSuggested()
    } catch (cause) {
      setActionError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function remove(edgeId: number) {
    setBusy(true)
    setActionError('')
    try {
      await request(`/api/links/${edgeId}`, { method: 'DELETE' })
      reload()
    } catch (cause) {
      setActionError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="linked-items" aria-label={t('sectionAria')}>
      <div className="linked-items-heading"><h3>{t('connectionsTitle')}</h3>
        {canWrite && <Button size="sm" variant="ghost" aria-expanded={showForm}
          onClick={() => setShowForm((value) => !value)}>{showForm ? t('closeButton') : t('linkButton')}</Button>}
      </div>
      {error && <Failure message={error} />}
      {groupedLinks.length ? groupedLinks.map((group) => (
        <div className="linked-items-group" key={`${group.items[0].relation}-${group.items[0].direction}`}>
          <h4>{group.label}</h4><ul>
          {group.items.map((item) => (
            <li key={item.id}>
              <span className="row-subtitle">{labelFor(item.target.type)}</span>{' '}
              {item.target.type === 'note' ? <StudyPeekLink id={item.target.id}>{item.target.title}</StudyPeekLink>
                : <Link to={item.target.url}>{item.target.title}</Link>}{' '}
              {canWrite && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(item.id)}>
                  {t('unlinkButton')}
                </Button>
              )}
            </li>
          ))}</ul>
        </div>
      )) : !error ? (
        <p className="muted-text">{t('noConnections')}</p>
      ) : null}
      {canWrite && showForm && (
        <div className="linked-items-search">
          <label>{t('relationLabel')}<select className="native-select" value={relation}
            onChange={(event) => setRelation(event.target.value as Relation)}>
            {catalog?.relationships.map((item) => <option key={item.kind} value={item.kind}>
              {item.forward_label}</option>)}
          </select></label>
          <label htmlFor={`link-search-${kind}-${id}`}>
            {showProjects ? t('searchLabelWithProjects') : t('searchLabelWithoutProjects')}
          </label>
          <input
            id={`link-search-${kind}-${id}`}
            className="native-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setResults([])
            }}
            placeholder={t('searchPlaceholder')}
          />
          {query.trim().length >= 2 && (
            <ul aria-label={t('searchResultsAria')}>
              {results
                .filter((item) => !visibleLinks?.some((edge) => edge.target.type === item.type && edge.target.id === item.id
                  && edge.relation === relation))
                .map((item) => (
                  <li key={`${item.type}-${item.id}`}>
                    <span className="row-subtitle">{labelFor(item.type)}</span> {item.title}{' '}
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void add(item)}>
                      {t('linkButton')}
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      {kind === 'note' && suggested && suggested.length > 0 && <div className="linked-suggestions">
        <h4>{t('suggestionsTitle')}</h4>
        <p className="muted-text">{t('suggestionsText')}</p>
        {suggested.map((item) => <div key={item.id} className="linked-suggestion">
          <div><StudyPeekLink id={item.id}>{item.title}</StudyPeekLink>
            <small>{item.course_name}{item.semester_name ? ` · ${item.semester_name}` : ''}
              {' · '}{t('sharedTermsLabel', { terms: item.shared_terms.join(', ') })}</small></div>
          {canWrite && <Button size="sm" variant="outline" disabled={busy}
            onClick={() => void add({ type: 'note', id: item.id, title: item.title, url: `/notes?id=${item.id}` })}>
            {t('linkButton')}
          </Button>}
        </div>)}
      </div>}
      {searchError && <Failure message={searchError} />}
      {actionError && <Failure message={actionError} />}
    </section>
  )
}
