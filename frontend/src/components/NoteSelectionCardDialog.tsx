// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useId, type FormEvent } from 'react'
import { Dialog } from 'radix-ui'
import { Link } from 'react-router-dom'
import { ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import { useHostOnline } from '@/hostAvailability'
import { manualWebLocksAvailable } from '@/lib/manualDraftCoordination'
import { useNoteCardDraft, saveNoteCardDraft, updateNoteCardDraft, startAnotherNoteCardDraft } from '@/noteCardDraft'
import type { NoteCardContext } from '@/noteCardTypes'
import './ManualCardDialog.css'

export function NoteSelectionCardDialog({
  context,
  canWrite,
  onClose,
  onCloseAutoFocus,
}: {
  context: NoteCardContext
  canWrite: boolean
  onClose: () => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const { t } = useT('noteCards')
  const online = useHostOnline(),
    state = useNoteCardDraft(context)
  const frontId = useId(),
    backId = useId(),
    topicId = useId(),
    descriptionId = useId()
  const { draft } = state,
    result = draft.result
  const busy = state.phase === 'sending',
    editing = state.phase === 'editing'
  const invalid =
    !draft.front.trim() ||
    !draft.back.trim() ||
    !draft.topic.trim() ||
    draft.front.length > 4000 ||
    draft.back.length > 8000 ||
    draft.topic.length > 200
  const source = result?.source
  useEffect(() => {
    window.addEventListener('unios:workspace-cleared', onClose)
    window.addEventListener('unios:manual-workspace-changed', onClose)
    return () => {
      window.removeEventListener('unios:workspace-cleared', onClose)
      window.removeEventListener('unios:manual-workspace-changed', onClose)
    }
  }, [onClose])
  function close() {
    if (!state.localSaved && !result && !window.confirm(t('closeUnsafeConfirm'))) return false
    onClose()
    return true
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite || !online || invalid || !state.localSaved || busy || result) return
    void saveNoteCardDraft(context)
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="manual-card-overlay" />
        <Dialog.Content
          className="manual-card-dialog"
          aria-describedby={descriptionId}
          onCloseAutoFocus={onCloseAutoFocus}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <header className="manual-card-header">
            <div>
              <Dialog.Title>{t('title')}</Dialog.Title>
              <Dialog.Description id={descriptionId}>{t('description')}</Dialog.Description>
            </div>
            <Button variant="ghost" size="icon" aria-label={t('close')} onClick={close}>
              <X size={18} aria-hidden="true" />
            </Button>
          </header>
          <form className="manual-card-form" onSubmit={submit}>
            <div className="manual-card-body">
              <aside className="manual-card-source" aria-label={t('sourceLabel')}>
                <strong>{source?.note_title ?? context.title}</strong>
                <span>{t('sourcePosition', { revision: source?.revision ?? context.revision })}</span>
                <blockquote>{source?.quote ?? context.quote}</blockquote>
                <Link
                  className="subtle-link"
                  to={`/notes?id=${context.noteId}&revision=${context.revision}`}
                  onClick={(event) => {
                    if (!close()) event.preventDefault()
                  }}
                >
                  {t('openSource')} <ExternalLink size={14} aria-hidden="true" />
                </Link>
              </aside>
              <div className="manual-card-fields">
                <label htmlFor={frontId}>{t('front')}</label>
                <textarea
                  id={frontId}
                  rows={3}
                  value={draft.front}
                  maxLength={4000}
                  required
                  disabled={!editing}
                  placeholder={t('frontPlaceholder')}
                  onChange={(event) => void updateNoteCardDraft(context, { front: event.target.value })}
                />
                <label htmlFor={backId}>{t('back')}</label>
                <textarea
                  id={backId}
                  rows={5}
                  value={draft.back}
                  maxLength={8000}
                  required
                  disabled={!editing}
                  onChange={(event) => void updateNoteCardDraft(context, { back: event.target.value })}
                />
                <label htmlFor={topicId}>{t('topic')}</label>
                <input
                  id={topicId}
                  value={draft.topic}
                  maxLength={200}
                  required
                  disabled={!editing}
                  onChange={(event) => void updateNoteCardDraft(context, { topic: event.target.value })}
                />
                <p className="muted-text">
                  {t('destination', { deck: result?.deck_name ?? `Uni::${context.courseName}` })}
                </p>
                {editing && <p className="muted-text">{t('confirmationHint')}</p>}
                {state.localSaved && !result && (
                  <p role="status" className="muted-text">
                    {t('localSaved')}
                  </p>
                )}
                {state.phase === 'unconfirmed' && <p role="status">{t('unconfirmed')}</p>}
                {state.error && <p role="alert">{state.error}</p>}
                {result && (
                  <div role="status" className="manual-card-result">
                    <strong>{t(result.status === 'pushed' ? 'transferred' : 'pendingTransfer')}</strong>
                    <p>{t(result.status === 'pushed' ? 'schedulingHint' : 'transferHint')}</p>
                    {result.transfer_error && <p>{result.transfer_error}</p>}
                    <Link className="subtle-link" to={`/study/cards#card-${result.queue_id}`} onClick={close}>
                      {t('openQueue')}
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <footer className="manual-card-actions">
              {result && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!state.localSaved || state.phase !== 'saved'}
                  onClick={() => void startAnotherNoteCardDraft(context)}
                >
                  {t('newCard')}
                </Button>
              )}
              {!result && (
                <Button
                  type="submit"
                  disabled={
                    !canWrite ||
                    !online ||
                    !manualWebLocksAvailable() ||
                    invalid ||
                    !state.localSaved ||
                    !['editing', 'unconfirmed'].includes(state.phase)
                  }
                  aria-busy={busy}
                >
                  {t(busy ? 'saving' : state.phase === 'unconfirmed' ? 'retryExact' : 'save')}
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={close}>
                {t('close')}
              </Button>
              {(!online || !canWrite) && !result && <p className="muted-text">{t('writeLocked')}</p>}
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
