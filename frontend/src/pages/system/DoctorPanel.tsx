// SPDX-License-Identifier: AGPL-3.0-or-later

import { ShieldCheck } from 'lucide-react'
import { request } from '@/api'
import { useT } from '@/i18n/useT'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ListRows, Panel, Status } from '@/components/State'
import { useApiMutation } from '@/hooks/useApiMutation'
import type { DoctorResponse } from '@/types'

/** Checks the local prerequisites of this device on request. */
export function DoctorPanel() {
  const { t } = useT('system')
  const runDoctor = useApiMutation(() => request<DoctorResponse>('/api/doctor'))
  return (
    <Panel
      title={t('deviceCheckTitle')}
      action={
        <Button variant="outline" onClick={() => runDoctor.mutate()} disabled={runDoctor.pending}>
          <ShieldCheck size={15} />
          {runDoctor.pending ? t('checking') : t('checkDevice')}
        </Button>
      }
    >
      {runDoctor.error && (
        <Alert role="alert" className="mb-4">
          <AlertTitle>{t('checkFailedTitle')}</AlertTitle>
          <AlertDescription>{runDoctor.error}</AlertDescription>
        </Alert>
      )}
      {runDoctor.data ? (
        <>
          <p className="muted-text mb-4">
            {t('localMoodleSync')} {runDoctor.data.ready_for_sync ? t('prereqsPresent') : t('prereqsMissing')} ·
            {t('multiDeviceTakeover')} {runDoctor.data.ready_for_takeover ? t('ready') : t('notSetUpYetShort')}
          </p>
          <div className="doctor-checks" aria-label={t('localPrereqsLabel')}>
            {(
              [
                ['data_dir_exists', t('dataDirExists')],
                ['data_dir_writable', t('dataDirWritable')],
                ['local_dir_writable', t('localDirWritable')],
                ['moodle_configured', t('moodleConfigured')],
                ['database_reachable', t('databaseReachable')],
                ['host_lease_matches_device', t('hostLeaseMatchesDevice')],
              ] as const
            ).map(([key, label]) => (
              <div className="doctor-check" key={key}>
                <span>{label}</span>
                <Status value={runDoctor.data!.checks[key] ? 'ok' : 'warning'} />
              </div>
            ))}
          </div>
          <ListRows>
            {(
              [
                ['moodle_token', t('moodleToken')],
                ['credential_file', t('credentialFile')],
                ['host', t('host')],
                ['tailscale', t('tailscale')],
                ['syncthing', t('syncthing')],
                ['syncthing_sync', t('syncthingSync')],
                ['syncthing_conflicts', t('syncthingConflicts')],
                ['disk_encryption', t('diskEncryption')],
                ['anki_connect', t('ankiConnect')],
                ['takeover', t('takeover')],
              ] as const
            ).map(([key, label]) => {
              const item = runDoctor.data!.diagnostics[key]
              return (
                <div className="health-item" key={key}>
                  <strong>{label}</strong>
                  <Status value={item.status} />
                  <p>{item.message}</p>
                </div>
              )
            })}
          </ListRows>
        </>
      ) : (
        !runDoctor.error && <p className="muted-text">{t('checkLocalPrereqs')}</p>
      )}
    </Panel>
  )
}
