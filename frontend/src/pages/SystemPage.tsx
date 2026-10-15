// SPDX-License-Identifier: AGPL-3.0-or-later

import { useContext } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { CloudOff, HardDrive, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { localDate, useApi } from '@/api'
import type { SystemResponse } from '@/types'
import { Shell } from '@/components/Shell'
import { CapabilitiesPanel } from '@/components/CapabilitiesPanel'
import { ConnectorCatalog } from '@/components/ConnectorCatalog'
import { CalendarSubscriptionPanel, DevicesPanel } from '@/components/DevicesPanel'
import { HostHandoff } from '@/components/HostHandoff'
import { ConflictReview } from '@/components/ConflictReview'
import { MoodleRefresh } from '@/components/MoodleRefresh'
import { Loading, Failure, Empty, SyncContinuityNotice, Panel, Status, ListRows } from '@/components/State'
import { HostContext } from '@/hooks/host'
import { useAnchorScroll } from '@/hooks/useAnchorScroll'
import { usePreferences } from '@/preferences'
import { ReleaseSafetyPanel } from '@/components/ReleaseSafetyPanel'
import { DesktopReleaseUpdates } from '@/components/DesktopReleaseUpdates'
import { ReleaseHealthPanel } from '@/components/ReleaseHealthPanel'
import { DoctorPanel } from './system/DoctorPanel'
import { SemestersPanel } from './system/SemestersPanel'
import { SyncHistoryPanel } from './system/SyncHistoryPanel'

export function SystemPage() {
  const preferences = usePreferences()
  return preferences.advanced ? <AdvancedSystemPage /> : <SimpleSystemPage />
}

function SimpleSystemPage() {
  const host = useContext(HostContext)
  const { hash } = useLocation()
  const { t } = useT('system')
  const { data, error, loading, updatedAt } = useApi<SystemResponse>('/api/system')
  const { data: setupStatus } = useApi<{ moodle_available: boolean; portals?: unknown[] }>('/api/setup/status')
  useAnchorScroll(Boolean(data))
  return (
    <Shell title={t('title')} eyebrow={t('eyebrowSimple')} cachedAt={updatedAt}>
      {/* Same column width as the panels below, so the page reads as one stack. */}
      <div className="settings-stack system-top">
        <ConflictReview />
        <ReleaseSafetyPanel />
        <ReleaseHealthPanel connectorDetails={data?.health} />
      </div>
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <Failure message={t('reloadHint')} />
      ) : (
        data && (
          <div className="settings-stack">
            {error && <Failure message={t('reloadHint')} />}
            {/^#sync-[1-9]\d*$/.test(hash) && <SyncHistoryPanel runs={data.runs} targetOnly />}
            <CapabilitiesPanel simple />
            <Panel title={t('universityTitle')}>
              <ConnectorCatalog showConnectors={false} />
            </Panel>
            {(setupStatus?.portals?.length ?? 0) > 0 && (
              <Panel title={t('portalsTitle')}>
                <p>{t('portalsText')}</p>
                <Button asChild className="mt-4">
                  <Link to="/setup">{t('connectPortals')}</Link>
                </Button>
              </Panel>
            )}
            {setupStatus?.moodle_available !== false && (
              <Panel title={t('moodleTitle')}>
                <p>{data.moodle_configured ? t('moodleConnected') : t('moodleNotConnected')}</p>
                {!data.moodle_configured && (
                  <Button asChild className="mt-4">
                    <Link to="/setup">{t('connectMoodle')}</Link>
                  </Button>
                )}
                {data.moodle_configured && <MoodleRefresh />}
              </Panel>
            )}
            <Panel title={t('thisDeviceTitle')}>
              <p>{host?.mode === 'host' ? t('thisDeviceManages') : t('thisDeviceReadOnly')}</p>
              {data.backup?.status === 'warning' || data.backup?.status === 'error' ? (
                <p className="muted-text mt-3">{t('backupNeedsAttention')}</p>
              ) : null}
            </Panel>
            <DesktopReleaseUpdates />
            <p className="muted-text">
              {t('moreViewsHintPrefix')}{' '}
              <Link className="subtle-link" to="/settings">
                {t('settingsLink')}
              </Link>{' '}
              {t('moreViewsHintSuffix')}
            </p>
          </div>
        )
      )}
    </Shell>
  )
}

function AdvancedSystemPage() {
  const host = useContext(HostContext)
  const { t } = useT('system')
  const { data, error, loading, updatedAt, reload } = useApi<SystemResponse>('/api/system')
  useAnchorScroll(Boolean(data))
  return (
    <Shell title={t('title')} eyebrow={t('eyebrowAdvanced')} cachedAt={updatedAt}>
      <ConflictReview />
      <ReleaseSafetyPanel />
      <ReleaseHealthPanel connectorDetails={data?.health} />
      <DesktopReleaseUpdates />
      <CapabilitiesPanel />
      <div className="page-actions">
        <span className="muted-text">{t('integrationsHint')}</span>
        {data?.moodle_configured && <MoodleRefresh />}
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : (
        data && (
          <>
            <SyncContinuityNotice value={data.sync_continuity} configured={data.moodle_configured} />
            <div className="two-column">
              <Panel title={t('handoffTitle')}>
                {host ? (
                  <div>
                    <span className="panel-symbol">
                      <ShieldCheck size={20} />
                    </span>
                    <p>
                      <Status value={host.mode === 'host' ? 'ok' : 'warning'} /> ·{' '}
                      {host.mode === 'host'
                        ? t('thisDeviceWrites')
                        : host.mode === 'released'
                          ? t('handoffReleased')
                          : t('thisDeviceReadsOnly')}
                    </p>
                    <p className="muted-text mt-3">
                      {host.mode === 'released' ? t('lastHolder') : t('holder')}: {host.device_name ?? t('notSetUpYet')}
                    </p>
                    <p className="muted-text mt-1">
                      {t('generationLabel', { generation: host.generation ?? t('noneYet') })}
                    </p>
                    <p className="muted-text mt-1">{t('lastHeartbeat', { date: localDate(host.heartbeat_at) })}</p>
                    {host.released_at && (
                      <p className="muted-text mt-1">{t('releasedAt', { date: localDate(host.released_at) })}</p>
                    )}
                    <HostHandoff />
                  </div>
                ) : (
                  <Skeleton className="h-24 w-full" />
                )}
              </Panel>
              <Panel title={t('snapshotTitle')}>
                <span className="panel-symbol">
                  <HardDrive size={20} />
                </span>
                <p>
                  <Status value={data.snapshot.status} /> · {data.snapshot.message}
                </p>
                <p className="muted-text mt-3">{t('createdAt', { date: localDate(data.snapshot.created_at) })}</p>
                {data.snapshot.age_seconds !== null && (
                  <p className="muted-text mt-1">
                    {t('ageMinutes', {
                      minutes: Math.floor(data.snapshot.age_seconds / 60),
                      generation: data.snapshot.generation,
                    })}
                  </p>
                )}
              </Panel>
            </div>
            <DoctorPanel />
            <div className="two-column">
              <DevicesPanel />
              <CalendarSubscriptionPanel />
            </div>
            <div className="two-column">
              <Panel title={t('connectorsTitle')}>
                <ConnectorCatalog />
                {!data.moodle_configured && (
                  <div className="setup-note">
                    <CloudOff size={18} />
                    <div>
                      <strong>
                        {data.moodle_enabled ? t('moodleNotConnectedYetTitle') : t('moodleDisabledTitle')}
                      </strong>
                      <p>{data.moodle_enabled ? t('moodleEnabledHint') : t('moodleDisabledHint')}</p>
                    </div>
                  </div>
                )}
                {data.health.length ? (
                  <ListRows>
                    {data.health.map((item) => (
                      <div className="health-item" key={item.id}>
                        <div>
                          <strong>{item.connector}</strong>
                          <span className="row-subtitle">
                            {t('lastSuccessLabel', { date: localDate(item.last_success_at) })}
                          </span>
                        </div>
                        <Status value={item.connector === 'moodle' && !data.moodle_enabled ? 'paused' : item.status} />
                        <p>{item.message}</p>
                      </div>
                    ))}
                  </ListRows>
                ) : (
                  data.moodle_configured && (
                    <Empty icon={ShieldCheck} title={t('noSyncYetTitle')} text={t('noSyncYetText')} />
                  )
                )}
              </Panel>
              <Panel title={t('backupTitle')}>
                {data.backup ? (
                  <div>
                    <span className="panel-symbol">
                      <HardDrive size={20} />
                    </span>
                    <p>
                      <Status value={data.backup.status} /> · {localDate(data.backup.finished_at)}
                    </p>
                    <p className="muted-text mt-3">{data.backup.message}</p>
                  </div>
                ) : (
                  <Empty icon={HardDrive} title={t('noBackupTitle')} text={t('noBackupText')} />
                )}
              </Panel>
            </div>
            <SemestersPanel semesters={data.semesters} onCreated={reload} />
            <SyncHistoryPanel runs={data.runs} />
          </>
        )
      )}
    </Shell>
  )
}
