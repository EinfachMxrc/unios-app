// SPDX-License-Identifier: AGPL-3.0-or-later

import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react'

type Tone = 'pending' | 'success' | 'error'

export function ActionFeedback({ tone, message }: { tone: Tone; message: string }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? CircleAlert : LoaderCircle
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`action-feedback action-feedback-${tone}`}>
      <Icon size={16} className={tone === 'pending' ? 'action-feedback-spinner' : undefined} aria-hidden="true" />
      <span>{message}</span>
    </p>
  )
}
