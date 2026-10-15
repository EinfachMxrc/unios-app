// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { CALENDAR_SNAP, calendarShift, calendarSlot, type CalendarDraft, type CalendarEditMode } from '@/lib/calendarEditing'
import type { CalendarAppointment } from '@/lib/calendarLayout'

type Gesture = {
  pointerId: number; x: number; y: number; lastX: number; lastY: number; scrollTop: number; day: string; dayIndex: number; minutes: number
  event?: CalendarAppointment; mode: CalendarEditMode; moved: boolean; target: HTMLElement
}

export function useCalendarGesture({ scroll, body, days, hourPx, enabled, onCreate, onSave, onInvalid, onTrackingChange }: {
  scroll: RefObject<HTMLDivElement | null>; body: RefObject<HTMLDivElement | null>; days: string[]; hourPx: number; enabled: boolean
  onCreate: (draft: CalendarDraft) => void; onSave: (draft: CalendarDraft, event: CalendarAppointment) => void; onInvalid: () => void
  onTrackingChange?: (active: boolean) => void
}) {
  const active = useRef<Gesture | null>(null)
  const swallow = useRef<{ id?: number; until: number } | null>(null)
  const [preview, setPreview] = useState<{ event?: CalendarAppointment; draft: CalendarDraft | null } | null>(null)
  const [tracking, setTracking] = useState(false)

  useEffect(() => {
    if (!tracking) return
    let pointerX = active.current?.lastX ?? 0, pointerY = active.current?.lastY ?? 0, frame = 0
    function resolve(x: number, y: number) {
      const gesture = active.current
      if (!gesture || !enabled) return null
      const columns = [...(body.current?.querySelectorAll<HTMLElement>('[data-calendar-day]') ?? [])]
      const index = columns.findIndex(column => { const rect = column.getBoundingClientRect(); return x >= rect.left && x < rect.right })
      const dayIndex = index >= 0 ? index : x < (columns[0]?.getBoundingClientRect().left ?? 0) ? 0 : days.length - 1
      const delta = y - gesture.y + (scroll.current?.scrollTop ?? 0) - gesture.scrollTop
      const minutes = Math.round(delta / hourPx * 60 / CALENDAR_SNAP) * CALENDAR_SNAP
      if (gesture.event) return calendarShift(gesture.event, gesture.mode === 'move' ? dayIndex - gesture.dayIndex : 0, minutes, gesture.mode)
      const current = Math.max(0, Math.min(1440 - CALENDAR_SNAP, gesture.minutes + minutes))
      return calendarSlot(gesture.day, Math.min(gesture.minutes, current), Math.max(gesture.minutes, current) + CALENDAR_SNAP)
    }
    function cancel() {
      const gesture = active.current
      if (gesture?.moved) swallow.current = { id: gesture.event?.id, until: performance.now() + 500 }
      if (gesture?.target.hasPointerCapture(gesture.pointerId)) gesture.target.releasePointerCapture(gesture.pointerId)
      active.current = null; setPreview(null); setTracking(false); onTrackingChange?.(false)
    }
    function update() {
      const gesture = active.current
      if (!gesture || !enabled) return
      const distance = Math.hypot(pointerX - gesture.x, pointerY - gesture.y)
      if (!gesture.moved && distance <= 4) return
      gesture.moved = true
      // Delayed capture preserves a plain click in the Mac WebKit webview.
      if (!gesture.target.hasPointerCapture(gesture.pointerId)) gesture.target.setPointerCapture(gesture.pointerId)
      setPreview({ event: gesture.event, draft: resolve(pointerX, pointerY) })
    }
    function move(event: PointerEvent) {
      if (event.pointerId !== active.current?.pointerId) return
      active.current.lastX = event.clientX; active.current.lastY = event.clientY
      pointerX = event.clientX; pointerY = event.clientY; update()
    }
    function up(event: PointerEvent) {
      const gesture = active.current
      if (!gesture || event.pointerId !== gesture.pointerId) return
      const draft = gesture.moved ? resolve(event.clientX, event.clientY)
        : gesture.event ? null : calendarSlot(gesture.day, gesture.minutes, Math.min(1440, gesture.minutes + 60))
      cancel()
      if (gesture.event && !gesture.moved) return
      if (!draft) { onInvalid(); return }
      if (!gesture.event) onCreate(draft)
      else if (draft.starts_at !== gesture.event.starts_at || draft.ends_at !== gesture.event.ends_at) onSave(draft, gesture.event)
    }
    function key(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); cancel() } }
    function autoScroll() {
      const area = scroll.current, gesture = active.current
      if (area && gesture?.moved && enabled) {
        const rect = area.getBoundingClientRect()
        if (pointerY > rect.top && pointerY < rect.bottom && pointerX >= rect.left && pointerX <= rect.right) {
          const speed = pointerY < rect.top + 35 ? -8 : pointerY > rect.bottom - 35 ? 8 : 0
          if (speed) { area.scrollTop += speed; update() }
        }
      }
      if (active.current) frame = requestAnimationFrame(autoScroll)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel); window.addEventListener('keydown', key); window.addEventListener('blur', cancel)
    frame = requestAnimationFrame(autoScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', key); window.removeEventListener('blur', cancel)
    }
  }, [tracking, body, scroll, days, hourPx, enabled, onCreate, onSave, onInvalid, onTrackingChange])

  useEffect(() => { return () => {
    const gesture = active.current
    if (gesture?.target.hasPointerCapture(gesture.pointerId)) gesture.target.releasePointerCapture(gesture.pointerId)
  } }, [])

  function begin(pointer: ReactPointerEvent<HTMLElement>, day: string, event?: CalendarAppointment, mode: CalendarEditMode = 'move') {
    if (!enabled || pointer.button !== 0 || !pointer.isPrimary || pointer.pointerType === 'touch') return
    pointer.stopPropagation()
    const column = pointer.currentTarget.closest<HTMLElement>('[data-calendar-day]')
    if (!column) return
    const minutes = Math.max(0, Math.min(1425, Math.floor((pointer.clientY - column.getBoundingClientRect().top) / hourPx * 60 / CALENDAR_SNAP) * CALENDAR_SNAP))
    active.current = { pointerId: pointer.pointerId, x: pointer.clientX, y: pointer.clientY, lastX: pointer.clientX, lastY: pointer.clientY, scrollTop: scroll.current?.scrollTop ?? 0,
      day, dayIndex: days.indexOf(day), minutes, event, mode, moved: false, target: pointer.currentTarget }
    swallow.current = null; onTrackingChange?.(true); setTracking(true)
  }
  return { preview, tracking, begin, consumeClick: (id: number) => {
    if (swallow.current?.id === id && performance.now() <= swallow.current.until) { swallow.current = null; return true }
    return false
  } }
}
