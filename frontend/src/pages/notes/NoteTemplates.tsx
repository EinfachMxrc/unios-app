// SPDX-License-Identifier: AGPL-3.0-or-later
import { BookOpen, FileCheck2, MessageSquareText } from 'lucide-react'
import { markdownToBody } from '@/editor/markdownImport'
import { useT } from '@/i18n/useT'
import './NotePages.css'

export function NoteTemplates({
  title,
  body,
  disabled,
  onChoose,
}: {
  title: string
  body: string
  disabled: boolean
  onChoose: (title: string, body: string) => void
}) {
  const { t } = useT('notes')
  if (body.trim()) return null
  const templates = [
    { id: 'lecture', label: t('pages.lectureTemplate'), body: markdownToBody(t('pages.lectureBody')), icon: BookOpen },
    { id: 'exam', label: t('pages.examTemplate'), body: markdownToBody(t('pages.examBody')), icon: FileCheck2 },
    {
      id: 'reflection',
      label: t('pages.reflectionTemplate'),
      body: markdownToBody(t('pages.reflectionBody')),
      icon: MessageSquareText,
    },
  ]
  return (
    <section className="note-templates" aria-label={t('pages.templates')}>
      <p>{t('pages.templateHint')}</p>
      <div>
        {templates.map(({ id, label, body: initialBody, icon: Icon }) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(title.trim() ? title : label, initialBody)}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}
