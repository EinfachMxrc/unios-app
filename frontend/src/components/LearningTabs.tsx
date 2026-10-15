// SPDX-License-Identifier: AGPL-3.0-or-later

import { ScrollTabs } from '@/components/ScrollTabs'
import { useT } from '@/i18n/useT'
import { NavLink } from 'react-router-dom'
export function LearningTabs() {
  const { t } = useT('learning')
  return (
    <ScrollTabs className="learning-tabs" label={t('tabsAriaLabel')}>
      <NavLink to="/learning" end className={({ isActive }) => (isActive ? 'active' : '')}>
        {t('tabOverview')}
      </NavLink>
      <NavLink to="/study" className={({ isActive }) => (isActive ? 'active' : '')}>
        {t('tabFlashcards')}
      </NavLink>
      <NavLink to="/assessment" className={({ isActive }) => (isActive ? 'active' : '')}>
        {t('tabAssessment')}
      </NavLink>
      <NavLink to="/coding" className={({ isActive }) => (isActive ? 'active' : '')}>
        {t('tabCoding')}
      </NavLink>
    </ScrollTabs>
  )
}
