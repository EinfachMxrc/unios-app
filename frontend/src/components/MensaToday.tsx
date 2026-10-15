// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Utensils } from 'lucide-react'
import { activeIntlLocale, request, useApi } from '@/api'
import { useT } from '@/i18n/useT'
import { Failure, Panel } from './State'
import { MealDietBadge } from './MealDietBadge'
import { campusClock, lunchVisible, visibleMeals, reminderTime, useLunchSettings } from '@/lib/mensa'
import type { Menu, UniversityServices } from '@/lib/mensa'

export function MensaToday() {
  const { t } = useT('mensa')
  const { data: services } = useApi<UniversityServices>('/api/mensa/services')
  const settings = useLunchSettings()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const clock = campusClock(now, services?.timezone ?? 'Europe/Berlin')
  const canteen = services?.canteens.find((item) => item.slug === settings.canteen) ?? services?.canteens[0]
  const path = `/api/mensa/plan?canteen=${encodeURIComponent(canteen?.slug ?? '')}&day=${clock.day}`
  const menu = useQuery<Menu>({
    queryKey: ['api', path],
    queryFn: ({ signal }) => request(path, { signal }),
    enabled: !!canteen && settings.enabled,
    refetchInterval: 3_600_000,
    meta: { offlineCache: true },
    networkMode: 'always',
  })
  if (!canteen || !lunchVisible(clock.minutes, settings)) return null
  return (
    <div className="mb-6" data-testid="mensa-today">
      <Panel title={t('today')} action={<Link to="/mensa">{t('all')} →</Link>}>
        <p className="row-subtitle flex items-center gap-2">
          <Utensils size={16} />
          {canteen.name} · {t('preview', { time: settings.breakTime, reminder: reminderTime(settings) })}
        </p>
        {menu.data ? (
          <>
            <ul className="mensa-preview">
              {visibleMeals(menu.data.meals, settings.diet)
                .slice(0, 3)
                .map((meal, index) => (
                  <li key={`${meal.name}-${index}`}>
                    {meal.image_url && (
                      <img
                        className="mensa-preview-photo"
                        src={meal.image_url}
                        alt={meal.name}
                        loading="lazy"
                        decoding="async"
                        onError={(event) => {
                          event.currentTarget.hidden = true
                        }}
                      />
                    )}
                    <span className="mensa-preview-meal">
                      <span>{meal.name}</span>
                      <MealDietBadge meal={meal} diet={settings.diet} />
                    </span>
                    {meal.student_price !== null && (
                      <strong>
                        {new Intl.NumberFormat(activeIntlLocale(), { style: 'currency', currency: 'EUR' }).format(
                          meal.student_price,
                        )}
                      </strong>
                    )}
                  </li>
                ))}
            </ul>
            {!visibleMeals(menu.data.meals, settings.diet).length && (
              <p className="muted-text">{menu.data.meals.length ? t('noMatchingMeals') : t('empty')}</p>
            )}
            {(menu.data.stale || menu.isError) && <p role="status">{t('stale')}</p>}
          </>
        ) : menu.isError ? (
          <Failure message={menu.error.message} />
        ) : (
          <p className="muted-text">{t('loading')}</p>
        )}
      </Panel>
    </div>
  )
}
