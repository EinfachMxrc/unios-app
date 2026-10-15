// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { request } from '@/api'
import { useBusyAction } from '@/hooks/useBusyAction'
import { useT, type TypedT } from '@/i18n/useT'
import { queryClient } from '@/offlineCache'
import { invalidateStudyReads } from '@/studyQueries'
import type { StudyStatus } from '@/studyTypes'

const BASE = '/api/anki/study'
type FailureKey = Parameters<TypedT<'study'>>[0]

/**
 * Managing the card collection: import preview, switching between the
 * integrated and an external Anki, starting empty, export and taking over
 * approved proposals. One action runs at a time; `track` gives other card
 * actions (like saving a card) the same busy and error handling.
 */
export function useStudyCollection({ onCardsChanged }: { onCardsChanged: () => void }) {
  const { t } = useT('study')
  const { busy, error: errorMessage, setError: setErrorMessage, run } = useBusyAction()
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ cards: number; notes: number; reviews: number } | null>(null)
  const [lastPackage, setLastPackage] = useState('')

  const track = (action: () => Promise<void>, failure: FailureKey) => run(action, t(failure))

  function packageBody() {
    const body = new FormData()
    body.append('package', file as File)
    return body
  }

  const previewFile = () => file ? track(async () => {
    setPreview(await request(`${BASE}/preview`, { method: 'POST', body: packageBody() }))
  }, 'previewFailed') : Promise.resolve(false)

  const activate = () => file && preview ? track(async () => {
    const result = await request<{ after: StudyStatus }>(`${BASE}/switch/integrated`, { method: 'POST', body: packageBody() })
    setMessage(t('activateSuccess', { cards: result.after.cards, reviews: result.after.reviews }))
    setFile(null)
    void invalidateStudyReads(queryClient)
  }, 'activateFailed') : Promise.resolve(false)

  const switchToExternal = () => track(async () => {
    const result = await request<{ package: string }>(`${BASE}/switch/external`, { method: 'POST' })
    setLastPackage(result.package)
    setMessage(t('switchToExternalSuccess'))
    void invalidateStudyReads(queryClient)
  }, 'switchToExternalFailed')

  const startEmpty = () => track(async () => {
    await request(`${BASE}/switch/integrated-empty`, { method: 'POST' })
    setMessage(t('startEmptySuccess'))
    void invalidateStudyReads(queryClient)
  }, 'startEmptyFailed')

  const exportCards = () => track(async () => {
    const result = await request<{ package: string }>(`${BASE}/export`, { method: 'POST' })
    setLastPackage(result.package)
  }, 'exportFailed')

  const transferApproved = () => track(async () => {
    const result = await request<{ imported: number }>(`${BASE}/approved`, { method: 'POST' })
    setMessage(t('transferApprovedSuccess', { count: result.imported }))
    void invalidateStudyReads(queryClient)
    onCardsChanged()
  }, 'transferApprovedFailed')

  return {
    busy, message, errorMessage, setErrorMessage, file, setFile, preview, setPreview, lastPackage,
    track, previewFile, activate, switchToExternal, startEmpty, exportCards, transferApproved,
  }
}
