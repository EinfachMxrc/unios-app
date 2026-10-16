// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import messages from '@/i18n/locales/de/mensa'
import type { Meal } from '@/lib/mensa'
import { MealDietBadge } from './MealDietBadge'

vi.mock('@/i18n/useT', () => ({
  useT: () => ({ t: (key: string) => (messages as Record<string, string>)[key] ?? key }),
}))

afterEach(cleanup)

const meal = (dietary?: Meal['dietary']): Meal => ({ name: 'Gericht', student_price: 3, allergens: '', dietary })

it('shows the provider label and no star when it does not match the saved preference', () => {
  render(<MealDietBadge meal={meal('meat')} diet="vegetarian" />)
  expect(screen.getByText(messages.mealMeat)).toBeTruthy()
  expect(screen.queryByRole('img', { name: messages.preferredMeal })).toBeNull()
})

it('marks a dish that fits the preference with an accessible star', () => {
  const { container } = render(<MealDietBadge meal={meal('vegan')} diet="vegetarian" />)
  expect(screen.getByText(messages.mealVegan)).toBeTruthy()
  expect(screen.getByRole('img', { name: messages.preferredMeal })).toBeTruthy()
  expect(container.firstElementChild?.className).toContain('is-preferred')
})

it('says nothing when the provider gave no usable label', () => {
  for (const dietary of [undefined, 'unknown' as const]) {
    const { container } = render(<MealDietBadge meal={meal(dietary)} diet="all" />)
    expect(container.firstChild).toBeNull()
  }
})
