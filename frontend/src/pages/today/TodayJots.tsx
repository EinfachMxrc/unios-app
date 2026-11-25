// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { ArrowRight, StickyNote } from 'lucide-react'
import { localDate, useApi } from '@/api'
import { useT } from '@/i18n/useT'
import type { JotsResponse } from '@/types'
import { TodaySection } from './TodaySection'

const SHOWN = 4

/** Quick notes that are not part of a note yet, waiting to be worked in. */
export function TodayJots() {
  const { t } = useT('today')
  const { data } = useApi<JotsResponse>('/api/jots')
  const open = (data?.jots ?? []).filter((jot) => !jot.note_id)
  if (!open.length) return null
  return (
    <TodaySection id="jots" icon={StickyNote} title={t('jotsTitle')} to="/jots" linkLabel={t('allJots')}>
      <ul className="today-jots">
        {open.slice(0, SHOWN).map((jot) => (
          <li key={jot.id}>
            <span title={jot.body}>{jot.body}</span>
            <time dateTime={jot.created_at}>{localDate(jot.created_at, { day: '2-digit', month: '2-digit' })}</time>
            <Link to={`/jots?id=${jot.id}`} aria-label={t('refineJot', { text: jot.body.slice(0, 60) })}>
              {t('refine')} <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </TodaySection>
  )
}
