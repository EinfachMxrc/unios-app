// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, MessageCircleQuestion } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { request, useApi } from '@/api'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import type { CourseMaterial } from '@/types'
import { queryClient } from '@/offlineCache'

export function CourseMaterialPanel({ courseId }: { courseId: number }) {
  const { t } = useT('material')
  const canWrite = useWritableHost()
  const { data, error: initialError, refreshError, loading, reload } = useApi<CourseMaterial>(`/api/courses/${courseId}/material`)
  const error = initialError ?? refreshError
  const [body, setBody] = useState('')
  const [baseline, setBaseline] = useState<{ body: string; revision: number } | null>(null)
  const { t: task } = useT('ownTaskSupport')
  const dirty = baseline !== null && body !== baseline.body
  const changed = !!data && !!baseline && data.scratchpad_revision > baseline.revision
  const [documentId, setDocumentId] = useState('')
  const [status, setStatus] = useState('all')
  const documents = Array.from(new Map(data?.annotations.map((item) => [item.resource_id, item.resource_name]) ?? []))
  const visible = (data?.annotations ?? []).filter((item) => {
    if (documentId && item.resource_id !== Number(documentId)) return false
    if (status === 'open') return item.kind === 'question' && !item.resolved
    if (status === 'resolved') return item.kind === 'question' && item.resolved
    if (status === 'review') return item.anchor_status !== 'matched'
    if (status === 'highlights') return item.kind === 'highlight'
    return true
  })
  useEffect(() => {
    if (!data || dirty || baseline && data.scratchpad_revision < baseline.revision) return
    setBody(data.scratchpad)
    setBaseline({ body: data.scratchpad, revision: data.scratchpad_revision })
    // A refetch may hydrate a clean editor, never rebase an unsaved draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dirty])
  const save = useApiMutation(
    () => {
      if (!baseline) throw new Error('no course material loaded')
      return request<CourseMaterial>(`/api/courses/${courseId}/material/scratchpad`, {
        method: 'PUT',
        body: JSON.stringify({ expected_revision: baseline.revision, body }),
      })
    },
    { onSuccess: saved => {
      setBody(saved.scratchpad)
      setBaseline({ body: saved.scratchpad, revision: saved.scratchpad_revision })
      queryClient.setQueryData(['api', `/api/courses/${courseId}/material`], saved)
      reload()
    } },
  )
  return (
    <Panel title={t('myAnnotationsTitle')}>
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <Failure message={error} />
      ) : (
        data && (
          <>
            {error && <Failure message={error} retry={reload} />}
            {data.annotations.length > 0 && (
              <div className="activity-selects mb-4">
                <select
                  className="native-select"
                  aria-label={t('filterDocumentAria')}
                  value={documentId}
                  onChange={(event) => setDocumentId(event.target.value)}
                >
                  <option value="">{t('allDocuments')}</option>
                  {documents.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  className="native-select"
                  aria-label={t('filterStatusAria')}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">{t('statusAll')}</option>
                  <option value="open">{t('openQuestionsTitle')}</option>
                  <option value="resolved">{t('resolvedQuestionsLabel')}</option>
                  <option value="highlights">{t('kindHighlight')}</option>
                  <option value="review">{t('needsReview')}</option>
                </select>
              </div>
            )}
            {visible.length ? (
              <div className="row-list">
                {visible.map((item) => (
                  <div className="data-row" key={item.id}>
                    <MessageCircleQuestion size={17} className="row-icon" />
                    <div>
                      <Link to={`/material/${item.version_id}#annotation-${item.id}`}>{item.quote}</Link>
                      <span className="row-subtitle">
                        {item.resource_name} · {item.page ? t('pageLabel', { page: item.page }) : t('needsReview')} ·{' '}
                        {item.anchor_status !== 'matched'
                          ? t('needsReview')
                          : item.kind === 'highlight'
                            ? t('kindHighlight')
                            : item.resolved
                              ? t('resolvedLabel')
                              : t('openLabel')}
                      </span>
                      {item.comment && <p>{item.comment}</p>}
                      {item.kind === 'question' && item.linked_cards > 0 && (
                        <p className="row-subtitle">{t('linkedCardsCount', { count: item.linked_cards })}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                icon={MessageCircleQuestion}
                title={data.annotations.length ? t('noMatchingAnnotations') : t('noAnnotationsYet')}
                text={
                  data.annotations.length
                    ? t('chooseOtherFilter')
                    : t('markImportantSpot')
                }
              />
            )}
            {data.questions.some((item) => !item.resolved) && (
              <a className="subtle-link mt-4" href={`/api/courses/${courseId}/questions/export`}>
                <ArrowDownToLine size={15} /> {t('exportOpenQuestions')}
              </a>
            )}
            <div className="course-scratchpad">
              {changed && <div><p role="status">{task('propertiesChanged')}</p>
                <Button size="sm" variant="outline" disabled={save.pending} onClick={() => {
                  setBody(data.scratchpad)
                  setBaseline({ body: data.scratchpad, revision: data.scratchpad_revision })
                  save.reset()
                }}>{task('discardDraftReload')}</Button></div>}
              <label htmlFor="course-scratchpad">{t('scratchpadLabel')}</label>
              <textarea
                id="course-scratchpad"
                value={body}
                maxLength={10000}
                rows={3}
                disabled={!canWrite || save.pending}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t('scratchpadPlaceholder')}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!canWrite || !baseline || save.pending || changed || !dirty}
                onClick={() => save.mutate()}
              >
                {t('saveScratchpadButton')}
              </Button>
              {save.error && <Failure message={save.error} />}
            </div>
          </>
        )
      )}
    </Panel>
  )
}
