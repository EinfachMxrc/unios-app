// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { courseHue } from '@/lib/courseHue'
import './CourseChip.css'

/** A course always carries the same colour, in lists, on cards and in the agenda. */
export function CourseChip({ id, name, link = false }: { id: number; name: string; link?: boolean }) {
  const props = { className: 'course-chip', 'data-hue': courseHue(id), title: name }
  return link ? (
    <Link to={`/courses/${id}`} {...props}>
      <span>{name}</span>
    </Link>
  ) : (
    <span {...props}>
      <span>{name}</span>
    </span>
  )
}
