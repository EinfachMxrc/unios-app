// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { useCampusImport } from '@/hooks/useCampusImport'
import type { TypedT } from '@/i18n/useT'
import { activeIntlLocale, request } from '@/api'
import { CampusImportPanel } from '@/components/CampusImportPanel'
import { PrimussImportPanel } from '@/components/PrimussImportPanel'
import { MoodleRefresh } from '@/components/MoodleRefresh'
import { PortalSamplePanel } from '@/components/PortalSamplePanel'
import { Button } from '@/components/ui/button'
import { useInitialSync, useMoodleLogin, useSetupSteps } from './setup/setupHooks'
import { capturePortalLogin, closePortalLogin, isDesktopApp, openPortalLogin, type PortalName } from '@/lib/desktop'

const alphaWelcomeKey = 'unios-alpha-welcome-v1'

function hasSeenAlphaWelcome() {
  try {
    return window.localStorage.getItem(alphaWelcomeKey) === 'seen'
  } catch {
    return false
  }
}

export type SetupStatus = {
  installed: boolean
  completed: boolean
  institution: string
  institution_name: string
  profiles: Array<{ slug: string; name: string; connectors?: string[] }>
  pending_institution: string | null
  institution_confirmed: boolean
  moodle_available: boolean
  moodle_connected: boolean
  notifications: 'tested' | 'off' | null
  initial_sync: { status: string; course_count: number; resource_count: number; change_count: number } | null
  portals?: Array<{ portal: Exclude<PortalName, 'mail'>; connected: boolean; login_url: string }>
  study_program?: string | null
  study_program_confirmed?: boolean
}

function profileDescription(profile: SetupStatus['profiles'][number], t: TypedT<'setup'>) {
  const names =
    profile.connectors
      ?.filter((connector) => connector !== 'example_university')
      .map((connector) =>
        connector === 'mycampus'
          ? 'myCampus'
          : connector === 'moodle'
            ? 'Moodle'
            : connector === 'primuss'
              ? 'PRIMUSS'
              : connector,
      ) ?? []
  if (names.length) return t('plannedInProfile', { names: names.join(' · ') })
  if (profile.connectors?.includes('example_university')) return t('ownProfile')
  return t('showConnectionsAfterSelection')
}

function newTopic() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

export function SetupPage({ status, reload }: { status: SetupStatus; reload: () => void }) {
  const { t } = useT('setup')
  const { start: startCampusImport } = useCampusImport()
  const [showWelcome, setShowWelcome] = useState(() => !status.completed && !hasSeenAlphaWelcome())
  const [institution, setInstitution] = useState('')
  const [institutionSearch, setInstitutionSearch] = useState('')
  const [topic] = useState(newTopic)
  const [desktop] = useState(isDesktopApp)
  const { busy, error, setError, guard, step } = useSetupSteps(reload)
  const {
    loginUrl,
    moodleError,
    moodlePending,
    moodleOpening,
    moodleWindowOpened,
    callback,
    setCallback,
    manualToken,
    setManualToken,
    startMoodleLogin,
  } = useMoodleLogin({ step, reload, desktop })
  const [openedPortal, setOpenedPortal] = useState<PortalName | null>(null)
  const [programName, setProgramName] = useState('')
  const portals = status.portals ?? [] // an older host may not report portals yet
  const campusPortal = portals.find((item) => item.portal === 'mycampus')
  const programConfirmed = status.study_program_confirmed === true
  const remainingPortals = portals.filter((item) => item.portal !== 'mycampus')
  const notificationUrl = `https://ntfy.sh/${topic}`
  const selectedInstitution = institution || status.pending_institution || status.institution
  const visibleProfiles = status.profiles.filter((item) =>
    item.name.toLocaleLowerCase(activeIntlLocale()).includes(institutionSearch.toLocaleLowerCase(activeIntlLocale())),
  )

  const { syncing, syncError } = useInitialSync({
    ready: !status.completed && programConfirmed && status.moodle_connected && status.initial_sync === null,
    reload,
  })

  useEffect(() => {
    if ((!loginUrl || status.moodle_connected) && status.initial_sync?.status !== 'running' && !syncing) return
    const interval = window.setInterval(reload, 3000)
    return () => window.clearInterval(interval)
  }, [loginUrl, reload, status.initial_sync?.status, status.moodle_connected, syncing])

  async function openPortal(portal: PortalName, url: string) {
    setError('')
    try {
      await openPortalLogin(portal, url)
      setOpenedPortal(portal)
    } catch {
      setError(t('portalOpenFailed'))
    }
  }

  function takeOverPortal(portal: PortalName) {
    return guard(async () => {
      const login = await capturePortalLogin(portal)
      await request(`/api/setup/portals/${portal}/session`, { method: 'POST', body: JSON.stringify(login) })
      if (portal === 'mycampus') {
        const chosen = await request<{ name: string; url: string } | null>('/api/mycampus/program').catch(() => null)
        if (chosen) await startCampusImport().catch(() => undefined)
      }
      await closePortalLogin(portal).catch(() => undefined)
      setOpenedPortal(null)
      reload()
    }, 'portalTakeOverFailed')
  }

  function continueToSetup() {
    setShowWelcome(false)
    try {
      window.localStorage.setItem(alphaWelcomeKey, 'seen')
    } catch {
      /* Storage can be unavailable. */
    }
  }

  if (showWelcome) {
    return (
      <main className="setup-page setup-welcome-page">
        <section className="setup-card setup-welcome" aria-labelledby="alpha-welcome-title">
          <p className="eyebrow">{t('welcomeEyebrow')}</p>
          <h1 id="alpha-welcome-title">
            {t('welcomeTitle')}{' '}
            {/* eslint-disable-next-line i18next/no-literal-string -- decorative emoji, not natural-language text */}
            <span aria-hidden="true">👋</span>
          </h1>
          <p>{t('welcomeIntro')}</p>
          <div className="setup-welcome-note">
            <p>{t('welcomeNote1')}</p>
            <p>{t('welcomeNote2')}</p>
          </div>
          <Button className="setup-welcome-button" onClick={continueToSetup}>
            {t('welcomeContinueButton')}
          </Button>
        </section>
      </main>
    )
  }

  return (
    <main className="setup-page">
      <div className="setup-card">
        {status.completed && (
          <Link className="subtle-link" to="/system">
            {t('backToConnections')}
          </Link>
        )}
        <p className="eyebrow">{t('eyebrow')}</p>
        <h1>{status.completed ? t('titleContinue') : t('titleStart')}</h1>
        <p className="muted-text">{t('passwordHint')}</p>
        {error && (
          <p role="alert" className="setup-error">
            {error}
          </p>
        )}

        {(!status.institution_confirmed || status.completed) && (
          <section className="setup-step">
            <h2>{t('step1Heading')}</h2>
            <label htmlFor="setup-institution-search">{t('institutionSearchLabel')}</label>
            <input
              className="native-input"
              id="setup-institution-search"
              type="search"
              value={institutionSearch}
              onChange={(event) => setInstitutionSearch(event.target.value)}
              placeholder={t('institutionSearchPlaceholder')}
            />
            <div className="setup-profile-list" role="group" aria-label={t('institutionGroupLabel')}>
              {visibleProfiles.map((item) => (
                <button
                  type="button"
                  className={`setup-profile ${selectedInstitution === item.slug ? 'selected' : ''}`}
                  key={item.slug}
                  aria-pressed={selectedInstitution === item.slug}
                  onClick={() => setInstitution(item.slug)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{profileDescription(item, t)}</small>
                  </span>
                  <span className="setup-profile-state">
                    {selectedInstitution === item.slug ? t('selected') : t('select')}
                  </span>
                </button>
              ))}
              {!visibleProfiles.length && <p className="muted-text">{t('noInstitutionFound')}</p>}
            </div>
            {status.pending_institution && status.pending_institution !== status.institution && (
              <p role="status">{t('profileSavedRestartHint')}</p>
            )}
            {!status.institution_confirmed &&
              status.pending_institution === status.institution &&
              selectedInstitution === status.institution && (
                <Button
                  disabled={busy}
                  onClick={() => void step('/api/setup/institution', { slug: institution || status.institution })}
                >
                  {t('confirmInstitution')}
                </Button>
              )}
            {selectedInstitution !== status.institution && (
              <Button
                disabled={busy}
                onClick={() => void step('/api/setup/institution', { slug: institution || status.pending_institution })}
              >
                {t('saveSelection')}
              </Button>
            )}
          </section>
        )}

        {status.institution_confirmed && (
          <section className="setup-step" aria-labelledby="setup-program-title">
            <h2 id="setup-program-title">{t('programHeading')}</h2>
            <p className="muted-text">{t('programIntro')}</p>
            {status.study_program && <p role="status">{t('programSelected', { name: status.study_program })}</p>}
            {campusPortal ? (
              <>
                {!campusPortal.connected && (
                  <>
                    <p>{t('programLoginHint')}</p>
                    {!desktop && <p>{t('portalsDesktopOnly')}</p>}
                    <div className="setup-actions">
                      <Button
                        disabled={!desktop || busy}
                        onClick={() => void openPortal('mycampus', campusPortal.login_url)}
                      >
                        {t('programSignIn')}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!desktop || busy || openedPortal !== 'mycampus'}
                        onClick={() => void takeOverPortal('mycampus')}
                      >
                        {t('portalTakeOver')}
                      </Button>
                    </div>
                  </>
                )}
                <CampusImportPanel disabled={!campusPortal.connected} onProgramChosen={reload} />
                {campusPortal.connected && (
                  <details className="setup-fields">
                    <summary>{t('programLoginAgain')}</summary>
                    <div className="setup-actions">
                      <Button
                        variant="outline"
                        disabled={!desktop || busy}
                        onClick={() => void openPortal('mycampus', campusPortal.login_url)}
                      >
                        {t('portalSignInAgain')}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!desktop || busy || openedPortal !== 'mycampus'}
                        onClick={() => void takeOverPortal('mycampus')}
                      >
                        {t('portalTakeOver')}
                      </Button>
                    </div>
                  </details>
                )}
                <PortalSamplePanel portal="mycampus" disabled={!desktop || openedPortal !== 'mycampus'} />
              </>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void step('/api/setup/program', { name: programName.trim() })
                }}
              >
                <label htmlFor="setup-program-name">{t('programNameLabel')}</label>
                <input
                  className="native-input"
                  id="setup-program-name"
                  value={programName}
                  maxLength={300}
                  required
                  minLength={2}
                  placeholder={t('programPlaceholder')}
                  onChange={(event) => setProgramName(event.target.value)}
                />
                <p className="muted-text">{t('programManualHint')}</p>
                <Button type="submit" disabled={busy || programName.trim().length < 2}>
                  {t('programSave')}
                </Button>
              </form>
            )}
          </section>
        )}

        {status.institution_confirmed && programConfirmed && (!status.moodle_connected || status.completed) && (
          <section className="setup-step">
            <h2>{status.moodle_available ? t('moodleConnectHeading') : t('institutionSelectedHeading')}</h2>
            {status.moodle_available && <p className="muted-text">{t('moodleIntro')}</p>}
            {!status.moodle_available && <p>{t('moodleNotSetUpForProfile')}</p>}
            {status.moodle_available && status.moodle_connected && <MoodleRefresh />}
            {status.moodle_available && status.institution_confirmed && (
              <>
                <p>{t('moodleLoginIntro')}</p>
                <Button disabled={busy || moodleOpening || moodlePending} onClick={() => void startMoodleLogin()}>
                  {moodleOpening
                    ? t('moodleLoginOpening')
                    : status.moodle_connected
                      ? t('reconnectMoodle')
                      : t('prepareMoodleLogin')}
                </Button>
                {moodlePending && (
                  <p role="status" className="muted-text">
                    {t('moodleLoginChecking')}
                  </p>
                )}
                {moodleError && (
                  <p role="alert" className="setup-error">
                    {moodleError}
                  </p>
                )}
                {loginUrl && (
                  <div className="setup-fields">
                    {desktop ? (
                      <>
                        {moodleWindowOpened && <p className="muted-text">{t('loginWindowHint')}</p>}
                        <Button
                          variant="outline"
                          disabled={busy || moodleOpening || moodlePending}
                          onClick={() => void startMoodleLogin()}
                        >
                          {t('openMoodleLoginWindow')}
                        </Button>
                        <a href={loginUrl} target="_blank" rel="noopener noreferrer">
                          {t('openInBrowserInstead')}
                        </a>
                      </>
                    ) : (
                      <>
                        <a href={loginUrl} target="_blank" rel="noopener noreferrer">
                          {t('openMoodleLogin')}
                        </a>
                        <p className="muted-text">{t('afterLoginHint')}</p>
                      </>
                    )}
                    <details>
                      <summary>{t('returnFailedSummary')}</summary>
                      <label htmlFor="setup-callback">{t('callbackLabel')}</label>
                      <input
                        className="native-input"
                        id="setup-callback"
                        type="password"
                        autoComplete="off"
                        value={callback}
                        onChange={(event) => setCallback(event.target.value)}
                      />
                      <p className="muted-text">{t('callbackHint')}</p>
                      <Button
                        disabled={busy || !callback}
                        onClick={() => void step('/api/setup/moodle/callback', { callback })}
                      >
                        {t('checkConnection')}
                      </Button>
                    </details>
                  </div>
                )}
                <details className="setup-fields">
                  <summary>{t('alreadyHaveTokenSummary')}</summary>
                  <label htmlFor="setup-token">{t('tokenLabel')}</label>
                  <input
                    className="native-input"
                    id="setup-token"
                    type="password"
                    autoComplete="off"
                    value={manualToken}
                    onChange={(event) => setManualToken(event.target.value)}
                  />
                  <Button
                    disabled={busy || !manualToken}
                    onClick={() => void step('/api/setup/moodle', { token: manualToken })}
                  >
                    {t('checkToken')}
                  </Button>
                </details>
              </>
            )}
          </section>
        )}

        {remainingPortals.length > 0 &&
          status.institution_confirmed &&
          programConfirmed &&
          (status.completed || !status.moodle_available || status.moodle_connected) && (
            <section className="setup-step">
              <h2>{t('portalsHeading')}</h2>
              <p className="muted-text">{t('portalsIntro')}</p>
              {!desktop && <p>{t('portalsDesktopOnly')}</p>}
              {remainingPortals.map((item) => (
                <div className="setup-fields" key={item.portal}>
                  <strong>{item.portal === 'primuss' ? t('portalPrimuss') : t('portalMycampus')}</strong>
                  {item.connected && <p role="status">{t('portalConnected')}</p>}
                  <p className="muted-text">
                    {item.portal === 'primuss' ? t('portalPrimussHint') : t('portalMycampusHint')}
                  </p>
                  <div className="setup-actions">
                    <Button
                      variant={item.connected ? 'outline' : 'default'}
                      disabled={!desktop || busy}
                      onClick={() => void openPortal(item.portal, item.login_url)}
                    >
                      {item.connected ? t('portalSignInAgain') : t('portalSignIn')}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!desktop || busy || openedPortal !== item.portal}
                      onClick={() => void takeOverPortal(item.portal)}
                    >
                      {t('portalTakeOver')}
                    </Button>
                  </div>
                  {item.portal === 'mycampus' && <CampusImportPanel disabled={!item.connected} />}
                  {item.portal === 'primuss' && (
                    <PrimussImportPanel disabled={!item.connected} loginUrl={item.login_url} />
                  )}
                  <PortalSamplePanel portal={item.portal} disabled={!desktop || openedPortal !== item.portal} />
                </div>
              ))}
              <p className="muted-text">{t('portalsDataPending')}</p>
            </section>
          )}

        {!status.completed &&
          status.institution_confirmed &&
          programConfirmed &&
          status.moodle_available &&
          status.moodle_connected && (
            <section className="setup-step" aria-live="polite">
              <h2>{t('initialSyncHeading')}</h2>
              {status.initial_sync?.status === 'running' || (!status.initial_sync && !syncError) ? (
                <p>{t('initialSyncLoading')}</p>
              ) : status.initial_sync ? (
                <p>
                  {t('initialSyncResult', {
                    courses: status.initial_sync.course_count,
                    resources: status.initial_sync.resource_count,
                    changes: status.initial_sync.change_count,
                  })}
                </p>
              ) : (
                <p>{t('initialSyncFailed')}</p>
              )}
              {status.initial_sync?.status === 'error' && <p>{t('initialSyncErrorHint')}</p>}
            </section>
          )}

        {!status.completed &&
          status.institution_confirmed &&
          programConfirmed &&
          (!status.moodle_available || status.moodle_connected) &&
          status.initial_sync?.status !== 'running' &&
          (status.initial_sync !== null || !status.moodle_available || syncError) && (
            <section className="setup-step">
              <h2>{t('step3Heading')}</h2>
              {!status.notifications && (
                <>
                  <p>{t('notificationsIntro')}</p>
                  <code className="setup-topic">{notificationUrl}</code>
                  <div className="setup-actions">
                    <Button
                      disabled={busy}
                      onClick={() => void step('/api/setup/notifications', { enabled: true, url: notificationUrl })}
                    >
                      {t('sendTestNotification')}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void step('/api/setup/notifications', { enabled: false })}
                    >
                      {t('startWithoutNotifications')}
                    </Button>
                  </div>
                </>
              )}
              {status.notifications === 'tested' && <p>{t('notificationsTested')}</p>}
              {status.notifications === 'off' && <p>{t('notificationsOff')}</p>}
            </section>
          )}

        {!status.completed &&
          status.institution_confirmed &&
          programConfirmed &&
          (!status.moodle_available || status.moodle_connected) &&
          (status.initial_sync !== null || !status.moodle_available || syncError) &&
          status.notifications && (
            <Button disabled={busy} onClick={() => void step('/api/setup/complete')}>
              {t('openUniOS')}
            </Button>
          )}
      </div>
    </main>
  )
}
