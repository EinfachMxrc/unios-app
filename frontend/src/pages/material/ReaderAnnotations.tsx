// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, type ReactNode } from 'react'
import type { PendingAnnotation } from '@/annotationQueue'
import { LinkedItems } from '@/components/LinkedItems'
import { EntityActions } from '@/components/EntityActions'
import { Panel } from '@/components/State'
import { useT } from '@/i18n/useT'
import type { Material, MaterialAnnotation } from '@/types'
import { AnnotationRow } from './ReaderParts'

export function ReaderAnnotations({ material, pending, canWrite, onPage, onUpdate, onDelete, onReanchor, onCreateCard, citations }: {
  material: Material
  pending: PendingAnnotation[]
  canWrite: boolean
  onPage: (page: number) => void
  onUpdate: (item: MaterialAnnotation, comment: string, resolved: boolean) => Promise<void>
  onDelete: (item: MaterialAnnotation) => Promise<void>
  onReanchor: (item: MaterialAnnotation) => void
  onCreateCard?: (item: MaterialAnnotation) => void
  /** Notes quoting this PDF, shown before the generic relationship list. */
  citations?: ReactNode
}) {
  const { t } = useT('material')
  const [filter, setFilter] = useState('')
  const term = filter.trim().toLocaleLowerCase()
  const visible = material.annotations.filter(item => !term || `${item.quote} ${item.comment}`.toLocaleLowerCase().includes(term))
  const review = visible.filter(item => item.anchor.status !== 'matched')
  const questions = visible.filter(item => item.anchor.status === 'matched' && item.kind === 'question' && !item.resolved)
  const highlights = visible.filter(item => item.anchor.status === 'matched' && (item.kind !== 'question' || item.resolved))
  const queued = pending.filter(item => item.versionId === material.version_id)
  function rows(items: MaterialAnnotation[]) {
    return items.map(item => <AnnotationRow key={item.id} item={item} onPage={onPage} onUpdate={onUpdate}
      onDelete={onDelete} onReanchor={onReanchor} onCreateCard={onCreateCard} disabled={!canWrite} />)
  }
  return <div className="material-side">
    {material.annotations.length > 0 && <input type="search" className="reader-annotation-filter"
      aria-label={t('searchAnnotations')} placeholder={t('searchAnnotations')} value={filter} maxLength={200}
      onChange={event => setFilter(event.target.value)} />}
    {review.length > 0 && <Panel title={t('reviewAnnotationsTitle')}>{rows(review)}</Panel>}
    {queued.length > 0 && <Panel title={t('pendingSyncTitle')}>
      {queued.map(item => <p className="muted-text" key={item.id}>
        {t(item.kind === 'question' ? 'pendingQuestion' : 'pendingHighlight', { quote: item.quote })}
      </p>)}
    </Panel>}
    <Panel title={t('openQuestionsTitle')}>
      {questions.length ? rows(questions) : <p className="muted-text">{t('noOpenQuestionsText')}</p>}
    </Panel>
    <Panel title={t('moreAnnotationsTitle')}>
      {highlights.length ? rows(highlights) : <p className="muted-text">{t(term ? 'noMatchingAnnotations' : 'noMoreAnnotations')}</p>}
    </Panel>
    {citations && <div id="reader-citations">{citations}</div>}
    <details className="reader-connections">
      <summary>{t('connectionsTitle')}</summary>
      <LinkedItems kind="resource" id={String(material.resource_id)} />
      <EntityActions resourceId={material.resource_id} />
    </details>
  </div>
}
