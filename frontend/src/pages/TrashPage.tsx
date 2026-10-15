// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { NotebookPen, RotateCcw, StickyNote, Trash2 } from 'lucide-react'
import { localDate, useApi } from '@/api'
import { ActionFeedback } from '@/components/ActionFeedback'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Shell } from '@/components/Shell'
import { Empty, Failure, Loading } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useT } from '@/i18n/useT'
import { emptyTrash, eraseFromTrash, restoreFromTrash, type TrashItem } from '@/lib/trash'
import './TrashPage.css'

type Pending = { kind: 'erase'; item: TrashItem } | { kind: 'empty' } | null

/** Deleted notes and quick notes: bring them back, or erase them after one confirmation. */
export function TrashPage() {
  const { t } = useT('trash')
  const canWrite = useWritableHost()
  const { data, loading, error, updatedAt, reload } = useApi<{ items: TrashItem[] }>('/api/trash')
  const [confirming, setConfirming] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const items = data?.items ?? []

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setFeedback(null)
    try {
      setFeedback({ tone: 'success', message: await action() })
    } catch (cause) {
      setFeedback({ tone: 'error', message: t('failed', { reason: extractApiErrorMessage(cause) }) })
    } finally {
      setBusy(false)
      setConfirming(null)
      reload()
    }
  }
  const restore = (item: TrashItem) => run(async () => {
    await restoreFromTrash(item.kind, item.id)
    return t('restored', { title: item.title })
  })
  const confirmed = () => {
    if (confirming?.kind === 'erase') {
      const { item } = confirming
      void run(async () => {
        await eraseFromTrash(item.kind, item.id)
        return t('erased', { title: item.title })
      })
    } else if (confirming?.kind === 'empty') {
      void run(async () => t('emptied', { count: await emptyTrash() }))
    }
  }

  return (
    <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')} cachedAt={updatedAt}>
      <div className="trash-head">
        <p className="muted-text">{t('intro')}</p>
        {items.length > 0 && (
          <Button variant="outline" size="sm" disabled={!canWrite || busy} onClick={() => setConfirming({ kind: 'empty' })}>
            <Trash2 size={15} /> {t('emptyTrash')}
          </Button>
        )}
      </div>
      {feedback && <ActionFeedback tone={feedback.tone} message={feedback.message} />}
      {loading && !data ? <Loading /> : error && !data ? <Failure message={error} retry={reload} /> : !items.length ? (
        <Empty icon={Trash2} title={t('emptyTitle')} text={t('emptyText')} />
      ) : (
        <ul className="trash-list">
          {items.map(item => {
            const Icon = item.kind === 'note' ? NotebookPen : StickyNote
            return (
              <li key={`${item.kind}-${item.id}`} className="trash-row">
                <Icon size={18} aria-hidden="true" className="trash-row-icon" />
                <div className="trash-row-text">
                  <strong>{item.title}</strong>
                  <small>
                    {item.kind === 'note' ? t('kindNote') : t('kindJot')} · {item.course_name ?? t('noCourse')} · {t('deletedOn', { date: localDate(item.deleted_at) })}
                  </small>
                </div>
                <div className="trash-row-actions">
                  <Button variant="outline" size="sm" disabled={!canWrite || busy} aria-label={t('restoreLabel', { title: item.title })}
                    onClick={() => void restore(item)}>
                    <RotateCcw size={14} /> {t('restore')}
                  </Button>
                  <Button variant="ghost" size="sm" className="trash-erase" disabled={!canWrite || busy}
                    aria-label={t('eraseLabel', { title: item.title })} onClick={() => setConfirming({ kind: 'erase', item })}>
                    {t('erase')}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {confirming && (
        <ConfirmDialog
          title={confirming.kind === 'empty' ? t('emptyTrashTitle') : t('eraseTitle')}
          text={confirming.kind === 'empty' ? t('emptyTrashText', { count: items.length }) : t('eraseText', { title: confirming.item.title })}
          confirm={confirming.kind === 'empty' ? t('emptyTrash') : t('erase')}
          cancel={t('cancel')}
          busy={busy}
          onConfirm={confirmed}
          onCancel={() => setConfirming(null)}
        />
      )}
    </Shell>
  )
}
