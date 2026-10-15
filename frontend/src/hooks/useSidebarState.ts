// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { readMigratedStorage } from '@/lib/uiStorage'
type Section = 'workspace' | 'library' | 'courses'
const read = (suffix: string) => readMigratedStorage(`unios-sidebar-${suffix}`, `marc-sidebar-${suffix}`)
const write = (suffix: string, value: string) => localStorage.setItem(`unios-sidebar-${suffix}`, value)
export function useSidebarState() {
  const location = useLocation()
  const coursePath = /^\/courses\/([1-9]\d*)$/.exec(location.pathname)
  const courseQuery = location.pathname === '/notes' ? new URLSearchParams(location.search).get('course_id') : null
  const contextCourse = Number(coursePath?.[1] ?? courseQuery) || null
  const [sidebarHidden, setHidden] = useState(() => read('hidden') === '1')
  const [sidebarWidth, setWidth] = useState(() => {
    const width = Number(read('width'))
    return width >= 220 && width <= 360 ? width : 258
  })
  const [collapsedSections, setSections] = useState<Record<Section, boolean>>(() => ({
    workspace: read('workspace-collapsed') === '1',
    library: read('library-collapsed') === '1',
    courses: read('courses-collapsed') === '1',
  }))
  // Entering a course reveals its context; an explicit collapse lasts on that route.
  const [courseExpansion, setCourseExpansion] = useState(() => ({
    context: contextCourse,
    id: contextCourse ?? (Number(read('open-course')) || null),
  }))
  const openCourse = courseExpansion.context === contextCourse
    ? courseExpansion.id
    : contextCourse ?? courseExpansion.id
  function toggleSidebar() {
    setHidden((previous) => {
      write('hidden', previous ? '0' : '1')
      return !previous
    })
  }
  function toggleSection(section: Section) {
    setSections((previous) => {
      const next = !previous[section]
      write(`${section}-collapsed`, next ? '1' : '0')
      return { ...previous, [section]: next }
    })
  }
  function toggleCourse(id: number) {
    const next = openCourse === id ? null : id
    write('open-course', next === null ? '' : String(next))
    setCourseExpansion({ context: contextCourse, id: next })
  }
  function resizeSidebar(width: number) {
    const next = Math.max(220, Math.min(360, width))
    write('width', String(next))
    setWidth(next)
  }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault()
        setHidden((previous) => {
          write('hidden', previous ? '0' : '1')
          return !previous
        })
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  return {
    sidebarHidden,
    sidebarWidth,
    collapsedSections,
    openCourse,
    toggleSidebar,
    toggleSection,
    toggleCourse,
    resizeSidebar,
  }
}
