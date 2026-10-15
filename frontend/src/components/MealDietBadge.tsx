// SPDX-License-Identifier: AGPL-3.0-or-later

import { Beef, Fish, Leaf, Sprout, Star } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { matchesDiet, type DietPreference, type Meal } from '@/lib/mensa'

const labels = {
  vegan: { icon: Sprout, key: 'mealVegan' },
  vegetarian: { icon: Leaf, key: 'mealVegetarian' },
  fish: { icon: Fish, key: 'mealFish' },
  meat: { icon: Beef, key: 'mealMeat' },
} as const

/** Explicit provider labels, with a star when a dish matches the saved preference. */
export function MealDietBadge({ meal, diet }: { meal: Meal; diet: DietPreference }) {
  const { t } = useT('mensa')
  const label = meal.dietary && meal.dietary !== 'unknown' ? labels[meal.dietary] : undefined
  if (!label) return null
  const Icon = label.icon
  const preferred = matchesDiet(meal, diet)
  return (
    <span className={`mensa-diet-badge${preferred ? ' is-preferred' : ''}`}>
      <Icon size={16} aria-hidden="true" />
      <span>{t(label.key)}</span>
      {preferred && <Star size={14} role="img" aria-label={t('preferredMeal')} />}
    </span>
  )
}
