// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { useT } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Failure, Panel } from '@/components/State'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'

type Proposal = {
  id: number
  resource_name: string
  course_name: string
  version_id: number
  page_number: number
  quote: string
  candidate_date: string
  previous_due_at: string | null
}

function Review({ item, onDone }: { item: Proposal; onDone: () => void }) {
  const { t } = useT('deadlineProposals')
  const canWrite = useWritableHost()
  const [title, setTitle] = useState(`${item.resource_name.replace(/\.[^.]+$/, '')}${t('deadlineTitleSuffix')}`)
  const [when, setWhen] = useState(`${item.candidate_date}T23:59`)
  const decide = useApiMutation(
    (action: 'accept' | 'dismiss') => {
      const date = new Date(when)
      if (action === 'accept' && (!title.trim() || Number.isNaN(date.getTime()))) {
        throw new Error(t('validationError'))
      }
      return request(`/api/deadline-proposals/${item.id}/${action}`, {
        method: 'POST',
        ...(action === 'accept' ? { body: JSON.stringify({ title: title.trim(), due_at: date.toISOString() }) } : {}),
      })
    },
    { onSuccess: onDone },
  )
  const busy = decide.pending
  return (
    <article className="deadline-proposal">
      <strong>{item.resource_name}</strong>
      <span className="muted-text">{item.course_name}</span>
      <p>
        {item.previous_due_at
          ? t('previousToProposalLine', { previous: localDate(item.previous_due_at), proposal: item.candidate_date })
          : t('newProposalLine', { date: item.candidate_date })}
      </p>
      <p className="deadline-proposal-quote">
        {t('quoteOpen')}
        {item.quote}
        {t('quoteClose')}
      </p>
      <a href={`/material/${item.version_id}?page=${item.page_number}`}>
        {t('sourceLink', { page: item.page_number })}
      </a>
      <div className="deadline-proposal-fields">
        <label>
          {t('titleLabel')}
          <input maxLength={500} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          {t('dateTimeLabel')}
          <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
        </label>
      </div>
      <p className="muted-text">{t('timeHint')}</p>
      {decide.error && <Failure message={decide.error} />}
      <div className="note-editor-actions">
        <Button disabled={!canWrite || busy} onClick={() => decide.mutate('accept')}>
          {t('updateCalendarButton')}
        </Button>
        <Button variant="outline" disabled={!canWrite || busy} onClick={() => decide.mutate('dismiss')}>
          {t('ignoreButton')}
        </Button>
      </div>
    </article>
  )
}

export function DeadlineProposalsPanel({ onChanged }: { onChanged: () => void }) {
  const { t } = useT('deadlineProposals')
  const { data, reload } = useApi<Proposal[]>('/api/deadline-proposals')
  if (!data?.length) return null
  return (
    <Panel title={t('panelTitle', { count: data.length })}>
      <p className="muted-text">{t('intro')}</p>
      {data.map((item) => (
        <Review
          key={item.id}
          item={item}
          onDone={() => {
            reload()
            onChanged()
          }}
        />
      ))}
    </Panel>
  )
}
