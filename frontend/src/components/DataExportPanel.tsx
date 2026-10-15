// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { Download } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { requestResponse } from '@/api'
import { Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'

const EXPORT_FILENAME = 'unios-export.zip'

async function downloadExport(includeFiles: boolean): Promise<void> {
  const response = await requestResponse(`/api/export?include_files=${includeFiles}`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = EXPORT_FILENAME
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** "Daten exportieren": a full personal-data ZIP, optionally including downloaded course files. */
export function DataExportPanel() {
  const { t } = useT('dataExport')
  const canWrite = useWritableHost()
  const [includeFiles, setIncludeFiles] = useState(false)
  const [feedback, setFeedback] = useState('')
  const runExport = useApiMutation(() => downloadExport(includeFiles), {
    onSuccess: () => setFeedback(t('exportedMessage')),
  })

  return (
    <Panel title={t('panelTitle')} action={<Download size={20} />}>
      <p className="muted-text mb-4">
        {t('intro')}
      </p>
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeFiles}
          onChange={(event) => setIncludeFiles(event.target.checked)}
        />
        {t('includeFilesLabel')}
      </label>
      <Button
        onClick={() => {
          setFeedback('')
          runExport.mutate()
        }}
        disabled={!canWrite || runExport.pending}
      >
        <Download size={15} />
        {runExport.pending ? t('exportingButton') : t('exportButton')}
      </Button>
      {runExport.error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {runExport.error}
        </p>
      )}
      {feedback && !runExport.error && (
        <p role="status" className="mt-3 text-sm">
          {feedback}
        </p>
      )}
    </Panel>
  )
}
