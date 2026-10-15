// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { request } from '@/api'
import { useT } from '@/i18n/useT'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Failure, ListRows, Panel } from '@/components/State'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import type { SystemResponse } from '@/types'

/** The known semesters and a form to add one; days count from local midnight. */
export function SemestersPanel({ semesters, onCreated }: { semesters: SystemResponse['semesters']; onCreated: () => void }) {
  const canWrite = useWritableHost()
  const { t } = useT('system')
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const addSemester = useApiMutation(
    () =>
      request('/api/semesters', {
        method: 'POST',
        body: JSON.stringify({
          name,
          starts_at: new Date(`${start}T00:00:00`).toISOString(),
          ends_at: new Date(`${end}T00:00:00`).toISOString(),
        }),
      }),
    {
      onSuccess: () => {
        setName('')
        setStart('')
        setEnd('')
        onCreated()
      },
    },
  )
  const busy = addSemester.pending
  return (
    <Panel title={t('semestersTitle')}>
      <p className="muted-text mb-5">{t('semestersHint')}</p>
      {semesters.length > 0 && (
        <ListRows>
          {semesters.map((item) => (
            <div className="data-row" key={item.id}>
              <span className="course-icon small">
                <CalendarDays size={16} />
              </span>
              <div>
                <strong>{item.name}</strong>
                {item.is_current && <Badge className="ml-2 status-badge good">{t('current')}</Badge>}
              </div>
            </div>
          ))}
        </ListRows>
      )}
      {addSemester.error && <Failure message={addSemester.error} />}
      <form
        className="semester-form"
        onSubmit={(event) => {
          event.preventDefault()
          addSemester.mutate()
        }}
      >
        <label className="semester-field">
          <span>{t('semesterNameLabel')}</span>
          <Input
            value={name}
            disabled={!canWrite || busy}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('semesterNamePlaceholder')}
            required
          />
        </label>
        <label className="semester-field">
          <span>{t('startLabel')}</span>
          <Input
            value={start}
            disabled={!canWrite || busy}
            onChange={(event) => setStart(event.target.value)}
            type="date"
            required
          />
        </label>
        <label className="semester-field">
          <span>{t('endLabel')}</span>
          <Input
            value={end}
            disabled={!canWrite || busy}
            onChange={(event) => setEnd(event.target.value)}
            type="date"
            required
          />
        </label>
        <Button type="submit" disabled={busy || !canWrite}>
          {t('createSemester')}
        </Button>
      </form>
    </Panel>
  )
}
