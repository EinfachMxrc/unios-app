// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { fireEvent, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { House } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

vi.mock('@/preferences', () => ({ usePreferences: () => ({ modules: { courses: true } }) }))
vi.mock('@/components/SidebarCustomize', () => ({ SidebarCustomize: () => null }))
vi.mock('@/components/BrandMark', () => ({ BrandMark: () => null }))
vi.mock('@/lib/sourceNoteSave', () => ({ beginNewFreeNote: vi.fn() }))
vi.mock('@/i18n/useT', () => ({
  useT: () => ({ t: (key: string, values?: { name?: string }) => (values?.name ? `${key}: ${values.name}` : key) }),
}))

const ids = ['today', 'courses', 'learning', 'notes', 'deadlines']
const catalog = ids.map((id) => ({
  id,
  to: id === 'today' ? '/' : `/${id}`,
  label: id,
  icon: House,
  group: 'primary' as const,
}))
const courses = [
  {
    id: 1,
    name: 'Fixture course with full title',
    short_name: null,
    semester_id: null,
    source: 'fixture',
    source_id: 'fixture-1',
    is_active: true,
    download_other_groups: false,
  },
]
const layout = {
  version: 1 as const,
  workspace: ids,
  library: [],
  courseOrder: [],
  hiddenCourses: [],
  showCourses: true,
}
const state = {
  sidebarHidden: false,
  sidebarWidth: 258,
  collapsedSections: { workspace: false, library: false, courses: false },
  openCourse: null,
  toggleSidebar: vi.fn(),
  toggleSection: vi.fn(),
  toggleCourse: vi.fn(),
  resizeSidebar: vi.fn(),
}
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('sidebar actions and primary paths', () => {
  it('keeps five named primary links with decorative, unfocusable reserved action slots', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar state={state} layout={layout} catalog={catalog} sidebarCourses={courses} />
      </MemoryRouter>,
    )
    for (const id of ids)
      expect(screen.getByRole('link', { name: id }).getAttribute('href')).toBe(id === 'today' ? '/' : `/${id}`)
    const slots = container.querySelectorAll('.sidebar-action-slot')
    expect(slots).toHaveLength(5)
    for (const slot of slots) {
      expect(slot.getAttribute('aria-hidden')).toBe('true')
      expect(slot.hasAttribute('tabindex')).toBe(false)
      expect(slot.querySelector('button')).toBeNull()
    }
  })
  it('retains a named course action in the focus order and keeps keyboard sidebar resizing', () => {
    render(
      <MemoryRouter>
        <Sidebar state={state} layout={layout} catalog={catalog} sidebarCourses={courses} />
      </MemoryRouter>,
    )
    const action = screen.getByRole('button', { name: 'courseChildrenOpen: Fixture course with full title' })
    action.focus()
    expect(document.activeElement).toBe(action)
    expect(action.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(action)
    expect(state.toggleCourse).toHaveBeenCalledWith(1)
    fireEvent.keyDown(screen.getByRole('separator', { name: 'sidebarWidth' }), { key: 'ArrowRight' })
    expect(state.resizeSidebar).toHaveBeenCalledWith(274)
  })
})
