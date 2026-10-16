// SPDX-License-Identifier: AGPL-3.0-or-later
import { lazy, Suspense, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, X } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { useWorkspaceTabNavigation } from '@/hooks/useWorkspaceTabNavigation'
import { Loading } from '@/components/State'
import type { Item } from './collectionModel'
import { kindLabels } from './collectionModel'
import '@/components/TaskPeekDrawer.css'
import './CollectionPreview.css'

const PdfPreview = lazy(() => import('./CollectionPdfPreview'))
const NotePreview = lazy(() => import('./CollectionNotePreview'))

export function CollectionPreview({ item, onClose }: { item: Item; onClose: () => void }) {
  const { t } = useT('collections')
  const navigation = useWorkspaceTabNavigation()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const current = dialog.current
    current?.showModal()
    return () => current?.close()
  }, [])
  const close = () => dialog.current?.close()
  const pdf = /^\/material\/([1-9]\d*)(?:[?#]|$)/.exec(item.url)
  return (
    <dialog
      ref={dialog}
      className="task-peek collection-peek"
      aria-label={t('previewTitle', { title: item.title })}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) close()
      }}
    >
      <div className="task-peek-content">
        <header>
          <span>{kindLabels(t)[item.kind]}</span>
          <button type="button" aria-label={t('closePreview')} onClick={close}>
            <X size={18} />
          </button>
        </header>
        <h2>{item.title}</h2>
        <p className="collection-preview-context">{item.course_name}</p>
        <div className="collection-preview-actions">
          <Link to={item.url} onClick={close}>
            {t('openContent')} <ArrowUpRight size={14} />
          </Link>
          <button
            type="button"
            onClick={() => {
              close()
              navigation.open(item.url)
            }}
          >
            {t('openContentTab')}
          </button>
        </div>
        <Suspense fallback={<Loading variant="rows" />}>
          {item.kind === 'notes' ? (
            <NotePreview id={item.id} />
          ) : pdf ? (
            <PdfPreview id={Number(pdf[1])} />
          ) : (
            <div className="collection-preview-facts">
              <p>{item.subtitle}</p>
              {item.status && <p>{item.status}</p>}
              {!!item.tags.length && <p>{item.tags.map((tag) => `#${tag}`).join(' · ')}</p>}
            </div>
          )}
        </Suspense>
      </div>
    </dialog>
  )
}
