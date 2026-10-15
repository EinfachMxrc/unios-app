// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, type FormEvent } from 'react'
import { Dialog } from 'radix-ui'
import { Link } from 'react-router-dom'
import { ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import { useHostOnline } from '@/hostAvailability'
import { useManualCardDraft, updateManualDraft, saveManualDraft, startAnotherManualDraft, retryManualDraftRecovery,
  refreshManualDraftResult, checkManualDraftSource, acceptManualDraftSource, openCurrentManualDraft, adoptManualDraftCopy,
  openManualSentCopy, retryManualConflictCopy } from '@/manualCardDraft'
import { manualWebLocksAvailable } from '@/lib/manualDraftCoordination'
import { manualSourceUrl, type ManualCardContext } from '@/manualCardTypes'
import './ManualCardDialog.css'

export function ManualCardDialog({ context, canWrite, onClose, onCloseAutoFocus }: {
  context: ManualCardContext; canWrite: boolean; onClose: () => void; onCloseAutoFocus?: (event: Event) => void
}) {
  const { t } = useT('study')
  const online = useHostOnline()
  const state = useManualCardDraft(context)
  const { draft } = state
  const frontId = useId()
  const backId = useId()
  const topicId = useId()
  const descriptionId = useId()
  const source = draft.result?.source ?? draft.context
  const sourceUrl = manualSourceUrl(source)
  const locked = state.phase !== 'editing'
  const busy = state.phase === 'sending'
  const result = draft.result
  const invalid = !draft.front.trim() || !draft.back.trim() || !draft.topic.trim() ||
    draft.front.length > 4000 || draft.back.length > 8000 || draft.topic.length > 200
  const deckName = result?.deck_name ?? `Uni::${draft.context.course_name}`
  const coordinated = manualWebLocksAvailable()
  const sharedDraft = state.currentDraft ?? draft
  const copiesLocked = state.unresolvedCount > 0 || (!!sharedDraft.sent && !sharedDraft.result)
  useEffect(() => {
    window.addEventListener('unios:workspace-cleared', onClose)
    window.addEventListener('unios:manual-workspace-changed', onClose)
    return () => {
      window.removeEventListener('unios:workspace-cleared', onClose)
      window.removeEventListener('unios:manual-workspace-changed', onClose)
    }
  }, [onClose])
  const savedQueueId = result?.queue_id
  useEffect(() => { if (online && savedQueueId) void refreshManualDraftResult(context) }, [context, online, savedQueueId])

  function change(fields: Partial<Pick<typeof draft, 'front' | 'back' | 'topic'>>) {
    void updateManualDraft(context, fields)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite || !online || !coordinated || busy || result || invalid || (state.phase !== 'editing' && state.phase !== 'unconfirmed')) return
    void saveManualDraft(context)
  }
  function close() {
    if (state.storageError && !result && !window.confirm(t('manual.closeUnsafeConfirm'))) return false
    onClose()
    return true
  }

  return <Dialog.Root open onOpenChange={open => { if (!open) close() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="manual-card-overlay" />
      <Dialog.Content className="manual-card-dialog" aria-modal="true" aria-describedby={descriptionId}
        onCloseAutoFocus={onCloseAutoFocus}
        onPointerDownOutside={event => event.preventDefault()}>
        <header className="manual-card-header">
          <div>
            <Dialog.Title>{t('manual.title')}</Dialog.Title>
            <Dialog.Description id={descriptionId}>{t('manual.description')}</Dialog.Description>
          </div>
          <Button variant="ghost" size="icon" onClick={close} aria-label={t('manual.close')}>
            <X size={18} aria-hidden="true" />
          </Button>
        </header>
        <form className="manual-card-form" onSubmit={submit}>
          <div className="manual-card-body">
            <aside className="manual-card-source" aria-label={t('manual.sourceLabel')}>
              <strong>{source.resource_name}</strong>
              <span>{t('manual.sourcePosition', { version: source.version, page: source.page })}</span>
              <blockquote>{source.quote}</blockquote>
              {sourceUrl && <Link className="subtle-link" to={sourceUrl} onClick={event => { if (!close()) event.preventDefault() }}>
                {t('manual.openSource')} <ExternalLink size={14} aria-hidden="true" />
              </Link>}
            </aside>
            <div className="manual-card-fields">
              <label htmlFor={frontId}>{t('manual.front')}</label>
              <textarea id={frontId} rows={3} value={draft.front} maxLength={4000} required disabled={locked}
                placeholder={t('manual.frontPlaceholder')} onChange={event => change({ front: event.target.value })} />
              <label htmlFor={backId}>{t('manual.back')}</label>
              <textarea id={backId} rows={5} value={draft.back} maxLength={8000} required disabled={locked}
                onChange={event => change({ back: event.target.value })} />
              <label htmlFor={topicId}>{t('manual.topic')}</label>
              <input id={topicId} value={draft.topic} maxLength={200} required disabled={locked}
                onChange={event => change({ topic: event.target.value })} />
              <p className="muted-text">{t('manual.topicHint')}</p>
              <p className="manual-card-deck">{t('manual.destination', { deck: deckName })}</p>
              {!locked && <p className="muted-text">{t('manual.confirmationHint')}</p>}
              {state.storageError && <p role="alert">{t('manual.localFailure')}</p>}
              {state.phase === 'unavailable' && <Button type="button" variant="outline" onClick={() => retryManualDraftRecovery(context)}>
                {t('manual.retryRecovery')}
              </Button>}
              {draft.front.length > 4000 || draft.back.length > 8000 || draft.topic.length > 200 ?
                <p role="alert">{t('manual.tooLong')}</p> : null}
              {state.localSaved && !result && <p role="status" className="muted-text">{t('manual.localSaved')}</p>}
              {state.phase === 'conflict' && <div className="manual-card-result">
                <p role="alert">{t('manual.conflict')}</p>
                <p>{t('manual.conflictHint')}</p>
                <Button type="button" variant="outline" disabled={!state.localSaved} onClick={() => void openCurrentManualDraft(context)}>
                  {t('manual.openCurrent')}
                </Button>
                {!state.localSaved && <Button type="button" variant="outline" onClick={() => void retryManualConflictCopy(context)}>
                  {t('manual.retryCopy')}
                </Button>}
              </div>}
              {state.recoveryCopies.length > 0 && <section className="manual-card-copies" aria-label={t('manual.copiesTitle')}>
                <h3>{t('manual.copiesTitle')}</h3>
                <p>{t(state.phase === 'unavailable' ? 'manual.unverifiedCopies' : 'manual.copiesHint')}</p>
                {state.recoveryCopies.map(copy => <article key={copy.id} className="manual-card-copy">
                  <dl>
                    <dt>{t('manual.front')}</dt><dd>{copy.draft.front}</dd>
                    <dt>{t('manual.back')}</dt><dd>{copy.draft.back}</dd>
                    <dt>{t('manual.topic')}</dt><dd>{copy.draft.topic}</dd>
                  </dl>
                  <p>{t('manual.sourcePosition', { version: copy.draft.context.version, page: copy.draft.context.page })}</p>
                  {copy.draft.sent && !copy.draft.result ?
                    <Button type="button" variant="outline" disabled={busy || !state.localSaved || state.phase === 'unavailable'}
                      onClick={() => void openManualSentCopy(context, copy.id)}>{t('manual.openSentCopy')}</Button> :
                    <Button type="button" variant="outline" disabled={copiesLocked || busy || !state.localSaved || state.phase === 'unavailable'}
                      onClick={() => void adoptManualDraftCopy(context, copy.id)}>
                      {t(sharedDraft.result ? 'manual.copyAsAnother' : 'manual.adoptCopy')}
                    </Button>}
                </article>)}
                {copiesLocked && <p>{t('manual.copiesLocked')}</p>}
              </section>}
              {state.phase === 'unconfirmed' && <p role="alert">{t('manual.unconfirmed')}</p>}
              {(state.phase === 'sourceChanged' || state.phase === 'checkingSource') && <div className="manual-card-result">
                <p role="alert">{t('manual.sourceChanged')}</p>
                {state.reviewedSource && <>
                  <strong>{t('manual.reviewSourceTitle')}</strong>
                  <p>{state.reviewedSource.resource_name} · {t('manual.sourcePosition', {
                    version: state.reviewedSource.version, page: state.reviewedSource.page,
                  })}</p>
                  <blockquote>{state.reviewedSource.quote}</blockquote>
                  <p>{t('manual.reviewSourceHint')}</p>
                  <Button type="button" variant="outline" disabled={state.unresolvedCount > 0} onClick={() => void acceptManualDraftSource(context)}>
                    {t('manual.acceptSource')}
                  </Button>
                </>}
              </div>}
              {state.error && <p role="alert">{state.error}</p>}
              {result && <div role="status" className="manual-card-result">
                <strong>{t(result.status === 'pushed' ? 'manual.transferred' : 'manual.pendingTransfer')}</strong>
                <p>{t(result.status === 'pushed' ? 'manual.schedulingHint' : 'manual.transferHint')}</p>
                {result.transfer_error && <p>{result.transfer_error}</p>}
                <Link className="subtle-link" to={`/study/cards#card-${result.queue_id}`} onClick={close}>
                  {t('manual.openQueue')}
                </Link>
              </div>}
            </div>
          </div>
          <footer className="manual-card-actions">
            {result ? <Button type="button" variant="outline" disabled={state.phase !== 'saved' || !state.localSaved || state.unresolvedCount > 0} onClick={() => void startAnotherManualDraft(context)}>
              {t('manual.newCard')}
            </Button> : state.phase === 'sourceChanged' || state.phase === 'checkingSource' ?
              <Button type="button" variant="outline" disabled={!online || state.phase === 'checkingSource'}
                onClick={() => void checkManualDraftSource(context)}>{t('manual.checkSource')}</Button> :
              <Button type="submit" disabled={!canWrite || !online || !coordinated || busy || state.phase === 'loading' || state.phase === 'unavailable' || state.phase === 'conflict' || invalid}
              aria-busy={busy}>
              {t(busy ? 'manual.saving' : state.phase === 'unconfirmed' ? 'manual.retryExact' : 'manual.save')}
            </Button>}
            <Button type="button" variant="ghost" onClick={close}>{t('manual.close')}</Button>
            {(!online || !canWrite) && !result && <p className="muted-text">{t('manual.writeLocked')}</p>}
            {!coordinated && !result && <p role="status">{t('manual.coordinationUnavailable')}</p>}
          </footer>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
