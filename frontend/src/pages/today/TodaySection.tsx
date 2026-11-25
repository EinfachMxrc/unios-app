// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type SectionTab<Id extends string> = { id: Id; label: string; count?: number }

/** One block of the start page: a title, optional filter tabs, a way to the full list. */
export function TodaySection<Id extends string>({
  id,
  icon: Icon,
  title,
  tabs,
  active,
  onSelect,
  to,
  linkLabel,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  tabs?: SectionTab<Id>[]
  active?: Id
  onSelect?: (id: Id) => void
  to: string
  linkLabel: string
  children: ReactNode
}) {
  const heading = `today-${id}-heading`
  return (
    <section className="today-section" aria-labelledby={heading}>
      <div className="today-section-heading">
        <h3 id={heading}>
          <Icon size={15} aria-hidden="true" /> {title}
        </h3>
        {tabs && (
          <div className="today-tabs" role="group" aria-labelledby={heading}>
            {tabs.map((tab) => (
              <button key={tab.id} type="button" aria-pressed={active === tab.id} onClick={() => onSelect?.(tab.id)}>
                {tab.label}
                {tab.count !== undefined && <span>{tab.count}</span>}
              </button>
            ))}
          </div>
        )}
        <Link to={to} className="today-section-link">
          <span>{linkLabel}</span> <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {children}
    </section>
  )
}
