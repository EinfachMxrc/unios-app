// SPDX-License-Identifier: AGPL-3.0-or-later

import { lazy, Suspense, useCallback, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { ApiError } from '@/api'
import { Failure, Loading } from '@/components/State'
import { useT } from '@/i18n/useT'
import { guessDelimiter, parseCsv } from '@/lib/csvTable'
import type { FileViewKind } from '@/lib/materialView'
import { CodeView } from './CodeView'
import { TableView } from './TableView'
import { useFileContent } from './useFileContent'
import './viewers.css'

const DocxView = lazy(() => import('./OfficeViews').then(module => ({ default: module.DocxView })))
const XlsxView = lazy(() => import('./OfficeViews').then(module => ({ default: module.XlsxView })))

/** CSV beyond this many rows is cut off in the view; the download has everything. */
const CSV_ROWS = 1000

type Props = { versionId: number; kind: FileViewKind; filename: string }

function useFailureText() {
  const { t } = useT('material')
  return (cause: unknown) => cause instanceof ApiError && cause.status === 413
    ? t('viewerTooLarge')
    : t('viewerFailed', { reason: cause instanceof Error ? cause.message : String(cause) })
}

function TextFile({ versionId, kind, filename }: Props) {
  const content = useFileContent(versionId, 'text')
  const failureText = useFailureText()
  if (content.isPending) return <Loading />
  if (content.error) return <Failure message={failureText(content.error)} />
  if (kind === 'table') {
    const { rows, truncated } = parseCsv(content.data, guessDelimiter(content.data, filename), CSV_ROWS)
    return <TableView rows={rows} truncated={truncated} label={filename} />
  }
  return <CodeView text={content.data} filename={filename} />
}

function OfficeFile({ versionId, kind }: Props) {
  const { t } = useT('material')
  const content = useFileContent(versionId, 'arrayBuffer')
  const failureText = useFailureText()
  const [failure, setFailure] = useState('')
  const failed = useCallback((reason: string) => setFailure(t('viewerFailed', { reason })), [t])
  if (content.isPending) return <Loading />
  if (content.error) return <Failure message={failureText(content.error)} />
  if (failure) return <Failure message={failure} />
  return <Suspense fallback={<Loading />}>
    {kind === 'docx' ? <DocxView data={content.data} onError={failed} /> : <XlsxView data={content.data} onError={failed} />}
  </Suspense>
}

function ImageFile({ versionId, filename }: Props) {
  const { t } = useT('material')
  const [actual, setActual] = useState(false)
  return <figure className="image-view">
    <figcaption className="viewer-bar">
      <span>{filename}</span>
      <button type="button" aria-pressed={actual} onClick={() => setActual(!actual)}>
        {actual ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {actual ? t('viewerFitSize') : t('viewerActualSize')}
      </button>
    </figcaption>
    <div className={`image-view-body ${actual ? 'is-actual' : ''}`}>
      <img src={`/files/${versionId}/view`} alt={filename} />
    </div>
  </figure>
}

/** A stored file shown by UniOS itself, chosen by what the file is. */
export function FileViewer(props: Props) {
  switch (props.kind) {
    case 'image': return <ImageFile {...props} />
    case 'video': return <video className="media-view" src={`/files/${props.versionId}/view`} controls preload="metadata" />
    case 'audio': return <audio className="media-view" src={`/files/${props.versionId}/view`} controls preload="metadata" />
    case 'docx':
    case 'xlsx': return <OfficeFile {...props} />
    default: return <TextFile {...props} />
  }
}
