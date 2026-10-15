// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore } from 'react'
export type UniversityServices = {
  canteens: { slug: string; name: string }[]
  mail_url: string | null
  timezone: string
}
export type DietaryLabel = 'vegan' | 'vegetarian' | 'fish' | 'meat' | 'unknown'
export type DietPreference = 'all' | 'vegan' | 'vegetarian' | 'pescatarian'
export type Meal = {
  name: string
  student_price: number | null
  allergens: string
  dietary?: DietaryLabel
  category?: string
  image_url?: string | null
}
export type Menu = {
  date: string
  canteen: string
  meals: Meal[]
  source_url: string
  fetched_at: string
  stale: boolean
}
export type LunchSettings = { canteen: string; breakTime: string; lead: number; enabled: boolean; diet: DietPreference }
const key = 'unios-lunch-v1'
const defaults: LunchSettings = { canteen: '', breakTime: '12:00', lead: 60, enabled: true, diet: 'all' }
function read(): LunchSettings {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.breakTime)) return defaults
    return {
      canteen: typeof value.canteen === 'string' ? value.canteen : '',
      breakTime: value.breakTime,
      lead: [60, 90, 120].includes(value.lead) ? value.lead : 60,
      enabled: value.enabled !== false,
      diet: ['all', 'vegan', 'vegetarian', 'pescatarian'].includes(value.diet) ? value.diet : 'all',
    }
  } catch {
    return defaults
  }
}
let current = read()
const listeners = new Set<() => void>()
const publish = () => {
  current = read()
  listeners.forEach((listener) => listener())
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) publish()
  })
export function useLunchSettings() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => current,
  )
}
export function saveLunchSettings(value: LunchSettings) {
  localStorage.setItem(key, JSON.stringify(value))
  publish()
}
export function matchesDiet(meal: Meal, diet: DietPreference): boolean {
  if (diet === 'all') return false
  if (meal.dietary === 'vegan') return true
  if (diet !== 'vegan' && meal.dietary === 'vegetarian') return true
  return diet === 'pescatarian' && meal.dietary === 'fish'
}
export function visibleMeals(meals: Meal[], diet: DietPreference): Meal[] {
  return diet === 'all' ? meals : meals.filter((meal) => matchesDiet(meal, diet))
}
export function shiftMenuDay(day: string, amount: number): string {
  const value = new Date(`${day}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}
export function reminderTime(value: LunchSettings) {
  const [hour, minute] = value.breakTime.split(':').map(Number)
  const minutes = (hour * 60 + minute - value.lead + 1440) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
export function campusClock(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}
export function lunchVisible(minutes: number, value: LunchSettings) {
  const [hour, minute] = value.breakTime.split(':').map(Number)
  const start = hour * 60 + minute
  return value.enabled && minutes >= Math.max(0, start - value.lead) && minutes < start
}
export function matchesMensa(query: string) {
  const words = [
    'mensa',
    'speiseplan',
    'mittagessen',
    'mittag',
    'essen',
    'canteen',
    'lunch',
    'menu',
    'meal',
    'cafeteria',
  ]
  return (
    query.trim().length >= 2 &&
    words.some((word) => word.includes(query.trim().toLowerCase()) || query.toLowerCase().includes(word))
  )
}
