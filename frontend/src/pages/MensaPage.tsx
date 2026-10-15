// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { ArrowLeft, ArrowRight, Soup, Utensils } from 'lucide-react'
import { activeIntlLocale, localDate, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { Empty, Failure } from '@/components/State'
import { Button } from '@/components/ui/button'
import { MealDietBadge } from '@/components/MealDietBadge'
import { useT } from '@/i18n/useT'
import { campusClock, visibleMeals, reminderTime, saveLunchSettings, shiftMenuDay, useLunchSettings } from '@/lib/mensa'
import type { DietPreference, LunchSettings, Meal, Menu, UniversityServices } from '@/lib/mensa'
import './MensaPage.css'

const categories = [
  'main',
  'vegan',
  'pasta_counter',
  'food_truck',
  'side',
  'salad',
  'dessert',
  'night',
  'other',
] as const
function MealPhoto({ meal, reserved }: { meal: Meal; reserved: boolean }) {
  const { t } = useT('mensa')
  const [failed, setFailed] = useState(false)
  if (!reserved) return null
  return meal.image_url && !failed ? (
    <img
      className="meal-photo"
      src={meal.image_url}
      alt={meal.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="meal-photo meal-photo-placeholder">
      <span className="meal-photo-symbol" aria-hidden="true">
        <Soup size={36} strokeWidth={1.25} />
      </span>
      <span>{t('noPhoto')}</span>
    </div>
  )
}

export function MensaPage() {
  const { t } = useT('mensa')
  const { data: services, error: servicesError } = useApi<UniversityServices>('/api/mensa/services')
  const saved = useLunchSettings()
  const [settings, setSettings] = useState(saved)
  const [selectedDay, setDay] = useState('')
  const today = campusClock(new Date(), services?.timezone ?? 'Europe/Berlin').day
  const day = selectedDay || today
  const canteen = services?.canteens.find((item) => item.slug === settings.canteen) ?? services?.canteens[0]
  const {
    data: menu,
    error,
    loading,
    reload,
  } = useApi<Menu>(`/api/mensa/plan?canteen=${encodeURIComponent(canteen?.slug ?? '')}&day=${day}`, {
    enabled: !!canteen,
  })
  const [message, setMessage] = useState('')
  const allMeals = menu?.meals ?? []
  const meals = visibleMeals(allMeals, settings.diet)
  const visible = new Set(meals)
  function update(value: Partial<LunchSettings>) {
    const next = { ...settings, canteen: canteen?.slug ?? '', ...value }
    try {
      saveLunchSettings(next)
      setSettings(next)
      setMessage('')
      return true
    } catch {
      setMessage(t('saveError'))
      return false
    }
  }
  return (
    <Shell title={t('title')} eyebrow={t('subtitle')}>
      <div className="mensa-page">
        {servicesError && <Failure message={servicesError} />}
        {services && !canteen ? (
          <Empty icon={Utensils} title={t('plan')} text={t('unconfigured')} />
        ) : (
          <>
            <div className="mensa-toolbar">
              <label>
                {t('canteen')}
                <select
                  className="native-select"
                  value={canteen?.slug ?? ''}
                  onChange={(event) => update({ canteen: event.target.value })}
                >
                  {services?.canteens.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('dietPreference')}
                <select
                  className="native-select"
                  value={settings.diet}
                  onChange={(event) => update({ diet: event.target.value as DietPreference })}
                >
                  <option value="all">{t('dietAll')}</option>
                  <option value="vegetarian">{t('dietVegetarian')}</option>
                  <option value="vegan">{t('dietVegan')}</option>
                  <option value="pescatarian">{t('dietPescatarian')}</option>
                </select>
              </label>
              <Button variant="ghost" onClick={reload}>
                {t('retry')}
              </Button>
            </div>
            <div className="menu-day-navigation">
              <Button
                variant="outline"
                aria-label={t('previousDay')}
                disabled={day <= shiftMenuDay(today, -7)}
                onClick={() => setDay(shiftMenuDay(day, -1))}
              >
                <ArrowLeft size={17} />
              </Button>
              <div>
                <h2>{localDate(`${day}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
                <label className="menu-date-picker">
                  {t('chooseDay')}
                  <input
                    aria-label={t('day')}
                    type="date"
                    min={shiftMenuDay(today, -7)}
                    max={shiftMenuDay(today, 60)}
                    value={day}
                    onChange={(event) => {
                      if (event.target.value) setDay(event.target.value)
                    }}
                  />
                </label>
              </div>
              <Button
                variant="outline"
                aria-label={t('nextDay')}
                disabled={day >= shiftMenuDay(today, 60)}
                onClick={() => setDay(shiftMenuDay(day, 1))}
              >
                <ArrowRight size={17} />
              </Button>
              <Button variant="ghost" onClick={() => setDay(today)}>
                {t('todayButton')}
              </Button>
            </div>
            {settings.diet !== 'all' && <p className="row-subtitle mt-3">{t('dietHint')}</p>}
            {error && <Failure message={error} />}
            {message && <p role="status">{message}</p>}
            {menu && (
              <>
                {(menu.stale || error) && <p role="status">{t('stale')}</p>}
                {categories.map((category) => {
                  const items = allMeals.filter((meal) => (meal.category ?? 'other') === category)
                  const hasVisible = items.some((meal) => visible.has(meal))
                  const hasPhotos = items.some((meal) => Boolean(meal.image_url))
                  return items.length ? (
                    <section className="menu-category" key={`${canteen?.slug}:${day}:${category}`} hidden={!hasVisible}>
                      <h2>{t(`categories.${category}`)}</h2>
                      <div className="mensa-grid">
                        {items.map((meal, index) => (
                          <article className="mensa-meal" key={`${meal.name}-${index}`} hidden={!visible.has(meal)}>
                            <MealPhoto key={meal.image_url ?? 'no-photo'} meal={meal} reserved={hasPhotos} />
                            <div className="meal-content">
                              <MealDietBadge meal={meal} diet={settings.diet} />
                              <h3>{meal.name}</h3>
                              {meal.student_price !== null && (
                                <p className="mensa-price">
                                  {new Intl.NumberFormat(activeIntlLocale(), {
                                    style: 'currency',
                                    currency: 'EUR',
                                  }).format(meal.student_price)}{' '}
                                  <span>{t('price')}</span>
                                </p>
                              )}
                              {meal.allergens && (
                                <details className="meal-allergens">
                                  <summary>{t('allergenDetails')}</summary>
                                  <p>{t('allergens', { codes: meal.allergens })}</p>
                                </details>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null
                })}
                {!meals.length && (
                  <Empty
                    icon={Utensils}
                    title={t('plan')}
                    text={menu.meals.length ? t('noMatchingMeals') : t('empty')}
                  />
                )}
                <footer className="menu-source">
                  <span>{t('fetched', { time: localDate(menu.fetched_at) })}</span>
                  <a href={menu.source_url} target="_blank" rel="noreferrer">
                    {t('source')} →
                  </a>
                </footer>
              </>
            )}
            {loading && !menu && <p className="muted-text">{t('loading')}</p>}
            <details className="lunch-settings">
              <summary>{t('setup')}</summary>
              <p className="muted-text">{t('intro')}</p>
              <form
                className="mensa-settings"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (update({})) setMessage(t('saved'))
                }}
              >
                <label>
                  {t('break')}
                  <input
                    type="time"
                    required
                    value={settings.breakTime}
                    onChange={(event) => setSettings({ ...settings, breakTime: event.target.value })}
                  />
                </label>
                <label>
                  {t('lead')}
                  <select
                    className="native-select"
                    value={settings.lead}
                    onChange={(event) => setSettings({ ...settings, lead: Number(event.target.value) })}
                  >
                    <option value={60}>{t('lead60')}</option>
                    <option value={90}>{t('lead90')}</option>
                    <option value={120}>{t('lead120')}</option>
                  </select>
                </label>
                <label className="mensa-toggle">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
                  />
                  {t('enabled')}
                </label>
                <Button disabled={!canteen}>{t('save')}</Button>
              </form>
              <p className="row-subtitle mt-3">
                {t('preview', { time: settings.breakTime, reminder: reminderTime(settings) })}
              </p>
            </details>
          </>
        )}
      </div>
    </Shell>
  )
}
