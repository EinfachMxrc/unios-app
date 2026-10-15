// SPDX-License-Identifier: AGPL-3.0-or-later

import { QueryClient } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { invalidateStudyReads, isStudyReadKey } from './studyQueries'

it('matches complete scoped and legacy Study URLs, excluding unrelated API keys', () => {
  for (const path of [
    '/api/anki/study/due',
    '/api/anki/study/due?deck=Uni%3A%3AA',
    '/api/anki/study/stats',
    '/api/anki/study/status',
  ])
    expect(isStudyReadKey(['api', path])).toBe(true)
  for (const key of [
    ['api', '/api/anki/study/due/private'],
    ['api', '/api/anki/study/cards'],
    ['api', '/api/anki/study/reviews'],
    ['api', '/api/overview'],
    ['other', '/api/anki/study/due'],
  ])
    expect(isStudyReadKey(key)).toBe(false)
})

it('invalidates every cached deck scope without deleting its offline snapshot or other domains', async () => {
  const client = new QueryClient()
  const paths = [
    '/api/anki/study/due',
    '/api/anki/study/due?deck=Uni%3A%3AA',
    '/api/anki/study/due?deck=Uni%3A%3AB',
    '/api/anki/study/stats',
    '/api/anki/study/status',
    '/api/overview',
  ]
  for (const path of paths) client.setQueryData(['api', path], { synthetic: path })
  await invalidateStudyReads(client)
  for (const path of paths) {
    expect(client.getQueryState(['api', path])?.isInvalidated).toBe(path !== '/api/overview')
    expect(client.getQueryData(['api', path])).toEqual({ synthetic: path })
  }
  client.clear()
})

it('refreshes learning progress immediately after an acknowledged review while preserving offline snapshots', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })
  const readProgress = vi.fn().mockResolvedValueOnce({ reviews: 0 }).mockResolvedValue({ reviews: 1 })
  const options = { queryKey: ['api', '/api/learning/topics'], queryFn: readProgress }
  expect(await client.fetchQuery(options)).toEqual({ reviews: 0 })
  const paths = [
    '/api/learning/modules',
    '/api/learning/weekly',
    '/api/learning/cycles',
    '/api/learning/blocks',
    '/api/learning/topics?course=2',
    '/api/analytics/study',
    '/api/overview',
  ]
  const unrelated = ['/api/courses', '/api/learning/topics/2', '/api/learning/questions', '/api/notes']
  for (const path of [...paths, ...unrelated]) client.setQueryData(['api', path], { synthetic: path })
  await invalidateStudyReads(client, { progress: true })
  expect(client.getQueryData(options.queryKey)).toEqual({ reviews: 0 })
  expect(await client.fetchQuery(options)).toEqual({ reviews: 1 })
  expect(readProgress).toHaveBeenCalledTimes(2)
  for (const path of [...paths, ...unrelated]) {
    expect(client.getQueryState(['api', path])?.isInvalidated).toBe(paths.includes(path))
    expect(client.getQueryData(['api', path])).toEqual({ synthetic: path })
  }
  client.clear()
})
