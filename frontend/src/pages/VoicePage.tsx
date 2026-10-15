// SPDX-License-Identifier: AGPL-3.0-or-later

import { useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mic, Square, Upload } from 'lucide-react'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { activeIntlLocale, localDate, request, useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Shell } from '@/components/Shell'
import { useApiMutation, extractApiErrorMessage } from '@/hooks/useApiMutation'
import { HostContext, useWritableHost } from '@/hooks/host'
import { queryClient } from '@/offlineCache'
import { useRevisionDraft, type RevisionSnapshot } from '@/hooks/useRevisionDraft'
import type { CoursesResponse } from '@/types'
import './VoicePage.css'

function audioSuffix(blob: Blob): string {
  return blob.type.includes('mp4') || blob.type.includes('m4a') ? 'm4a' : blob.type.includes('ogg') ? 'ogg'
    : blob.type.includes('wav') ? 'wav' : blob.type.includes('mpeg') ? 'mp3' : 'webm'
}

type Topic = { topic_id: number; course_id: number; topic: string }
type Memo = { id: string; title: string; transcript: string; course_id: number | null;
  course_name: string | null; topic_id: number | null; topic_name: string | null;
  jot_id: string; audio_url: string; mime_type: string; size: number; revision: number; created_at: string;
  task_id: number | null }
type MemoForm = { title: string; transcript: string; courseId: string; topicId: string }
function memoForm(item: Memo): MemoForm {
  return { title: item.title, transcript: item.transcript,
    courseId: item.course_id?.toString() ?? '', topicId: item.topic_id?.toString() ?? '' }
}
type SpeechEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; processLocally?: boolean;
  onresult: ((event: SpeechEvent) => void) | null; onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null; start: () => void; stop: () => void }
type RecognitionConstructor = { new (): Recognition;
  available?: (options: { langs: string[]; processLocally: boolean; quality?: string }) => Promise<string>;
  install?: (options: { langs: string[]; processLocally: boolean; quality?: string }) => Promise<boolean> }

function speechApi(): RecognitionConstructor | null {
  const browser = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null
}

function topicSuggestion(transcript: string, courseId: string, topics: Topic[]): Topic | null {
  if (!transcript.trim()) return null
  const matches = topics.filter((item) => (!courseId || String(item.course_id) === courseId)
    && transcript.toLocaleLowerCase('de-DE').includes(item.topic.toLocaleLowerCase('de-DE')))
  return matches.length === 1 ? matches[0] : null
}

function defaultTitle(t: TypedT<'voice'>) {
  return t('defaultTitle', { date: new Intl.DateTimeFormat(activeIntlLocale(), { dateStyle: 'short' }).format(new Date()) })
}

function SavedMemo({ item, courses, topics, reload }: { item: Memo; courses: CoursesResponse['courses'];
  topics: Topic[]; reload: () => void }) {
  const { t } = useT('voice')
  const canWrite = useWritableHost()
  const [editing, setEditing] = useState(false)
  const draft = useRevisionDraft(item.id, { value: memoForm(item), revision: item.revision })
  const { title, transcript, courseId, topicId } = draft.value ?? memoForm(item)
  function change(value: Partial<MemoForm>) { draft.change({ title, transcript, courseId, topicId, ...value }) }
  const save = useApiMutation<Memo, RevisionSnapshot<MemoForm>>(
    async snapshot => {
      const form = snapshot.value
      try { return await request<Memo>(`/api/voice/${snapshot.key}`, { method: 'PATCH', body: JSON.stringify({
        expected_revision: snapshot.revision, title: form.title.trim(), transcript: form.transcript.trim(),
        course_id: form.courseId ? Number(form.courseId) : null, topic_id: form.topicId ? Number(form.topicId) : null,
      }) }) } catch (cause) { draft.failed(snapshot); reload(); throw cause }
    },
    { onSuccess: (updated, snapshot) => {
      queryClient.setQueryData<Memo[]>(['api', '/api/voice'], (current) =>
        current?.map((entry) => entry.id === updated.id ? updated : entry))
      if (draft.acknowledge(snapshot, { value: memoForm(updated), revision: updated.revision })) setEditing(false)
      reload()
    } },
  )
  const busy = draft.pending
  return <article className="voice-memo"><div className="voice-memo-head"><div><small>{localDate(item.created_at)}</small>
    <h3>{item.title}</h3><span>{item.course_name ?? t('unassignedCourseText')}
      {item.topic_name ? ` · ${item.topic_name}` : ''}</span></div>
    <Button variant="ghost" size="sm" disabled={!canWrite} onClick={() => setEditing(!editing)}>
      {editing ? t('closeButton') : t('editButton')}</Button></div>
    <audio controls preload="none" src={item.audio_url} aria-label={t('audioAriaLabel', { title: item.title })} />
    {editing ? <div className="voice-edit">
      {draft.changed && <div><p role="status">{t('draftChanged')}</p><Button size="sm" variant="outline"
        disabled={busy} onClick={() => { draft.discard(); save.reset() }}>{t('discardDraftReload')}</Button></div>}
      <label>{t('titleLabel')}<input value={title} maxLength={200} onChange={(event) => change({ title: event.target.value })} /></label>
      <label>{t('transcriptLabel')}<textarea value={transcript} rows={4} maxLength={10_000} onChange={(event) => change({ transcript: event.target.value })} /></label>
      <div className="voice-assign"><label>{t('courseLabel')}<select className="native-select" value={courseId}
        onChange={(event) => change({ courseId: event.target.value, topicId: '' })}><option value="">{t('notAssignedOption')}</option>
        {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
        <label>{t('topicLabel')}<select className="native-select" value={topicId}
          onChange={(event) => change({ topicId: event.target.value })}><option value="">{t('noTopicOption')}</option>
          {topics.filter((topic) => String(topic.course_id) === courseId).map((topic) =>
            <option key={topic.topic_id} value={topic.topic_id}>{topic.topic}</option>)}</select></label></div>
      <Button size="sm" disabled={!canWrite || busy || draft.changed || !draft.dirty || !title.trim()}
        onClick={() => { const snapshot = draft.begin(); if (snapshot) save.mutate(snapshot) }}>{t('saveChangesButton')}</Button>
      {save.error && <p role="alert" className="text-destructive">{save.error}</p>}</div>
      : <><p className="voice-transcript">{item.transcript || t('noTranscriptText')}</p>
        {item.task_id && item.course_id && <Link to={`/courses/${item.course_id}#assignment-${item.task_id}`}
          className="subtle-link">{t('openDetectedTaskLink')}</Link>}
        <Link to={`/jots#jot-${item.jot_id}`} className="subtle-link">{t('openCaptureLink')}</Link></>}
  </article>
}

export function VoicePage() {
  const { t } = useT('voice')
  const server = useContext(HostContext)?.topology === 'server'
  const canWrite = useWritableHost()
  const { data: memos, reload, updatedAt } = useApi<Memo[]>('/api/voice')
  const { data: courses } = useApi<CoursesResponse>('/api/courses?all_semesters=true')
  const { data: topics } = useApi<Topic[]>('/api/learning/topics')
  const { data: localSpeech } = useApi<{ available: boolean }>('/api/voice/transcription/status')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const recordingTimer = useRef<number | null>(null)
  const chunks = useRef<Blob[]>([])
  const seenSpeech = useRef(0)
  const [recording, setRecording] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [title, setTitle] = useState(() => defaultTitle(t))
  const [transcript, setTranscript] = useState('')
  const [courseId, setCourseId] = useState('')
  const [topicId, setTopicId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [allowBrowserService, setAllowBrowserService] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => {
    if (recordingTimer.current) window.clearTimeout(recordingTimer.current)
    recognition.current?.stop(); recorder.current?.stop(); stream.current?.getTracks().forEach((track) => track.stop())
  }, [])
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])
  const suggestion = topicId ? null : topicSuggestion(transcript, courseId, topics ?? [])

  function setAudio(blob: Blob) {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(blob); setAudioUrl(URL.createObjectURL(blob))
  }
  async function transcribeAudio(blob: Blob) {
    setTranscribing(true); setError(''); setMessage(t(server ? 'serverTranscribing' : 'localTranscribing'))
    try {
      const form = new FormData()
      form.append('file', blob, `memo.${audioSuffix(blob)}`)
      const result = await request<{ transcript: string }>('/api/voice/transcribe', { method: 'POST', body: form })
      if (result.transcript) setTranscript((current) => current.trim() || result.transcript)
      setMessage(result.transcript ? t('localTranscriptReady') : t('noSpeechDetected'))
    } catch (cause) { setError(extractApiErrorMessage(cause)); setMessage('') }
    finally { setTranscribing(false) }
  }
  async function startRecording() {
    setError(''); setMessage('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t('micNotSupportedError'))
      return
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.current = media
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type))
      const next = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      chunks.current = []
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data) }
      next.onstop = () => {
        const blob = new Blob(chunks.current, { type: next.mimeType || mimeType || 'audio/webm' })
        if (blob.size) {
          setAudio(blob)
          if (localSpeech?.available) void transcribeAudio(blob)
        }
        else setError(t('emptyRecordingError'))
        media.getTracks().forEach((track) => track.stop())
        stream.current = null; recorder.current = null; setRecording(false)
      }
      recorder.current = next; next.start(); setRecording(true)
      if (!localSpeech?.available && !allowBrowserService && speechApi()?.available) void startRecognition(true)
      recordingTimer.current = window.setTimeout(() => {
        if (recorder.current?.state === 'recording') {
          stopRecording(); setMessage(t('autoStoppedMessage'))
        }
      }, 300_000)
    } catch (cause) {
      stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null
      setError(t('micOpenFailedError', { error: extractApiErrorMessage(cause) }))
    }
  }
  function stopRecording() {
    if (recordingTimer.current) window.clearTimeout(recordingTimer.current)
    recordingTimer.current = null
    recognition.current?.stop(); recognition.current = null; setRecognizing(false)
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }
  async function startRecognition(automatic = false) {
    const Constructor = speechApi()
    if (!Constructor) { setError(t('noSpeechRecognitionError')); return }
    setError(''); setMessage('')
    try {
      if (!allowBrowserService) {
        if (!Constructor.available) {
          if (!automatic) setError(t('localRecognitionUnavailableError'))
          return
        }
        let availability = await Constructor.available({ langs: ['de-DE'], processLocally: true, quality: 'dictation' })
        if (availability !== 'available') {
          if ((availability === 'downloadable' || availability === 'downloading') && Constructor.install) {
            setMessage(t('languagePackInstallingMessage'))
            const installed = await Constructor.install({ langs: ['de-DE'], processLocally: true, quality: 'dictation' })
            if (installed) { availability = 'available'; setMessage(t('languagePackReadyMessage')) }
            else setMessage(t('languagePackFailedMessage'))
          } else setError(t('localRecognitionUnavailableDeviceError'))
          if (availability !== 'available') return
        }
      }
      if (automatic && recorder.current?.state !== 'recording') return
      const next = new Constructor()
      next.lang = 'de-DE'; next.continuous = true; next.interimResults = false
      if (!allowBrowserService) next.processLocally = true
      seenSpeech.current = 0
      next.onresult = (event) => {
        const additions: string[] = []
        for (let index = Math.max(seenSpeech.current, event.resultIndex); index < event.results.length; index++) {
          if (event.results[index].isFinal) { additions.push(event.results[index][0].transcript.trim()); seenSpeech.current = index + 1 }
        }
        if (additions.length) setTranscript((current) => `${current.trim()} ${additions.join(' ')}`.trim())
      }
      next.onerror = (event) => { setError(t('transcriptInterruptedError', { error: event.error })); setRecognizing(false) }
      next.onend = () => setRecognizing(false)
      recognition.current = next; next.start(); setRecognizing(true)
    } catch (cause) { setError(t('recognitionStartFailedError', { error: extractApiErrorMessage(cause) })); setRecognizing(false) }
  }
  function chooseFile(file: File | undefined) {
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { setError(t('fileTooLargeError')); return }
    setError(''); setAudio(file)
    if (localSpeech?.available) void transcribeAudio(file)
  }
  async function save() {
    if (!audioBlob) return
    setBusy(true); setError(''); setMessage('')
    try {
      const form = new FormData()
      const suffix = audioSuffix(audioBlob)
      form.append('file', audioBlob, `sprachnotiz.${suffix}`)
      form.append('title', title.trim()); form.append('transcript', transcript.trim())
      const chosenTopic = topicId || (suggestion ? String(suggestion.topic_id) : '')
      const chosenCourse = courseId || (suggestion ? String(suggestion.course_id) : '')
      if (chosenCourse) form.append('course_id', chosenCourse)
      if (chosenTopic) form.append('topic_id', chosenTopic)
      const saved = await request<Memo>('/api/voice', { method: 'POST', body: form })
      setMessage(saved.task_id ? t('savedMemoWithTaskMessage') : t('savedMemoMessage'))
      setAudioBlob(null); setAudioUrl(''); setTranscript(''); setTopicId('')
      setTitle(defaultTitle(t))
      if (fileInput.current) fileInput.current.value = ''
      reload()
    } catch (cause) { setError(extractApiErrorMessage(cause)) }
    finally { setBusy(false) }
  }

  return <Shell title={t('pageTitle')} cachedAt={updatedAt}>
    <div className="voice-intro"><span>{t('introKicker')}</span><h2>{t('introTitle')}</h2>
      <p>{t('introText')}</p></div>
    <div className="voice-layout"><section className="voice-capture"><div className="voice-capture-head"><Mic size={19} />
      <div><h3>{t('newMemoTitle')}</h3><span>{recording ? t('recordingStatus') : t('readyStatus')}</span></div></div>
      <div className="voice-record-actions">{recording ? <Button onClick={stopRecording}><Square size={15} /> {t('stopRecordingButton')}</Button>
        : <Button disabled={!canWrite || busy || transcribing} onClick={() => void startRecording()}><Mic size={15} /> {t('startRecordingButton')}</Button>}
        <label className="voice-file-pick"><Upload size={15} /> {t('chooseAudioFileLabel')}<input ref={fileInput} type="file" accept="audio/*"
          disabled={recording || busy || transcribing || !canWrite} onChange={(event) => chooseFile(event.target.files?.[0])} /></label></div>
      {localSpeech?.available && <p className="muted-text">{t(server ? 'serverTranscriptAfterStop' : 'localTranscriptAfterStop')}</p>}
      {recording && !localSpeech?.available && <div className="voice-recognition"><Button size="sm" variant="outline" disabled={recognizing}
        onClick={() => void startRecognition()}>{recognizing ? t('transcriptRunningButton') : t('startTranscriptButton')}</Button>
        <label><input type="checkbox" checked={allowBrowserService} onChange={(event) => setAllowBrowserService(event.target.checked)} />
          {t('allowBrowserServiceLabel')}</label></div>}
      {audioUrl && <audio controls src={audioUrl} aria-label={t('recordingBeforeSaveAria')} />}
      {audioBlob && !transcript.trim() && localSpeech?.available && <Button variant="outline" disabled={transcribing || busy || !canWrite}
        onClick={() => void transcribeAudio(audioBlob)}>{transcribing ? t(server ? 'serverTranscribing' : 'localTranscribing') : t(server ? 'serverTranscribe' : 'transcribeLocally')}</Button>}
      <div className="voice-fields"><label>{t('titleLabel')}<input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>{t('transcriptLabel')}<textarea value={transcript} rows={5} maxLength={10_000}
          onChange={(event) => setTranscript(event.target.value)} placeholder={t('placeholderTranscript')} /></label>
        <div className="voice-assign"><label>{t('courseLabel')}<select className="native-select" value={courseId}
          onChange={(event) => { setCourseId(event.target.value); setTopicId('') }}><option value="">{t('notAssignedOption')}</option>
          {courses?.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
          <label>{t('topicLabel')}<select className="native-select" value={topicId}
            onChange={(event) => setTopicId(event.target.value)}><option value="">{t('automaticNoneOption')}</option>
            {topics?.filter((topic) => !courseId || String(topic.course_id) === courseId).map((topic) =>
              <option key={topic.topic_id} value={topic.topic_id}>{topic.topic}</option>)}</select></label></div>
        {suggestion && <p className="voice-suggestion">{t('topicRecognizedText', { topic: suggestion.topic })}</p>}
        <Button disabled={!canWrite || !audioBlob || busy || transcribing || !title.trim()} onClick={() => void save()}>
          {busy ? t('savingButton') : t('saveAudioButton')}</Button></div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {message && <p role="status" className="voice-message">{message}</p>}
    </section><aside className="voice-info"><h3>{t('howItWorksTitle')}</h3>
      <p>{t('howItWorksText1')}</p>
      <p>{t('howItWorksText2')}</p>
      <Link to="/jots" className="subtle-link">{t('openCapturesLink')}</Link></aside></div>
    <section className="voice-list"><h3>{t('savedMemosTitle')}</h3>{memos?.map((item) => <SavedMemo key={item.id} item={item}
      courses={courses?.courses ?? []} topics={topics ?? []} reload={reload} />)}
      {!memos?.length && <p>{t('noMemosText')}</p>}</section>
  </Shell>
}
