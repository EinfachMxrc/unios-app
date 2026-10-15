// SPDX-License-Identifier: AGPL-3.0-or-later

import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from 'radix-ui'
import { ArrowDown, ArrowUp, Check, GripVertical, Plus, SlidersHorizontal, X } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { usePreferences } from '@/preferences'
import { sidebarCatalog } from './sidebarCatalog'
import { moveSidebarEntry, resetSidebarLayout, saveSidebarLayout, useSidebarLayout } from './sidebarLayout'
import type { SidebarGroup, SidebarLayout } from './sidebarLayout'
import './SidebarCustomize.css'
export function SidebarCustomize({
  courses = [],
  className = '',
}: {
  courses?: { id: number; name: string }[]
  className?: string
}) {
  const preferences = usePreferences()
  const layout = useSidebarLayout(preferences)
  const { t } = useT('sidebar')
  const { t: nav } = useT('nav')
  const { t: shell } = useT('shell')
  const { t: more } = useT('more')
  const catalog = sidebarCatalog(preferences, nav, shell, more).filter(
    (entry) => !['settings', 'more'].includes(entry.id),
  )
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<SidebarGroup>('workspace')
  const [dragged, setDragged] = useState<string | null>(null)
  const dragSource = useRef<{ id: string; x: number; y: number } | null>(null)
  const [dropBefore, setDropBefore] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [failed, setFailed] = useState(false)
  const placed = [...layout.workspace, ...layout.library]
  const available = catalog.filter(
    (entry) => !placed.includes(entry.id) && entry.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  const courseRank = (id: number) => {
    const position = layout.courseOrder.indexOf(id)
    return position < 0 ? Number.MAX_SAFE_INTEGER : position
  }
  const orderedCourses = [...courses].sort((a, b) => courseRank(a.id) - courseRank(b.id))
  function persist(next: SidebarLayout, label = '') {
    try {
      saveSidebarLayout(next)
      setFailed(false)
      setStatus(label ? t('changed', { name: label }) : t('saved'))
    } catch {
      setFailed(true)
      setStatus(t('saveFailed'))
    }
  }
  function reorder(group: SidebarGroup, id: string, offset: number) {
    const entries = layout[group].filter((entry) => catalog.some((item) => item.id === entry))
    const index = entries.indexOf(id)
    const neighbour = entries[index + offset]
    if (!neighbour) return
    const next = { ...layout, [group]: [...layout[group]] }
    const from = next[group].indexOf(id)
    const to = next[group].indexOf(neighbour)
    ;[next[group][from], next[group][to]] = [next[group][to], next[group][from]]
    persist(next)
  }
  function dragTarget(x: number, y: number) {
    const element = document.elementFromPoint(x, y)
    const group = element?.closest<HTMLElement>('[data-sidebar-group]')?.dataset.sidebarGroup
    const before = element?.closest<HTMLElement>('[data-sidebar-entry]')?.dataset.sidebarEntry
    return { group, before }
  }
  function stopDrag() {
    dragSource.current = null
    setDragged(null)
    setDropBefore(null)
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        stopDrag()
        setStatus('')
        setFailed(false)
      }}
    >
      <Dialog.Trigger className={`sidebar-customize-trigger ${className}`}>
        <SlidersHorizontal size={16} />
        <span>{t('title')}</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="sidebar-editor-overlay" />
        <Dialog.Content className="sidebar-editor">
          <div className="sidebar-editor-header">
            <div>
              <Dialog.Title>{t('title')}</Dialog.Title>
              <Dialog.Description>{t('description')}</Dialog.Description>
            </div>
            <Dialog.Close className="sidebar-editor-icon" aria-label={t('close')}>
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className="sidebar-editor-body">
            <div className="sidebar-editor-groups">
              {(['workspace', 'library'] as const).map((group) => {
                const entries = layout[group].flatMap((id) => catalog.find((entry) => entry.id === id) ?? [])
                return (
                  <section
                    className={`sidebar-editor-group ${dragged ? 'can-drop' : ''}`}
                    key={group}
                    aria-label={shell(group)}
                    data-sidebar-group={group}
                  >
                    <h3>
                      {shell(group)} <span>{entries.length}</span>
                    </h3>
                    {entries.length === 0 && <p className="sidebar-editor-empty">{t('emptyGroup')}</p>}
                    {entries.map((entry, index) => (
                      <div
                        className={`sidebar-editor-row ${dragged === entry.id ? 'is-dragging' : ''} ${dropBefore === entry.id && dragged !== entry.id ? 'drop-before' : ''}`}
                        key={entry.id}
                        data-sidebar-entry={entry.id}
                      >
                        <button
                          type="button"
                          className="sidebar-editor-grip"
                          aria-label={t('drag', { name: entry.label })}
                          onPointerDown={(event) => {
                            if (event.button !== 0) return
                            event.preventDefault()
                            event.currentTarget.setPointerCapture(event.pointerId)
                            dragSource.current = { id: entry.id, x: event.clientX, y: event.clientY }
                          }}
                          onPointerMove={(event) => {
                            const source = dragSource.current
                            if (!source || Math.hypot(event.clientX - source.x, event.clientY - source.y) < 5) return
                            setDragged(source.id)
                            setDropBefore(dragTarget(event.clientX, event.clientY).before ?? null)
                          }}
                          onPointerUp={(event) => {
                            const source = dragSource.current
                            const { group: targetGroup, before } = dragTarget(event.clientX, event.clientY)
                            if (
                              source &&
                              Math.hypot(event.clientX - source.x, event.clientY - source.y) >= 5 &&
                              source.id !== before &&
                              (targetGroup === 'workspace' || targetGroup === 'library')
                            ) {
                              persist(moveSidebarEntry(layout, source.id, targetGroup, before))
                            }
                            stopDrag()
                          }}
                          onPointerCancel={stopDrag}
                          onLostPointerCapture={stopDrag}
                        >
                          <GripVertical size={17} />
                        </button>
                        <entry.icon size={17} aria-hidden="true" />
                        <strong>{entry.label}</strong>
                        <select
                          className="sidebar-editor-group-select"
                          value={group}
                          aria-label={t('moveGroup', { name: entry.label })}
                          onChange={(event) =>
                            persist(moveSidebarEntry(layout, entry.id, event.target.value as SidebarGroup), entry.label)
                          }
                        >
                          <option value="workspace">{shell('workspace')}</option>
                          <option value="library">{shell('library')}</option>
                        </select>
                        <div className="sidebar-editor-row-actions">
                          <button
                            type="button"
                            className="sidebar-editor-icon"
                            disabled={index === 0}
                            aria-label={t('up', { name: entry.label })}
                            onClick={() => reorder(group, entry.id, -1)}
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            type="button"
                            className="sidebar-editor-icon"
                            disabled={index === entries.length - 1}
                            aria-label={t('down', { name: entry.label })}
                            onClick={() => reorder(group, entry.id, 1)}
                          >
                            <ArrowDown size={15} />
                          </button>
                          <button
                            type="button"
                            className="sidebar-editor-icon"
                            aria-label={t('remove', { name: entry.label })}
                            onClick={() =>
                              persist(
                                { ...layout, [group]: layout[group].filter((id) => id !== entry.id) },
                                entry.label,
                              )
                            }
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </section>
                )
              })}
            </div>
            <section className="sidebar-editor-add">
              <h3>{t('addTitle')}</h3>
              <div className="sidebar-editor-add-filters">
                <input
                  type="search"
                  aria-label={t('search')}
                  placeholder={t('search')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <select
                  value={target}
                  aria-label={t('addTo')}
                  onChange={(event) => setTarget(event.target.value as SidebarGroup)}
                >
                  <option value="workspace">{shell('workspace')}</option>
                  <option value="library">{shell('library')}</option>
                </select>
              </div>
              <div className="sidebar-editor-available">
                {available.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    aria-label={t('add', { name: entry.label })}
                    onClick={() => persist(moveSidebarEntry(layout, entry.id, target), entry.label)}
                  >
                    <entry.icon size={16} />
                    <span>{entry.label}</span>
                    <Plus size={15} />
                  </button>
                ))}
              </div>
              {available.length === 0 && <p className="sidebar-editor-empty">{t('noResults')}</p>}
              <p className="sidebar-editor-hint">
                {t('disabledHint')}{' '}
                <Link to="/settings" onClick={() => setOpen(false)}>
                  {shell('settings')}
                </Link>
              </p>
            </section>
            <label className="sidebar-editor-course-check">
              <input
                type="checkbox"
                checked={layout.showRecent !== false}
                onChange={(event) => persist({ ...layout, showRecent: event.target.checked })}
              />
              {shell('showRecent')}
            </label>
            {preferences.modules.courses && (
              <section className="sidebar-editor-group">
                <h3>{shell('currentCourses')}</h3>
                <label className="sidebar-editor-course-check">
                  <input
                    type="checkbox"
                    checked={layout.showCourses}
                    onChange={(event) => persist({ ...layout, showCourses: event.target.checked })}
                  />
                  {t('showCourses')}
                </label>
                {layout.showCourses &&
                  orderedCourses.map((course, index) => (
                    <div className="sidebar-editor-row sidebar-editor-course" key={course.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={!layout.hiddenCourses.includes(course.id)}
                          onChange={(event) =>
                            persist(
                              {
                                ...layout,
                                hiddenCourses: event.target.checked
                                  ? layout.hiddenCourses.filter((id) => id !== course.id)
                                  : [...layout.hiddenCourses, course.id],
                              },
                              course.name,
                            )
                          }
                        />
                        <span>{course.name}</span>
                      </label>
                      <div className="sidebar-editor-row-actions">
                        {([-1, 1] as const).map((offset) => (
                          <button
                            type="button"
                            className="sidebar-editor-icon"
                            key={offset}
                            disabled={index + offset < 0 || index + offset >= orderedCourses.length}
                            aria-label={t(offset < 0 ? 'up' : 'down', { name: course.name })}
                            onClick={() => {
                              const ids = orderedCourses.map((item) => item.id)
                              ;[ids[index], ids[index + offset]] = [ids[index + offset], ids[index]]
                              persist({ ...layout, courseOrder: ids })
                            }}
                          >
                            {offset < 0 ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
              </section>
            )}
          </div>
          <div className="sidebar-editor-footer">
            <button
              type="button"
              onClick={() => {
                try {
                  resetSidebarLayout()
                  setFailed(false)
                  setStatus(t('resetDone'))
                } catch {
                  setFailed(true)
                  setStatus(t('saveFailed'))
                }
              }}
            >
              {t('reset')}
            </button>
            <span role="status" className={failed ? 'sidebar-editor-error' : ''}>
              {status || t('deviceOnly')}
            </span>
            <Dialog.Close className="sidebar-editor-done">
              <Check size={16} />
              {t('done')}
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
