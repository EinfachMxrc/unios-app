// SPDX-License-Identifier: AGPL-3.0-or-later

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { Suspense, useEffect, type ReactNode, type ComponentType } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useApi } from '@/api'
import { readFreshness } from '@/readFreshness'
import { HostContext } from '@/hooks/host'
import { persistOptions, queryClient } from '@/offlineCache'
import { markHostUnverified } from '@/hostAvailability'
import type { HostStatus } from '@/types'
import { MensaPage } from '@/pages/MensaPage'
const RoomsPage = lazyArea('rooms', () => import('@/pages/RoomsPage').then((module) => ({ default: module.RoomsPage })))
import { Today } from '@/pages/Today'
import { Courses } from '@/pages/Courses'
const UniversityDocuments = lazyArea('universityDocuments', () =>
  import('@/pages/UniversityDocuments').then((module) => ({ default: module.UniversityDocuments })),
)
import { CoursePage } from '@/pages/CoursePage'
import { SearchPage } from '@/pages/SearchPage'
const NotesPage = lazyArea('notes', () => import('@/pages/NotesPage').then((module) => ({ default: module.NotesPage })))
const DropPage = lazyArea('drop', () => import('@/pages/DropPage').then((module) => ({ default: module.DropPage })))
const DigestPage = lazyArea('digest', () =>
  import('@/pages/DigestPage').then((module) => ({ default: module.DigestPage })),
)
const JotsPage = lazyArea('jots', () => import('@/pages/JotsPage').then((module) => ({ default: module.JotsPage })))
const JournalPage = lazyArea('journal', () =>
  import('@/pages/JournalPage').then((module) => ({ default: module.JournalPage })),
)
import { InboxPage } from '@/pages/InboxPage'
const CollectionsPage = lazyArea('collections', () =>
  import('@/pages/CollectionsPage').then((module) => ({ default: module.CollectionsPage })),
)
const RulesPage = lazyArea('rules', () => import('@/pages/RulesPage').then((module) => ({ default: module.RulesPage })))
const VoicePage = lazyArea('voice', () => import('@/pages/VoicePage').then((module) => ({ default: module.VoicePage })))
import { JotOutboxSync } from '@/hooks/useJotOutbox'
import { AnnotationOutboxSync } from '@/hooks/useAnnotationOutbox'
import { StudySync } from '@/components/StudySync'
import { CampusSyncIndicator } from '@/components/CampusSyncIndicator'
import { DeadlinesPage } from '@/pages/DeadlinesPage'
const MarketplacePage = lazyArea('marketplace', () =>
  import('@/pages/MarketplacePage').then((module) => ({ default: module.MarketplacePage })),
)
const JobsPage = lazyArea('jobs', () => import('@/pages/JobsPage').then((module) => ({ default: module.JobsPage })))
const AssessmentPage = lazyArea('assessment', () =>
  import('@/pages/AssessmentPage').then((module) => ({ default: module.AssessmentPage })),
)
const CodingPage = lazyArea('coding', () =>
  import('@/pages/CodingPage').then((module) => ({ default: module.CodingPage })),
)
const NotificationsPage = lazyArea('notifications', () =>
  import('@/pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })),
)
const ActivityPage = lazyArea('activity', () =>
  import('@/pages/ActivityPage').then((module) => ({ default: module.ActivityPage })),
)
const TrashPage = lazyArea('trash', () => import('@/pages/TrashPage').then((module) => ({ default: module.TrashPage })))
import { NotFound } from '@/pages/NotFound'
import { MorePage } from '@/pages/MorePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SetupPage, type SetupStatus } from '@/pages/SetupPage'
const CampusPage = lazyArea('campus', () =>
  import('@/pages/CampusPage').then((module) => ({ default: module.CampusPage })),
)
import { CardQueuePage } from '@/pages/CardQueuePage'
const ExercisePage = lazyArea('exercises', () =>
  import('@/pages/ExercisePage').then((module) => ({ default: module.ExercisePage })),
)
const AiPage = lazyArea('ai', () => import('@/pages/AiPage').then((module) => ({ default: module.AiPage })))
import { LearningPage } from '@/pages/LearningPage'
const FocusWorkspacePage = lazyArea('learningFocus', () =>
  import('@/pages/FocusWorkspacePage').then((module) => ({ default: module.FocusWorkspacePage })),
)
const ExplanationPage = lazyArea('explanations', () =>
  import('@/pages/ExplanationPage').then((module) => ({ default: module.ExplanationPage })),
)
import { Shell } from '@/components/Shell'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/State'
import { lazyRoute } from '@/lib/routeLoading'
import { NavigationIntent } from '@/components/NavigationIntent'
import { WorkspaceNavigation } from '@/components/WorkspaceNavigation'
import { RouteBoundary } from '@/components/RouteBoundary'
import { usePreferences } from '@/preferences'
import { areaRoutes } from '@/components/sidebarCatalog'
import { useTheme } from '@/hooks/useTheme'
import type { ModuleKey } from '@/preferences'
import { useLanguageSync } from '@/i18n/useLanguageSync'
import { useT } from '@/i18n/useT'
import { isDesktopApp, openExternalUrl } from '@/lib/desktop'
import { InAppLinks } from '@/components/InAppLinks'
import { externalTarget } from '@/lib/inAppLinks'
import '@/accessibility'
import '@/components/Topbar.css'
import '@/styles/application.css'
import { ClientGate } from '@/components/ServerConnection'
import { RecoveryModeGate, RuntimeVerifiedOnly } from '@/components/RecoveryModeGate'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { ImportWizard } from '@/components/ImportWizard'
import { restartNativeBackend } from '@/lib/releaseModes'
const SystemPage = lazyArea('system', () =>
  import('@/pages/SystemPage').then((module) => ({ default: module.SystemPage })),
)
const MaterialPage = lazyArea('material', () =>
  import('@/pages/MaterialPage').then((module) => ({ default: module.MaterialPage })),
)
const DocumentPage = lazyArea('document', () =>
  import('@/pages/DocumentPage').then((module) => ({ default: module.DocumentPage })),
)
const ProjectsPage = lazyArea('projects', () =>
  import('@/pages/ProjectsPage').then((module) => ({ default: module.ProjectsPage })),
)
const ProjectPage = lazyArea('project', () =>
  import('@/pages/ProjectsPage').then((module) => ({ default: module.ProjectPage })),
)
const GradesPage = lazyArea('grades', () =>
  import('@/pages/GradesPage').then((module) => ({ default: module.GradesPage })),
)
const MailPage = lazyArea('mail', () => import('@/pages/MailPage').then((module) => ({ default: module.MailPage })))
const StudyPage = lazyArea('study', () => import('@/pages/StudyPage').then((module) => ({ default: module.StudyPage })))
const StudySessionPage = lazyArea('studySession', () =>
  import('@/pages/StudySessionPage').then((module) => ({ default: module.StudySessionPage })),
)
const AnalyticsPage = lazyArea('analytics', () =>
  import('@/pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })),
)
const AddonCatalogPage = lazyArea('addons', () =>
  import('@/addons/AddonCatalogPage').then((module) => ({ default: module.AddonCatalogPage })),
)
const AddonPage = lazyArea('addon', () =>
  import('@/addons/AddonPage').then((module) => ({ default: module.AddonPage })),
)
function lazyArea<T extends ComponentType>(page: string, loader: () => Promise<{ default: T }>) {
  const route = areaRoutes.find((route) => route.page === page)
  if (!route) throw new Error(`Unknown area page: ${page}`)
  return lazyRoute(page === 'journal' ? `${route.path}/*` : route.path, loader)
}
const pageElements: Record<string, ReactNode> = {
  today: <Today />,
  courses: <Courses />,
  learning: <LearningPage />,
  learningFocus: <FocusWorkspacePage />,
  notes: <NotesPage />,
  deadlines: <DeadlinesPage />,
  inbox: <InboxPage />,
  search: <SearchPage />,
  jots: <JotsPage />,
  notifications: <NotificationsPage />,
  collections: <CollectionsPage />,
  voice: <VoicePage />,
  drop: <DropPage />,
  universityDocuments: <UniversityDocuments />,
  study: <StudyPage />,
  assessment: <AssessmentPage />,
  coding: <CodingPage />,
  analytics: <AnalyticsPage />,
  journal: <JournalPage />,
  digest: <DigestPage />,
  projects: <ProjectsPage />,
  grades: <GradesPage />,
  mail: <MailPage />,
  mensa: <MensaPage />,
  rooms: <RoomsPage />,
  campus: <CampusPage />,
  rules: <RulesPage />,
  anki: <CardQueuePage />,
  exercises: <ExercisePage />,
  explanations: <ExplanationPage />,
  ai: <AiPage />,
  addons: <AddonCatalogPage />,
  marketplace: <MarketplacePage />,
  jobs: <JobsPage />,
  system: <SystemPage />,
  activity: <ActivityPage />,
  trash: <TrashPage />,
  settings: <SettingsPage />,
  more: <MorePage />,
  course: <CoursePage />,
  material: <MaterialPage />,
  document: <DocumentPage />,
  studySession: <StudySessionPage />,
  studyCards: <CardQueuePage manualOnly />,
  project: <ProjectPage />,
  addon: <AddonPage />,
}
function RouteLoading() {
  const { t } = useT('common')
  return (
    <Shell title={t('pageLoading')}>
      <div role="status" aria-label={t('pageLoading')}>
        <Loading />
      </div>
    </Shell>
  )
}
function ImportPage() {
  const { t } = useT('releaseOnboarding')
  return (
    <Shell title={t('importTitle')}>
      <ImportWizard />
    </Shell>
  )
}
function ModuleRoute({ name, children }: { name: ModuleKey; children: ReactNode }) {
  const preferences = usePreferences()
  const { t } = useT('common')
  if (preferences.modules[name]) return children
  return (
    <Shell title={t('moduleHidden.title')}>
      <p className="muted-text mb-4">{t('moduleHidden.description')}</p>
      <Button asChild>
        <Link to="/settings">{t('moduleHidden.openSettings')}</Link>
      </Button>
    </Shell>
  )
}
function RoutedApp() {
  useLanguageSync()
  useEffect(() => {
    if (!isDesktopApp()) return
    const openInBrowser = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest('a[href]')
      const url = link instanceof HTMLAnchorElement ? externalTarget(link, window.location.origin) : null
      if (!url) return
      event.preventDefault()
      void openExternalUrl(url).catch(() => window.open(url, '_blank', 'noopener,noreferrer'))
    }
    document.addEventListener('click', openInBrowser)
    return () => document.removeEventListener('click', openInBrowser)
  }, [])
  useEffect(() => {
    const pause = () => markHostUnverified()
    const resume = () => {
      markHostUnverified()
      void queryClient.invalidateQueries({ queryKey: ['api', '/api/host'] })
    }
    const visibility = () => (document.visibilityState === 'hidden' ? pause() : resume())
    let lastTick = Date.now()
    const clock = window.setInterval(() => {
      const now = Date.now()
      if (now - lastTick > 20_000) resume()
      lastTick = now
    }, 5_000)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pageshow', resume)
    window.addEventListener('online', resume)
    return () => {
      window.clearInterval(clock)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener('online', resume)
    }
  }, [])
  useTheme(true)
  const { data: host } = useApi<HostStatus>('/api/host')
  const { data: setup, reload: reloadSetup } = useApi<SetupStatus>('/api/setup/status')
  if (setup?.installed && !setup.completed) {
    return (
      <HostContext.Provider value={host}>
        <SetupPage status={setup} reload={reloadSetup} />
      </HostContext.Provider>
    )
  }
  return (
    <HostContext.Provider value={host}>
      <RuntimeVerifiedOnly>
        <JotOutboxSync />
        <AnnotationOutboxSync />
        <StudySync />
      </RuntimeVerifiedOnly>
      <BrowserRouter>
        <NavigationIntent />
        <InAppLinks />
        <WorkspaceNavigation />
        <RouteBoundary>
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route
                path="/welcome"
                element={
                  <OnboardingPage
                    demoAvailable={isDesktopApp()}
                    onStartDemo={() => restartNativeBackend('demo')}
                    onConnect={() => window.location.assign('/setup')}
                  />
                }
              />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/setup" element={setup ? <SetupPage status={setup} reload={reloadSetup} /> : <Loading />} />
              {areaRoutes.map(({ path, page, module }) => {
                const element = pageElements[page]
                return (
                  <Route
                    key={path}
                    path={path}
                    element={module ? <ModuleRoute name={module}>{element}</ModuleRoute> : element}
                  />
                )
              })}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </RouteBoundary>
      </BrowserRouter>
    </HostContext.Provider>
  )
}
function App() {
  return (
    <RecoveryModeGate>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
        onSuccess={() =>
          queryClient.invalidateQueries({
            // Reuse is for navigation in this runtime, not for suppressing a fresh
            // server check after restart. Offline data stays visible during refetch.
            predicate: (query) =>
              query.queryKey[0] === 'api' &&
              typeof query.queryKey[1] === 'string' &&
              readFreshness(query.queryKey[1]) > 0,
            refetchType: 'none',
          })
        }
      >
        <ClientGate>
          <RoutedApp />
          <RuntimeVerifiedOnly>
            <CampusSyncIndicator />
          </RuntimeVerifiedOnly>
        </ClientGate>
      </PersistQueryClientProvider>
    </RecoveryModeGate>
  )
}
export default App
