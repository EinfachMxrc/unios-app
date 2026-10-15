// SPDX-License-Identifier: AGPL-3.0-or-later

import { useContext, useRef, useState } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { request } from '@/api'
import { useApiMutation } from '@/hooks/useApiMutation'
import { HostContext, useWritableHost } from '@/hooks/host'
import { queryClient } from '@/offlineCache'
import type { HostStatus } from '@/types'

export function HostHandoff() {
  const { t } = useT('hostHandoff')
  const host = useContext(HostContext)
  const canWrite = useWritableHost()
  const dialog = useRef<HTMLDialogElement>(null)
  const [completed, setCompleted] = useState(false)

  const release = useApiMutation(() => request<HostStatus>('/api/host/release', { method: 'POST' }), {
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['api', '/api/host'] }),
        queryClient.invalidateQueries({ queryKey: ['api', '/api/system'] }),
      ])
      setCompleted(true)
      dialog.current?.close()
    },
  })
  const busy = release.pending

  if (host?.topology === 'server') return null

  return (
    <>
      <Button
        variant="outline"
        className="mt-4"
        disabled={!canWrite || busy}
        onClick={() => {
          release.reset()
          dialog.current?.showModal()
        }}
      >
        <ArrowRightLeft size={15} />
        {t('prepareHandoffButton')}
      </Button>
      {completed && (
        <Alert role="status" className="mt-4">
          <AlertTitle>{t('releasedTitle')}</AlertTitle>
          <AlertDescription>
            {t('releasedTextPrefix')}
            {/* eslint-disable-next-line i18next/no-literal-string -- CLI command name, not natural-language UI text */}
            <code className="whitespace-nowrap"> unios host acquire</code>
            {t('releasedTextSuffix')}
          </AlertDescription>
        </Alert>
      )}
      <dialog
        ref={dialog}
        className="handoff-dialog"
        aria-labelledby="handoff-title"
        onCancel={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <h2 id="handoff-title">{t('dialogTitle')}</h2>
        <p>{t('dialogIntro')}</p>
        <p className="muted-text">
          {t('dialogHintPrefix')}{' '}
          {/* eslint-disable-next-line i18next/no-literal-string -- CLI command name, not natural-language UI text */}
          <code className="whitespace-nowrap">unios host acquire</code>
          {t('dialogHintSuffix')}
        </p>
        {release.error && (
          <Alert role="alert" className="mt-4">
            <AlertTitle>{t('errorTitle')}</AlertTitle>
            <AlertDescription>{release.error}</AlertDescription>
          </Alert>
        )}
        <div className="handoff-actions">
          <Button variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>
            {t('cancelButton')}
          </Button>
          <Button variant="destructive" disabled={busy || host?.mode !== 'host'} onClick={() => release.mutate()}>
            {busy ? t('checkingButton') : t('releaseButton')}
          </Button>
        </div>
      </dialog>
    </>
  )
}
