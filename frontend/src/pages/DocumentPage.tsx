// SPDX-License-Identifier: AGPL-3.0-or-later

import { lazy, Suspense } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDownToLine, NotebookPen } from 'lucide-react'
import { useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { Failure, Loading, Panel } from '@/components/State'
import { UliBuddy } from '@/components/UliBuddy'
import { FileViewer } from '@/components/viewers/FileViewer'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import type { DocumentView } from '@/types'
import './DocumentPage.css'

const NoteMarkdownDocument = lazy(() => import('@/components/editor/RichNoteDocument'))

/**
 * A stored file without a PDF view, read inside UniOS: a Moodle "Seite" as text,
 * code, images, video, tables and Office files in their own viewer. Downloading
 * stays possible, but it is no longer the only way in.
 */
export function DocumentPage() {
  const { id } = useParams()
  const { t } = useT('material')
  const { t: nav } = useT('nav')
  const canWrite = useWritableHost()
  const { data, error, loading, updatedAt } = useApi<DocumentView>(`/api/documents/${id}`)
  const title = data?.resource_name ?? t('documentLoading')
  return (
    <Shell title={title} cachedAt={updatedAt}
      breadcrumbs={[{ label: nav('courses'), to: '/courses' },
        ...(data ? [{ label: data.course_name, to: `/courses/${data.course_id}` }] : []), { label: title }]}>
      {loading && !data ? <Loading /> : error && !data ? <Failure message={error} /> : data && <>
        <div className="document-actions">
          {canWrite && <Button asChild size="sm">
            <Link to={`/notes?new=1&course_id=${data.course_id}&title=${encodeURIComponent(data.resource_name)}`}>
              <NotebookPen size={15} aria-hidden="true" /> {t('documentPrepareNote')}
            </Link>
          </Button>}
          <Button asChild size="sm" variant="ghost">
            <a href={`/files/${data.version_id}`}><ArrowDownToLine size={15} aria-hidden="true" /> {t('documentDownload')}</a>
          </Button>
        </div>
        {data.view !== 'page' ? (
          <FileViewer versionId={data.version_id} kind={data.view} filename={data.filename} />
        ) : data.markdown.trim() ? (
          <article className="document-reading">
            <Suspense fallback={<Loading />}><NoteMarkdownDocument body={data.markdown} notes={[]} /></Suspense>
          </article>
        ) : (
          <Panel title={t('documentEmptyTitle')}>
            <div className="document-empty">
              <UliBuddy mood="awake" size={56} />
              <p className="muted-text">{t('documentEmptyText')}</p>
            </div>
          </Panel>
        )}
      </>}
    </Shell>
  )
}
