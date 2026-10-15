// SPDX-License-Identifier: AGPL-3.0-or-later

import { CalendarClock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { request, localDate, useApi } from '@/api'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import type { StudyBlock } from '@/types'
import { focusPath } from '@/lib/learningFocus'

export function StudyBlocksPanel() {
  const { t } = useT('learning')
  const { data, error, loading } = useApi<StudyBlock[]>('/api/learning/blocks')
  const canWrite = useWritableHost()
  const decide = useApiMutation(
    ({ id, action }: { id: number; action: 'accept' | 'reject' }) =>
      request(`/api/learning/blocks/${id}/${action}`, { method: 'POST' }),
    { invalidate: ['/api/learning/blocks'] },
  )

  return (
    <Panel title={t('blocksTitle')} action={<CalendarClock size={20} />}>
      <p className="muted-text mb-4">{t('blocksIntro')}</p>
      {decide.error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {decide.error}
        </p>
      )}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : data?.length ? (
        <div className="row-list">
          {data.map((item) => (
            <div className="data-row study-block-row" key={item.id}>
              <strong>{item.topic}</strong>
              <span className="row-subtitle">
                {t('blocksMeta', { course: item.course_name, exam: item.exam_title, minutes: item.duration_minutes })}
              </span>
              <p className="study-block-time mt-1 text-sm">{localDate(item.starts_at)}</p>
              {item.exam_material_id && (
                <p className="row-subtitle mt-1">
                  {t('blocksNewToPractice')}{' '}
                  <Link to={`/material/${item.exam_material_id}`}>{item.exam_material_name}</Link>
                </p>
              )}
              {item.status === 'proposed' ? (
                <div className="study-block-actions mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!canWrite || decide.pending}
                    onClick={() => decide.mutate({ id: item.id, action: 'accept' })}
                  >
                    {t('blocksAccept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canWrite || decide.pending}
                    onClick={() => decide.mutate({ id: item.id, action: 'reject' })}
                  >
                    {t('blocksReject')}
                  </Button>
                </div>
              ) : (
                <div className="study-block-actions mt-2 flex flex-wrap items-center gap-3">
                  <p className="row-subtitle">{t('blocksAccepted')}</p>
                  {item.status === 'accepted' && (
                    <Button size="sm" asChild>
                      <Link to={focusPath({ kind: 'block', id: item.id })}>{t('focusStart')}</Link>
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={CalendarClock} title={t('blocksEmptyTitle')} text={t('blocksEmptyText')} />
      )}
    </Panel>
  )
}
