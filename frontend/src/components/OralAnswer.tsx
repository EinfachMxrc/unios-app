// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { request } from '@/api'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

export function OralAnswer({ onTranscript, disabled }: { onTranscript: (value: string) => void; disabled: boolean }) {
  const { t } = useT('assessment')
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [language, setLanguage] = useState('de')
  const [message, setMessage] = useState('')
  const [audio, setAudio] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<number | null>(null)
  const url = useRef('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (timer.current) clearTimeout(timer.current); recorder.current?.stop(); stream.current?.getTracks().forEach((track) => track.stop()); if (url.current) URL.revokeObjectURL(url.current) } }, [])
  async function transcribe(blob: Blob) {
    if (!blob.size || blob.size > 15 * 1024 * 1024) { setMessage(t('audioSize')); return }
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = URL.createObjectURL(blob); setAudio(url.current)
    setBusy(true); setMessage('')
    try {
      const body = new FormData(); body.append('file', blob, 'answer.webm'); body.append('language', language)
      const result = await request<{ transcript: string }>('/api/voice/transcribe', { method: 'POST', body })
      if (alive.current) onTranscript(result.transcript)
    } catch (cause) { if (alive.current) setMessage(extractApiErrorMessage(cause)) } finally { if (alive.current) setBusy(false) }
  }
  async function start() {
    setMessage('')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!alive.current) { media.getTracks().forEach((track) => track.stop()); return }
      stream.current = media
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((value) => MediaRecorder.isTypeSupported(value))
      const next = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      let bytes = 0
      next.ondataavailable = (event) => { chunks.push(event.data); bytes += event.data.size; if (bytes > 15 * 1024 * 1024 && next.state === 'recording') next.stop() }
      next.onstop = () => {
        if (timer.current) clearTimeout(timer.current)
        media.getTracks().forEach((track) => track.stop()); stream.current = null
        if (!alive.current) return
        setRecording(false); void transcribe(new Blob(chunks, { type: next.mimeType }))
      }
      recorder.current = next; next.start(1000); setRecording(true)
      timer.current = window.setTimeout(() => { if (next.state === 'recording') next.stop() }, 300000)
    } catch (cause) { stream.current?.getTracks().forEach((track) => track.stop()); setMessage(extractApiErrorMessage(cause)) }
  }
  return <div className="assessment-oral">
    <p>{t('oralExplanation')}</p>
    <div className="assessment-oral-controls"><label>{t('spokenLanguage')}<select className="native-select" value={language} disabled={recording || busy} onChange={(event) => setLanguage(event.target.value)}><option value="de">{t('german')}</option><option value="en">{t('english')}</option></select></label>
      {recording ? <Button type="button" onClick={() => recorder.current?.stop()}><Square size={16} />{t('stopRecording')}</Button> : <Button type="button" disabled={disabled || busy} onClick={() => void start()}><Mic size={16} />{t('startRecording')}</Button>}
      <label className="assessment-audio-upload">{t('uploadAudio')}<input type="file" accept="audio/*" disabled={disabled || busy || recording} onChange={(event) => { if (event.target.files?.[0]) void transcribe(event.target.files[0]) }} /></label>
    </div>{busy && <p role="status">{t('transcribing')}</p>}{audio && <audio controls preload="metadata" src={audio} />}{message && <p role="alert">{message}</p>}
  </div>
}
