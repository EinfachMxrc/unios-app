// SPDX-License-Identifier: AGPL-3.0-or-later

// German is the default and fallback language, so its resources are bundled
// eagerly (synchronously) into the main chunk: the app must render correct
// text before any async namespace load resolves, and offline/PWA use must
// never depend on a runtime fetch. English resources are intentionally NOT
// imported here — they are code-split and loaded on demand through the
// backend configured in `./index.ts`, keeping the default bundle small.
import quality from './locales/de/quality'
import lectureCoverage from './locales/de/lectureCoverage'
import common from './locales/de/common'
import releaseOnboarding from './locales/de/releaseOnboarding'
import releaseSystem from './locales/de/releaseSystem'
import releaseUpdates from './locales/de/releaseUpdates'
import rooms from './locales/de/rooms'
import entityActions from './locales/de/entityActions'
import nav from './locales/de/nav'
import shell from './locales/de/shell'
import sidebar from './locales/de/sidebar'
import commandPalette from './locales/de/commandPalette'
import state from './locales/de/state'
import today from './locales/de/today'
import courses from './locales/de/courses'
import courseOffline from './locales/de/courseOffline'
import deadlines from './locales/de/deadlines'
import search from './locales/de/search'
import settings from './locales/de/settings'
import system from './locales/de/system'
import more from './locales/de/more'
import setup from './locales/de/setup'
import learning from './locales/de/learning'
import assessment from './locales/de/assessment'
import coding from './locales/de/coding'
import study from './locales/de/study'
import noteCards from './locales/de/noteCards'
import material from './locales/de/material'
import readerNotePicker from './locales/de/readerNotePicker'
import inbox from './locales/de/inbox'
import notes from './locales/de/notes'
import links from './locales/de/links'
import journal from './locales/de/journal'
import collections from './locales/de/collections'
import analytics from './locales/de/analytics'
import projects from './locales/de/projects'
import grades from './locales/de/grades'
import ai from './locales/de/ai'
import cardQueue from './locales/de/cardQueue'
import exerciseQueue from './locales/de/exerciseQueue'
import explanations from './locales/de/explanations'
import mail from './locales/de/mail'
import activity from './locales/de/activity'
import drop from './locales/de/drop'
import digest from './locales/de/digest'
import jots from './locales/de/jots'
import rules from './locales/de/rules'
import voice from './locales/de/voice'
import notFound from './locales/de/notFound'
import submission from './locales/de/submission'
import dataExport from './locales/de/dataExport'
import runtimeSettings from './locales/de/runtimeSettings'
import capabilities from './locales/de/capabilities'
import connectors from './locales/de/connectors'
import devices from './locales/de/devices'
import hostHandoff from './locales/de/hostHandoff'
import conflictReview from './locales/de/conflictReview'
import deadlineProposals from './locales/de/deadlineProposals'
import studyPeek from './locales/de/studyPeek'
import taskPeek from './locales/de/taskPeek'
import trash from './locales/de/trash'
import backup from './locales/de/backup'
import addons from './locales/de/addons'
import feedback from './locales/de/feedback'
import mensa from './locales/de/mensa'
import campus from './locales/de/campus'
import serverConnection from './locales/de/serverConnection'
import calendarWorkspace from './locales/de/calendarWorkspace'
import mathQuick from './locales/de/mathQuick'
import studyWorkspace from './locales/de/studyWorkspace'
import reviewUndo from './locales/de/reviewUndo'
import ownTaskSupport from './locales/de/ownTaskSupport'
import examImpact from './locales/de/examImpact'

export const deResources = {
  lectureCoverage,
  readerNotePicker,
  noteCards,
  calendarWorkspace,
  mathQuick,
  studyWorkspace,
  reviewUndo,
  ownTaskSupport,
  examImpact,
  quality,
  releaseUpdates,
  releaseSystem,
  releaseOnboarding,
  rooms,
  entityActions,
  serverConnection,
  mensa,
  common,
  nav,
  shell,
  sidebar,
  commandPalette,
  state,
  today,
  courses,
  courseOffline,
  deadlines,
  search,
  settings,
  system,
  more,
  setup,
  learning,
  assessment,
  coding,
  study,
  material,
  inbox,
  notes,
  links,
  journal,
  collections,
  analytics,
  projects,
  grades,
  ai,
  cardQueue,
  exerciseQueue,
  explanations,
  mail,
  activity,
  drop,
  digest,
  jots,
  rules,
  voice,
  notFound,
  submission,
  dataExport,
  runtimeSettings,
  capabilities,
  connectors,
  devices,
  hostHandoff,
  conflictReview,
  deadlineProposals,
  studyPeek,
  taskPeek,
  trash,
  backup,
  addons,
  feedback,
  campus,
} as const

export type Namespace = keyof typeof deResources

export const namespaces = Object.keys(deResources) as Namespace[]

export const defaultNS = 'common' as const

/**
 * Deep-partial of a namespace's German shape — the type every OTHER
 * language's namespace file should (optionally) declare itself against, via
 * `satisfies LocaleNamespaceResource<'common'>` (see `docs/TRANSLATING.md`
 * and the file `npm run i18n:new` scaffolds). German defines the full key
 * set and every namespace must cover it completely (see `useT.ts`); other
 * locales get autocomplete and a type error for a key that doesn't exist in
 * German, but are free to omit keys they haven't translated yet — missing
 * keys are a lint-time concern for `npm run i18n:check`, not a type error.
 */
export type LocaleNamespaceResource<N extends Namespace> = DeepPartial<(typeof deResources)[N]>

type DeepPartial<T> = T extends string ? T : { [K in keyof T]?: DeepPartial<T[K]> }
