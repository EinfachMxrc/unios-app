// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  campusClock,
  lunchVisible,
  matchesDiet,
  matchesMensa,
  visibleMeals,
  shiftMenuDay,
  reminderTime,
  type Meal,
} from './mensa'
describe('lunch reminder', () => {
  it('uses campus timezone and shows at the exact one-hour boundary', () => {
    const settings = { canteen: '', breakTime: '12:30', lead: 60, enabled: true, diet: 'all' as const }
    expect(reminderTime(settings)).toBe('11:30')
    expect(lunchVisible(689, settings)).toBe(false)
    expect(lunchVisible(690, settings)).toBe(true)
    expect(lunchVisible(749, settings)).toBe(true)
    expect(lunchVisible(750, settings)).toBe(false)
    expect(lunchVisible(870, settings)).toBe(false)
    expect(lunchVisible(690, { ...settings, enabled: false })).toBe(false)
    expect(campusClock(new Date('2026-10-01T09:30:00Z'), 'Europe/Berlin')).toEqual({ day: '2026-10-01', minutes: 690 })
    expect(matchesMensa('Speiseplan')).toBe(true)
  })
})

describe('diet preferences', () => {
  const meals: Meal[] = [
    { name: 'A', dietary: 'meat', student_price: 3, allergens: '' },
    { name: 'B', dietary: 'vegetarian', student_price: 3, allergens: '' },
    { name: 'C', dietary: 'unknown', student_price: 3, allergens: '' },
    { name: 'D', dietary: 'vegan', student_price: 3, allergens: '' },
    { name: 'E', dietary: 'fish', student_price: 3, allergens: '' },
  ]
  it('never matches unlabelled cached meals or vegetarian meals to a vegan preference', () => {
    expect(matchesDiet({ name: 'Vegan klingend', student_price: null, allergens: '' }, 'vegan')).toBe(false)
    expect(matchesDiet(meals[1], 'vegan')).toBe(false)
    expect(matchesDiet(meals[4], 'vegetarian')).toBe(false)
  })
})

it('filters unknown and animal dishes out of vegan menus without mutating the source', () => {
  const meals: Meal[] = [
    { name: 'A', dietary: 'meat', student_price: null, allergens: '' },
    { name: 'B', dietary: 'unknown', student_price: null, allergens: '' },
    { name: 'C', dietary: 'vegan', student_price: null, allergens: '' },
  ]
  expect(visibleMeals(meals, 'vegan').map((meal) => meal.name)).toEqual(['C'])
  expect(visibleMeals(meals, 'all')).toEqual(meals)
  expect(meals).toHaveLength(3)
})
it('moves calendar days across DST and year boundaries', () => {
  expect(shiftMenuDay('2026-10-25', -1)).toBe('2026-10-24')
  expect(shiftMenuDay('2026-12-31', 1)).toBe('2027-01-01')
})
