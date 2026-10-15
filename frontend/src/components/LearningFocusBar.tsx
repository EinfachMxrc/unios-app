// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useApi } from '@/api'
import { useT } from '@/i18n/useT'
import { focusApiPath, focusPath, readFocusRef, type LearningFocusContext } from '@/lib/learningFocus'
import './LearningFocusBar.css'

export function useLearningFocus() {
  const { search } = useLocation()
  const reference = readFocusRef(search)
  const requested = new URLSearchParams(search).has('focus')
  const result = useApi<LearningFocusContext>(reference ? focusApiPath(reference) : '/api/learning/focus/block/0', {
    enabled: reference !== null,
  })
  return { ...result, reference, requested }
}

export function LearningFocusBar({ focus }: { focus: ReturnType<typeof useLearningFocus> }) {
  const { t } = useT('learning')
  if (!focus.requested) return null
  return (
    <aside className="learning-focus-bar" aria-label={t('focusContextLabel')}>
      <Link to={focus.reference ? focusPath(focus.reference) : '/learning'}>
        <ArrowLeft size={16} aria-hidden="true" /> {t('focusBackToWork')}
      </Link>
      {focus.data && (
        <span>
          {focus.data.course_name}
          {focus.data.topics.length > 0 && ` · ${focus.data.topics.map((topic) => topic.name).join(', ')}`}
        </span>
      )}
      {(!focus.reference || focus.error) && <p role="status">{t('focusContextUnavailable')}</p>}
    </aside>
  )
}
