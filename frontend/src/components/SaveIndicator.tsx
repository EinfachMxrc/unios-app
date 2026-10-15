// SPDX-License-Identifier: AGPL-3.0-or-later
import { CheckCircle2, CloudOff, CircleAlert, LoaderCircle } from 'lucide-react'
/** Caller supplies the actual storage state; local persistence is never a server acknowledgement. */
export function SaveIndicator({ phase, message }: { phase: 'saved' | 'local' | 'saving' | 'conflict' | 'error'; message: string }) {
  const Icon = phase === 'saved' ? CheckCircle2 : phase === 'saving' ? LoaderCircle : phase === 'local' ? CloudOff : CircleAlert
  return <p role={phase === 'error' ? 'alert' : 'status'} className={`save-indicator muted-text note-save-status save-${phase}`}>
    <Icon size={15} aria-hidden="true" className={phase === 'saving' ? 'action-feedback-spinner' : undefined} /><span>{message}</span>
  </p>
}
