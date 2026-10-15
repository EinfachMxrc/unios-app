// SPDX-License-Identifier: AGPL-3.0-or-later

import { setAccessibility, useAccessibility } from '@/accessibility'
import { useEffect, useState } from 'react'
import { useT } from '@/i18n/useT'
import { request, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { SettingToggle as Toggle } from '@/components/SettingToggle'
import { setTheme, useTheme, type Theme } from '@/hooks/useTheme'
import './SettingsPage.css'
import { DataExportPanel } from '@/components/DataExportPanel'
import { BackupPanel } from '@/components/BackupPanel'
import { RuntimeSettingsPanel } from '@/components/RuntimeSettingsPanel'
import { FeedbackPanel } from '@/components/FeedbackPanel'
import { Failure, Panel } from '@/components/State'
import { ActionFeedback } from '@/components/ActionFeedback'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import { queryClient } from '@/offlineCache'
import { setAdvanced, setDensity, setLanguage, setModule, usePreferences } from '@/preferences'
import type { Language, ModuleKey } from '@/preferences'
import { listSupportedLocales } from '@/i18n/localeMeta'
import { ClientSettings } from '@/components/ServerConnection'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { UsageMetricsPanel } from '@/components/UsageMetricsPanel'
export function SettingsPage() {
  const theme = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const sections = ['general', 'appearance', 'reminders', 'data', 'feedback'] as const
  const activeSection = sections.find(id => location.hash === `#${id}`) ?? 'general'
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [location.hash])
  const accessibility = useAccessibility()
  const { t: quality } = useT('quality')
  const preferences = usePreferences()
  const canWrite = useWritableHost()
  const { t } = useT('settings')
  const { t: onboardingT } = useT('releaseOnboarding')
  const modules: { name: ModuleKey; title: string; description: string }[] = [
    { name: 'courses', title: t('moduleCoursesTitle'), description: t('moduleCoursesDescription') },
    { name: 'deadlines', title: t('moduleDeadlinesTitle'), description: t('moduleDeadlinesDescription') },
    { name: 'notifications', title: t('moduleNotificationsTitle'), description: t('moduleNotificationsDescription') },
    { name: 'search', title: t('moduleSearchTitle'), description: t('moduleSearchDescription') },
  ]
  const {
    data: digest,
    error: digestError,
    reload: reloadDigest,
  } = useApi<{ enabled: boolean }>('/api/digest/preference')
  const [digestMessage, setDigestMessage] = useState('')
  const { data: submissionControl, reload: reloadSubmissionControl } = useApi<{ enabled: boolean }>(
    '/api/submissions/control',
  )
  const [submissionMessage, setSubmissionMessage] = useState('')
  const changeSubmissionControl = useApiMutation(
    (enabled: boolean) =>
      request<{ enabled: boolean }>('/api/submissions/control', { method: 'PUT', body: JSON.stringify({ enabled }) }),
    {
      onSuccess: (saved) => {
        queryClient.setQueryData(['api', '/api/submissions/control'], saved)
        reloadSubmissionControl()
        setSubmissionMessage(saved.enabled ? t('submissionControlOn') : t('submissionControlOff'))
      },
    },
  )
  const changeDigest = useApiMutation(
    (enabled: boolean) =>
      request<{ enabled: boolean }>('/api/digest/preference', { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    {
      invalidate: ['/api/digest'],
      onSuccess: (saved) => {
        queryClient.setQueryData(['api', '/api/digest/preference'], saved)
        reloadDigest()
        setDigestMessage(saved.enabled ? t('digestOn') : t('digestOff'))
      },
    },
  )
  return (
    <Shell title={t('title')} eyebrow={t('eyebrow')}>
      <div className="settings-workspace">
      <label className="settings-mobile-section">{t('sections')}
        <select className="native-select" value={activeSection} onChange={event => navigate(`#${event.target.value}`)}>
          {sections.map(id => <option key={id} value={id}>{t(id)}</option>)}
        </select></label>
      <nav className="settings-jump-nav" aria-label={t('sections')}>
        {sections.map((id) => (
          <Link key={id} to={`#${id}`} aria-current={activeSection === id ? 'page' : undefined}>
            {t(id)}
          </Link>
        ))}
      </nav>
      <div className="settings-stack">
        <section id="general" hidden={activeSection !== 'general'} className="settings-section" aria-labelledby="general-heading">
          <h2 id="general-heading">{t('general')}</h2>
          <Panel title={t('language')}>
            <div className="setting-row">
              <div>
                <strong>{t('language')}</strong>
              </div>
              <select
                className="native-select"
                aria-label={t('language')}
                value={preferences.language}
                onChange={(event) => setLanguage(event.target.value as Language)}
              >
                {/* Always the language's own name for itself ("Deutsch", "English", …) rather
                  than a translation of the name into the currently active UI language — a
                  contributor should always be able to find and read their own language's
                  entry, and it comes straight from that language's locale.json, so a newly
                  added language needs no translation key added anywhere to appear here. */}
                {listSupportedLocales().map((locale) => (
                  <option key={locale.code} value={locale.code}>
                    {locale.nativeName}
                  </option>
                ))}
              </select>
            </div>
          </Panel>
          <Panel title={t('yourAreasTitle')}>
            <p className="muted-text mb-4">{t('yourAreasHint')}</p>
            {modules.map((module) => (
              <Toggle
                key={module.name}
                title={module.title}
                description={module.description}
                checked={preferences.modules[module.name]}
                onChange={(enabled) => setModule(module.name, enabled)}
              />
            ))}
            <Toggle
              title={t('projectsTitle')}
              description={t('projectsDescription')}
              checked={preferences.modules.projects}
              onChange={(enabled) => setModule('projects', enabled)}
            />
            <Toggle
              title={t('gradesTitle')}
              description={t('gradesDescription')}
              checked={preferences.modules.grades}
              onChange={(enabled) => setModule('grades', enabled)}
            />
            <Toggle
              title={t('aiTitle')}
              description={t('aiDescription')}
              checked={preferences.modules.ai}
              onChange={(enabled) => setModule('ai', enabled)}
            />
            <Toggle
              title={t('mailTitle')}
              description={t('mailDescription')}
              checked={preferences.modules.mail}
              onChange={(enabled) => setModule('mail', enabled)}
            />
            <Toggle
              title={t('addonsTitle')}
              description={t('addonsDescription')}
              checked={preferences.modules.addons}
              onChange={(enabled) => setModule('addons', enabled)}
            />
            <Toggle
              title={t('advancedTitle')}
              description={t('advancedDescription')}
              checked={preferences.advanced}
              onChange={setAdvanced}
            />
          </Panel>
          <Panel title={onboardingT('steps')}>
            <div className="flex flex-wrap gap-4">
              <Link className="subtle-link" to="/welcome">
                {onboardingT('demo')}
              </Link>
              <Link className="subtle-link" to="/import">
                {onboardingT('importTitle')}
              </Link>
              <Link className="subtle-link" to="/ai">
                {onboardingT('workTitle')}
              </Link>
            </div>
          </Panel>
        </section>
        <section id="appearance" hidden={activeSection !== 'appearance'} className="settings-section" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading">{t('appearance')}</h2>
          <Panel title={t('theme')}>
            <label className="setting-row">
              {t('theme')}
              <select className="native-select" value={theme}
                onChange={(event) => setTheme(event.target.value as Theme)} aria-label={t('theme')}>
                <option value="system">{t('themeSystem')}</option>
                <option value="light">{t('themeLight')}</option>
                <option value="dark">{t('themeDark')}</option>
              </select>
            </label>
          </Panel>
          <Panel title={t('accessibilityTitle')}>
            <label className="setting-row">
              {quality('density')}
              <select
                className="native-select"
                value={preferences.density}
                onChange={(event) => setDensity(event.target.value === 'compact' ? 'compact' : 'comfortable')}
              >
                <option value="comfortable">{quality('comfortable')}</option>
                <option value="compact">{quality('compact')}</option>
              </select>
            </label>
            <label className="setting-row">
              {t('textSize')}
              <select
                className="native-select"
                value={accessibility.scale}
                onChange={(event) => setAccessibility({ scale: Number(event.target.value) as 100 | 112 | 125 | 150 })}
              >
                {[100, 112, 125, 150].map((size) => (
                  <option key={size} value={size}>
                    {size}%
                  </option>
                ))}
              </select>
            </label>
            <Toggle
              title={t('highContrast')}
              description={t('highContrastHint')}
              checked={accessibility.contrast}
              onChange={(contrast) => setAccessibility({ contrast })}
            />
            <Toggle
              title={t('reduceMotion')}
              description={t('reduceMotionHint')}
              checked={accessibility.reduceMotion}
              onChange={(reduceMotion) => setAccessibility({ reduceMotion })}
            />
          </Panel>
        </section>
        <section id="reminders" hidden={activeSection !== 'reminders'} className="settings-section" aria-labelledby="reminders-heading">
          <h2 id="reminders-heading">{t('reminders')}</h2>
          <RuntimeSettingsPanel />
          <Panel title={t('digestTitle')}>
            {digestError && <Failure message={digestError} />}
            {digest && (
              <Toggle
                title={t('digestTitle')}
                description={t('digestDescription')}
                checked={digest.enabled}
                disabled={!canWrite || changeDigest.pending}
                busy={changeDigest.pending}
                onChange={(enabled) => {
                  setDigestMessage('')
                  changeDigest.mutate(enabled)
                }}
              />
            )}
            {changeDigest.pending && <ActionFeedback tone="pending" message={t('digestSavingStatus')} />}
            {digestMessage && <ActionFeedback tone="success" message={digestMessage} />}
            {changeDigest.error && <ActionFeedback tone="error" message={changeDigest.error} />}
          </Panel>
        </section>
        <section id="data" hidden={activeSection !== 'data'} className="settings-section" aria-labelledby="data-heading">
          <h2 id="data-heading">{t('data')}</h2>
          <BackupPanel />
          <details className="settings-more" open={preferences.advanced || undefined}>
            <summary>{t('dataDetails')}</summary>
            <div className="settings-more-content">
              <ClientSettings />
              {submissionControl && (
                <Toggle
                  title={t('submissionControlTitle')}
                  description={t('submissionControlDescription')}
                  checked={submissionControl.enabled}
                  disabled={!canWrite || changeSubmissionControl.pending}
                  busy={changeSubmissionControl.pending}
                  onChange={(enabled) => {
                    setSubmissionMessage('')
                    changeSubmissionControl.mutate(enabled)
                  }}
                />
              )}
              {changeSubmissionControl.pending && (
                <ActionFeedback tone="pending" message={t('submissionControlSavingStatus')} />
              )}
              {submissionMessage && <ActionFeedback tone="success" message={submissionMessage} />}
              {changeSubmissionControl.error && <ActionFeedback tone="error" message={changeSubmissionControl.error} />}
              <Link className="subtle-link" to="/system">
                {t('dataManagement')}
              </Link>
              <DataExportPanel />
            </div>
          </details>
        </section>
        <section id="feedback" hidden={activeSection !== 'feedback'} className="settings-section" aria-labelledby="feedback-heading">
          <h2 id="feedback-heading">{t('feedback')}</h2>
          <FeedbackPanel />
          <UsageMetricsPanel />
        </section>
      </div>
      </div>
    </Shell>
  )
}
