// SPDX-License-Identifier: AGPL-3.0-or-later

import { lazy, Suspense } from 'react'

// Load formula rendering and syntax highlighting when task content is shown.
// Plain text remains readable while the shared renderer is being loaded.
const Question = lazy(() =>
  import('./AssessmentQuestionContent').then((module) => ({ default: module.AssessmentQuestion })),
)
const Inline = lazy(() =>
  import('./AssessmentQuestionContent').then((module) => ({ default: module.AssessmentInline })),
)
const Code = lazy(() => import('./AssessmentQuestionContent').then((module) => ({ default: module.AssessmentCode })))

export function AssessmentQuestion({ text }: { text: string }) {
  return (
    <Suspense fallback={<div className="assessment-question-text">{text}</div>}>
      <Question text={text} />
    </Suspense>
  )
}

export function AssessmentInline({ text }: { text: string }) {
  return (
    <Suspense fallback={<span>{text}</span>}>
      <Inline text={text} />
    </Suspense>
  )
}

export function AssessmentCode({ text, language }: { text: string; language?: string }) {
  return (
    <Suspense
      fallback={
        <pre>
          <code>{text}</code>
        </pre>
      }
    >
      <Code text={text} language={language} />
    </Suspense>
  )
}
