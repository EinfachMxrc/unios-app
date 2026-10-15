// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  BookOpenCheck,
  BrainCircuit,
  CalendarDays,
  CalendarRange,
  Code2,
  DoorOpen,
  FileText,
  FolderDown,
  FolderKanban,
  GraduationCap,
  House,
  Inbox,
  LayoutGrid,
  ListChecks,
  ListTodo,
  Mail,
  MessageCircleQuestion,
  Mic,
  MoreHorizontal,
  Puzzle,
  Search,
  Settings2,
  Sparkles,
  StickyNote,
  Trash2,
  Utensils,
} from 'lucide-react'
import type { ModuleKey, Preferences } from '@/preferences'
import { matchPath } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import type { TypedT } from '@/i18n/useT'
export type AreaGroup =
  'primary' | 'quick' | 'knowledge' | 'learning' | 'organization' | 'automation' | 'tools' | 'settings'
export type AreaDefinition = {
  id: string
  to: string
  icon: LucideIcon
  module?: ModuleKey
  group: AreaGroup
  parent?: string
  routes?: { path: string; page: string }[]
  label: (t: { nav: TypedT<'nav'>; shell: TypedT<'shell'>; more: TypedT<'more'> }) => string
}
/** Route ownership, visibility and labels are shared by every navigation surface. */
export const areaDefinitions: AreaDefinition[] = [
  { id: 'today', to: '/', icon: House, group: 'primary', label: ({ nav }) => nav('today') },
  {
    id: 'courses',
    to: '/courses',
    icon: BookOpen,
    group: 'primary',
    label: ({ nav }) => nav('courses'),
    module: 'courses',
    routes: [
      { path: '/courses/:id', page: 'course' },
      { path: '/material/:id', page: 'material' },
      { path: '/document/:id', page: 'document' },
    ],
  },
  {
    id: 'learning',
    to: '/learning',
    icon: BrainCircuit,
    group: 'primary',
    label: ({ nav }) => nav('learning'),
    module: 'courses',
    routes: [{ path: '/learning/focus/:kind/:id', page: 'learningFocus' }],
  },
  { id: 'notes', to: '/notes', icon: FileText, group: 'primary', label: ({ nav }) => nav('notes') },
  {
    id: 'deadlines',
    to: '/deadlines',
    icon: CalendarDays,
    group: 'primary',
    label: ({ nav }) => nav('deadlines'),
    module: 'deadlines',
  },
  { id: 'inbox', to: '/inbox', icon: Inbox, group: 'quick', label: ({ nav }) => nav('inbox') },
  {
    id: 'search',
    to: '/search',
    icon: Search,
    group: 'quick',
    label: ({ shell }) => shell('search'),
    module: 'search',
  },
  { id: 'jots', to: '/jots', icon: StickyNote, group: 'quick', label: ({ more }) => more('quickCaptures') },
  {
    id: 'notifications',
    to: '/notifications',
    icon: Bell,
    group: 'quick',
    label: ({ more }) => more('notifications'),
    module: 'notifications',
  },
  {
    id: 'collections',
    to: '/collections',
    icon: LayoutGrid,
    group: 'knowledge',
    label: ({ shell }) => shell('collections'),
  },
  { id: 'voice', to: '/voice', icon: Mic, group: 'knowledge', label: ({ shell }) => shell('voiceNotes') },
  {
    id: 'drop',
    to: '/drop',
    icon: FolderDown,
    group: 'knowledge',
    label: ({ more }) => more('ownFiles'),
    module: 'courses',
  },
  {
    id: 'universityDocuments',
    to: '/university-documents',
    icon: FileText,
    group: 'knowledge',
    label: ({ shell }) => shell('universityDocuments'),
  },
  {
    id: 'study',
    to: '/study',
    icon: BookOpenCheck,
    group: 'learning',
    label: ({ more }) => more('flashcards'),
    module: 'courses',
    parent: 'learning',
    routes: [{ path: '/study/session/:deck', page: 'studySession' }, { path: '/study/cards', page: 'studyCards' }],
  },
  {
    id: 'assessment',
    to: '/assessment',
    icon: ListChecks,
    group: 'learning',
    label: ({ more }) => more('practice'),
    module: 'courses',
    parent: 'learning',
  },
  {
    id: 'coding',
    to: '/coding',
    icon: Code2,
    group: 'learning',
    label: ({ more }) => more('coding'),
    module: 'courses',
    parent: 'learning',
  },
  {
    id: 'analytics',
    to: '/analytics',
    icon: BarChart3,
    group: 'learning',
    label: ({ more }) => more('learningAnalytics'),
    module: 'courses',
    parent: 'learning',
  },
  {
    id: 'journal',
    to: '/journal',
    icon: CalendarRange,
    group: 'learning',
    label: ({ shell }) => shell('studyDays'),
    routes: [{ path: '/journal/:day', page: 'journal' }],
  },
  {
    id: 'digest',
    to: '/digest',
    icon: CalendarRange,
    group: 'learning',
    label: ({ more }) => more('weeklyOverview'),
    module: 'notifications',
  },
  {
    id: 'projects',
    to: '/projects',
    icon: FolderKanban,
    group: 'organization',
    label: ({ more }) => more('projects'),
    module: 'projects',
    routes: [{ path: '/projects/:id', page: 'project' }],
  },
  {
    id: 'grades',
    to: '/grades',
    icon: GraduationCap,
    group: 'organization',
    label: ({ more }) => more('gradesAndEcts'),
    module: 'grades',
  },
  {
    id: 'mail',
    to: '/mail',
    icon: Mail,
    group: 'organization',
    label: ({ more }) => more('universityMail'),
    module: 'mail',
  },
  { id: 'mensa', to: '/mensa', icon: Utensils, group: 'organization', label: ({ more }) => more('mensa') },
  { id: 'rooms', to: '/rooms', icon: DoorOpen, group: 'organization', label: ({ more }) => more('rooms') },
  { id: 'campus', to: '/campus', icon: GraduationCap, group: 'organization', label: ({ more }) => more('myCampus') },
  { id: 'rules', to: '/rules', icon: Sparkles, group: 'automation', label: ({ shell }) => shell('rules') },
  {
    id: 'anki',
    to: '/anki',
    icon: BookOpenCheck,
    group: 'automation',
    label: ({ more }) => more('cardSuggestions'),
    module: 'ai',
  },
  {
    id: 'exercises',
    to: '/exercises',
    icon: ListChecks,
    group: 'automation',
    label: ({ more }) => more('exercises'),
    module: 'ai',
  },
  {
    id: 'explanations',
    to: '/explanations',
    icon: MessageCircleQuestion,
    group: 'automation',
    label: ({ more }) => more('aiExplanations'),
    module: 'ai',
  },
  {
    id: 'ai',
    to: '/ai',
    icon: BrainCircuit,
    group: 'automation',
    label: ({ more }) => more('aiPackage'),
    module: 'ai',
  },
  {
    id: 'addons',
    to: '/addons',
    icon: Puzzle,
    group: 'tools',
    label: ({ more }) => more('addons'),
    module: 'addons',
    routes: [{ path: '/addons/:id', page: 'addon' }],
  },
  {
    id: 'marketplace',
    to: '/marketplace',
    icon: Puzzle,
    group: 'tools',
    label: ({ more }) => more('marketplace'),
    module: 'addons',
  },
  { id: 'jobs', to: '/jobs', icon: ListTodo, group: 'tools', label: ({ more }) => more('jobs') },
  { id: 'system', to: '/system', icon: Settings2, group: 'tools', label: ({ more }) => more('connectionsAndSystem') },
  { id: 'activity', to: '/activity', icon: Activity, group: 'settings', label: ({ more }) => more('activityHistory') },
  { id: 'trash', to: '/trash', icon: Trash2, group: 'settings', label: ({ more }) => more('trash') },
  { id: 'settings', to: '/settings', icon: Settings2, group: 'settings', label: ({ nav }) => nav('settings') },
  { id: 'more', to: '/more', icon: MoreHorizontal, group: 'settings', label: ({ nav }) => nav('more') },
]
export const areaRoutes = areaDefinitions.flatMap((area) => [
  { path: area.to, page: area.id, module: area.module },
  ...(area.routes ?? []).map((route) => ({ ...route, module: area.module })),
])
export function areaForPath(pathname: string) {
  return areaDefinitions.find((area) =>
    [area.to, ...(area.routes ?? []).map((route) => route.path)].some((path) =>
      matchPath({ path, end: true }, pathname),
    ),
  )
}
export function activeArea(pathname: string, pinned: string[]) {
  const area = areaForPath(pathname)
  if (!area) return undefined
  if (pinned.includes(area.id) || area.id === 'settings' || area.id === 'more') return area.id
  if (area.parent && pinned.includes(area.parent)) return area.parent
  return 'more'
}
export function sidebarCatalog(
  preferences: Preferences,
  nav: TypedT<'nav'>,
  shell: TypedT<'shell'>,
  more: TypedT<'more'>,
) {
  return areaDefinitions
    .filter((area) => !area.module || preferences.modules[area.module])
    .map((area) => ({ ...area, label: area.label({ nav, shell, more }) }))
}
