// SPDX-License-Identifier: AGPL-3.0-or-later

import { localDate, request, useApi } from '@/api'
import { useT } from '@/i18n/useT'
import { useWritableHost } from '@/hooks/host'
import { useApiMutation } from '@/hooks/useApiMutation'
import { queryClient } from '@/offlineCache'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './editor/StudioDialog'
import { Button } from './ui/button'
import { Failure, Loading } from './State'
import './ExamImpactDialog.css'

export type ExamImpact = {
  cycle_id: number
  exam_id: number
  exam_title: string
  old_exam_at: string
  current_exam_at: string | null
  planned_at: string
  revision: string
  history_count: number
  can_apply: boolean
  reasons: ('undated' | 'exam_past' | 'unchanged' | 'history_only' | 'phase_elapsed' | 'no_slot')[]
  phases: {
    id: number
    phase_label: string
    old_starts_at: string
    old_ends_at: string
    new_starts_at: string | null
    new_ends_at: string | null
  }[]
  blocks: { id: number; topic: string; duration_minutes: number; old_starts_at: string; new_starts_at: string | null }[]
}

export function ExamImpactDialog({
  cycleId,
  onClose,
  onApplied,
}: {
  cycleId: number
  onClose: () => void
  onApplied: () => void
}) {
  const { t } = useT('examImpact')
  const { data, error, loading, reload } = useApi<ExamImpact>(`/api/learning/cycles/${cycleId}/exam-impact`)
  const canWrite = useWritableHost()
  const apply = useApiMutation(
    (preview: ExamImpact) =>
      request(`/api/learning/cycles/${cycleId}/exam-impact`, {
        method: 'POST',
        body: JSON.stringify({ planned_at: preview.planned_at, revision: preview.revision }),
      }),
    {
      onSuccess: () => {
        void queryClient.invalidateQueries({
          predicate: (query) => {
            const path = query.queryKey[1]
            return (
              typeof path === 'string' &&
              (path.startsWith('/api/learning/') || path.startsWith('/api/timetable/') || path === '/api/overview')
            )
          },
        })
        onApplied()
      },
    },
  )
  const range = (start: string | null, end: string | null) =>
    start && end ? t('phaseDates', { start: localDate(start), end: localDate(end) }) : t('unavailable')
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !apply.pending) onClose()
      }}
    >
      <DialogContent
        className="studio-dialog exam-impact-dialog"
        onEscapeKeyDown={(event) => {
          if (apply.pending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (apply.pending) event.preventDefault()
        }}
      >
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('intro')}</DialogDescription>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <Failure message={error} />
        ) : (
          data && (
            <>
              <div className="exam-impact-summary">
                <strong>{data.exam_title}</strong>
                <span>{t('oldDate', { date: localDate(data.old_exam_at) })}</span>
                <span>
                  {t('newDate', { date: data.current_exam_at ? localDate(data.current_exam_at) : t('unknownDate') })}
                </span>
              </div>
              {data.phases.length > 0 && (
                <section aria-label={t('phases')}>
                  <h3>{t('phases')}</h3>
                  {data.phases.map((phase) => (
                    <article className="exam-impact-row" key={phase.id}>
                      <strong>{phase.phase_label}</strong>
                      <div>
                        <span>{t('before')}</span>
                        <p>{range(phase.old_starts_at, phase.old_ends_at)}</p>
                      </div>
                      <div>
                        <span>{t('after')}</span>
                        <p>{range(phase.new_starts_at, phase.new_ends_at)}</p>
                      </div>
                    </article>
                  ))}
                </section>
              )}
              {data.blocks.length > 0 && (
                <section aria-label={t('blocks')}>
                  <h3>{t('blocks')}</h3>
                  {data.blocks.map((block) => (
                    <article className="exam-impact-row" key={block.id}>
                      <strong>{t('block', { topic: block.topic, minutes: block.duration_minutes })}</strong>
                      <div>
                        <span>{t('before')}</span>
                        <p>{localDate(block.old_starts_at)}</p>
                      </div>
                      <div>
                        <span>{t('after')}</span>
                        <p>{block.new_starts_at ? localDate(block.new_starts_at) : t('unavailable')}</p>
                      </div>
                    </article>
                  ))}
                </section>
              )}
              <p className="muted-text">
                {data.history_count ? t('history', { count: data.history_count }) : t('noHistory')}
              </p>
              <p className="muted-text">{t('keepOfficial')}</p>
              {data.reasons.map((reason) => (
                <p key={reason} role="status">
                  {t(`reason_${reason}`)}
                </p>
              ))}
            </>
          )
        )}
        {apply.error && <p role="alert">{apply.error}</p>}
        {!canWrite && <p role="status">{t('readOnly')}</p>}
        <div className="exam-impact-actions">
          <Button variant="outline" disabled={apply.pending} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="outline"
            disabled={apply.pending || loading}
            onClick={() => {
              apply.reset()
              reload()
            }}
          >
            {t('refresh')}
          </Button>
          <Button
            disabled={!canWrite || !data?.can_apply || loading || apply.pending}
            onClick={() => {
              if (data) apply.mutate(data)
            }}
          >
            {apply.pending ? t('applying') : t('confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
