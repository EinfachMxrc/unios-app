// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PanelRight, Quote } from 'lucide-react'
import { useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Failure, Panel } from '@/components/State'
import { useT } from '@/i18n/useT'
import type { components } from '@/generated/api'
import type { Material } from '@/types'
import './ReaderCitations.css'

type MaterialCitations = components['schemas']['MaterialCitationsView']
export type MaterialCitation = components['schemas']['MaterialCitationView']

/** Notes quoting this PDF, newest first. Refetches whenever a new excerpt was taken. */
export function useReaderCitations(versionId: number, excerptRevision: number) {
  const result = useApi<MaterialCitations>(`/api/material/${versionId}/citations`)
  const { reload } = result
  useEffect(() => {
    if (excerptRevision > 0) void reload()
  }, [excerptRevision, reload])
  return result
}

/** Citing-note count per page of the open version; older versions keep their own page numbers. */
export function citationsByPage(citations: MaterialCitation[] | undefined) {
  const pages = new Map<number, number>()
  for (const citation of citations ?? []) {
    if (!citation.current_version) continue
    for (const page of citation.pages) pages.set(page, (pages.get(page) ?? 0) + 1)
  }
  return pages
}

export function ReaderCitations({
  material,
  citations,
  error,
  retry,
  onPage,
  onOpenBeside,
}: {
  material: Material
  citations: MaterialCitation[] | undefined
  error: string | null
  retry: () => void
  onPage: (page: number) => void
  onOpenBeside: (noteId: string) => void
}) {
  const { t } = useT('material')
  const items = useMemo(() => citations ?? [], [citations])
  return (
    <Panel title={t('citationsTitle')}>
      {error && !citations ? (
        <Failure message={t('citationsFailed')} retry={retry} />
      ) : items.length === 0 ? (
        <p className="muted-text">{t('citationsEmpty')}</p>
      ) : (
        <ul className="reader-citations">
          {items.map((item) => {
            const sameCourse = item.course_name === material.course_name
            return (
              <li key={item.note_id}>
                <div className="reader-citation-head">
                  <Quote size={14} aria-hidden="true" />
                  <strong>{item.title}</strong>
                  {!sameCourse && <span className="muted-text">{item.course_name}</span>}
                  {!item.current_version && (
                    <span className="reader-citation-version">{t('citationsOlderVersion')}</span>
                  )}
                </div>
                {item.current_version && (
                  <div className="reader-citation-pages">
                    {item.pages.map((page) => (
                      <button
                        type="button"
                        key={page}
                        onClick={() => onPage(page)}
                        aria-label={t('citationsPageAria', { page })}
                      >
                        {t('citationsPage', { page })}
                      </button>
                    ))}
                  </div>
                )}
                <div className="reader-citation-actions">
                  {sameCourse && (
                    <Button variant="ghost" size="sm" onClick={() => onOpenBeside(item.note_id)}>
                      <PanelRight size={14} aria-hidden="true" /> {t('citationsOpenBeside')}
                    </Button>
                  )}
                  <Link className="subtle-link" to={`/notes?id=${encodeURIComponent(item.note_id)}`}>
                    {t('citationsOpenNote')}
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
