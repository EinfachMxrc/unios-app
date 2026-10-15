// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  BookOpen,
  CircleHelp,
  FlaskConical,
  Info,
  Lightbulb,
  ListChecks,
  Pin,
  Quote,
  TriangleAlert,
  Zap,
} from 'lucide-react'

export const calloutKinds = [
  'note',
  'definition',
  'memory',
  'example',
  'tip',
  'pitfall',
  'question',
  'warning',
  'summary',
  'custom',
] as const
export type CalloutKind = (typeof calloutKinds)[number]
export const calloutIcons = {
  note: Info,
  definition: BookOpen,
  memory: Pin,
  example: FlaskConical,
  tip: Lightbulb,
  pitfall: Zap,
  question: CircleHelp,
  warning: TriangleAlert,
  summary: ListChecks,
  custom: Quote,
} satisfies Record<CalloutKind, typeof Info>
