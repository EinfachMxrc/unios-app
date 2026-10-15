// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { CalendarDays, FileText, Layers3, MessageCircleQuestion } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { activeIntlLocale, localDate, useApi } from '@/api'
import { Empty, Failure, ListRows, Loading, Panel } from '@/components/State'
import { Shell } from '@/components/Shell'

type CourseCount = { course_id: number; course_name: string; count: number }
type Deadline = { id: number; title: string; course_name: string | null; due_at: string; url: string | null }
type AnkiStand = { available: boolean; card_count: number; review_count: number; proposed_count: number }
type Digest = {
  enabled: boolean
  preview: boolean
  generated_at: string | null
  summary: {
    week_start: string
    week_end: string
    next_week_end: string
    materials: CourseCount[]
    deadlines: Deadline[]
    anki: AnkiStand
    open_assignments: CourseCount[]
  }
}

function shortDate(day: string) {
  return new Intl.DateTimeFormat(activeIntlLocale(), { day: '2-digit', month: '2-digit' }).format(
    new Date(`${day}T12:00:00`),
  )
}

function previousDate(day: string) {
  const value = new Date(`${day}T12:00:00`)
  value.setDate(value.getDate() - 1)
  return new Intl.DateTimeFormat(activeIntlLocale(), { day: '2-digit', month: '2-digit' }).format(value)
}

export function DigestPage() {
  const { t } = useT('digest')
  const { data, error, loading, updatedAt } = useApi<Digest>('/api/digest')
  const summary = data?.summary
  return (
    <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')} cachedAt={updatedAt}>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : (
        summary && (
          <>
            <p className="muted-text mb-4">
              {data.preview ? t('previewText') : t('generatedAtText', { date: localDate(data.generated_at) })}
              {!data.enabled && t('disabledSuffix')}
            </p>
            <div className="two-column">
              <Panel
                title={t('newMaterialsPanelTitle', {
                  range: `${shortDate(summary.week_start)}–${previousDate(summary.week_end)}`,
                })}
              >
                {summary.materials.length ? (
                  <ListRows>
                    {summary.materials.map((item) => (
                      <div className="data-row" key={item.course_id}>
                        <FileText size={17} className="row-icon" />
                        <div>
                          <Link to={`/courses/${item.course_id}`}>{item.course_name}</Link>
                          <span className="row-subtitle">{t('newVersionsLabel', { count: item.count })}</span>
                        </div>
                      </div>
                    ))}
                  </ListRows>
                ) : (
                  <Empty icon={FileText} title={t('emptyMaterialsTitle')} text={t('emptyMaterialsText')} />
                )}
              </Panel>
              <Panel title={t('nextDeadlinesPanelTitle', { date: previousDate(summary.next_week_end) })}>
                {summary.deadlines.length ? (
                  <ListRows>
                    {summary.deadlines.map((item) => (
                      <div className="data-row" key={item.id}>
                        <CalendarDays size={17} className="row-icon" />
                        <div>
                          <strong>{item.title}</strong>
                          <span className="row-subtitle">
                            {item.course_name && `${item.course_name} · `}
                            {localDate(item.due_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </ListRows>
                ) : (
                  <Empty icon={CalendarDays} title={t('emptyDeadlinesTitle')} text={t('emptyDeadlinesText')} />
                )}
              </Panel>
            </div>
            <div className="two-column">
              <Panel title={t('cardStatusPanelTitle')}>
                {summary.anki.available ? (
                  <p className="muted-text">
                    {t('cardStatusLine', {
                      cards: summary.anki.card_count,
                      reviews: summary.anki.review_count,
                      proposed: summary.anki.proposed_count,
                    })}
                  </p>
                ) : (
                  <Empty icon={Layers3} title={t('emptyCardsTitle')} text={t('emptyCardsText')} />
                )}
              </Panel>
              <Panel title={t('openAssignmentsPanelTitle')}>
                {summary.open_assignments.length ? (
                  <ListRows>
                    {summary.open_assignments.map((item) => (
                      <div className="data-row" key={item.course_id}>
                        <MessageCircleQuestion size={17} className="row-icon" />
                        <div>
                          <Link to={`/courses/${item.course_id}`}>{item.course_name}</Link>
                          <span className="row-subtitle">{t('sectionsToCheckLabel', { count: item.count })}</span>
                        </div>
                      </div>
                    ))}
                  </ListRows>
                ) : (
                  <Empty icon={MessageCircleQuestion} title={t('allAssignedTitle')} text={t('allAssignedText')} />
                )}
              </Panel>
            </div>
            <Link className="subtle-link" to="/settings">
              {t('configureDigestLink')}
            </Link>
          </>
        )
      )}
    </Shell>
  )
}
