// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  currentVerifiedGeneration,
  isHostOnline,
  markHostReachable,
  markHostUnverified,
  markHostVerified,
} from '@/hostAvailability'
import { mayCache, queryClient } from '@/offlineCache'
import i18n from '@/i18n'
import { getLocaleMeta, intlLocaleFor } from '@/i18n/localeMeta'
import { runtimeWritesAllowed } from '@/lib/runtimeAccess'
import { readFreshness } from '@/readFreshness'

const SYNC_COMPLETED_EVENT = 'unios:sync-completed'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function notifySyncCompleted() {
  window.dispatchEvent(new Event(SYNC_COMPLETED_EVENT))
  void queryClient.invalidateQueries({ queryKey: ['api', '/api/search/offline-index'] })
}

/** Native sign-in callbacks bypass fetch(), so their cached warnings need an explicit refresh. */
export function notifyConnectionsChanged() {
  const paths = new Set([
    '/api/overview',
    '/api/system',
    '/api/capabilities',
    '/api/setup/status',
    '/api/mycampus/import/status',
  ])
  void queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === 'api' && typeof query.queryKey[1] === 'string' && paths.has(query.queryKey[1]),
  })
}

export async function verifiedMutationGeneration(): Promise<number> {
  if (!runtimeWritesAllowed()) throw new Error(i18n.t('common:offlineWriteLocked'))
  if (!isHostOnline()) {
    throw new Error(i18n.t('common:offlineWriteLocked'))
  }
  if (currentVerifiedGeneration() === null) {
    let check: Response
    try {
      check = await fetch('/api/host', { credentials: 'same-origin', cache: 'no-store' })
    } catch (cause) {
      markHostReachable(false)
      throw cause
    }
    if (!check.ok) throw new Error(i18n.t('common:hostCheckFailed'))
    const host = (await check.json()) as { mode?: string; generation?: number | null }
    markHostVerified(host.mode === 'host' ? (host.generation ?? null) : null)
    markHostReachable(true)
    if (currentVerifiedGeneration() === null) throw new Error(i18n.t('common:noActiveHost'))
  }
  if (!runtimeWritesAllowed()) throw new Error(i18n.t('common:offlineWriteLocked'))
  return currentVerifiedGeneration()!
}

/**
 * Every API call goes through here: host lease header, offline write lock,
 * reachability tracking, readable errors and post-write invalidation. Returns
 * the successful response unread, for bodies that are not JSON (files, text).
 */
export async function requestResponse(path: string, options?: RequestInit): Promise<Response> {
  const method = options?.method?.toUpperCase() ?? 'GET'
  const generation = method !== 'GET' && method !== 'HEAD' ? await verifiedMutationGeneration() : null
  // A mode check can revoke writes while host verification is in flight.
  if (method !== 'GET' && method !== 'HEAD' && !runtimeWritesAllowed())
    throw new Error(i18n.t('common:offlineWriteLocked'))
  let response: Response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options?.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' && method !== 'HEAD' && generation !== null
          ? { 'X-UniOS-Lease-Generation': String(generation) }
          : {}),
        ...options?.headers,
      },
    })
    markHostReachable(true)
  } catch (cause) {
    if (!options?.signal?.aborted) markHostReachable(false)
    throw cause
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    let code: string | undefined
    try {
      const payload = (await response.json()) as { detail?: unknown; code?: unknown }
      if (typeof payload.detail === 'string') message = payload.detail
      if (typeof payload.code === 'string') code = payload.code
    } catch {
      /* response without JSON */
    }
    if (
      method !== 'GET' &&
      method !== 'HEAD' &&
      (response.status === 423 || (response.status === 409 && message.startsWith('STALE_HOST')))
    ) {
      markHostUnverified()
      void queryClient.invalidateQueries({ queryKey: ['api', '/api/host'] })
    }
    throw new ApiError(message, response.status, code)
  }
  if (method !== 'GET' && method !== 'HEAD') {
    if (path === '/api/setup/moodle' || /^\/api\/setup\/portals\/[^/]+\/session$/.test(path)) {
      notifyConnectionsChanged()
    }
    // A successful edit must make short-lived navigation reads stale too.
    // Pages refresh their affected reads explicitly; other pages refresh on entry.
    void queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'api' && typeof query.queryKey[1] === 'string' && readFreshness(query.queryKey[1]) > 0,
      refetchType: 'none',
    })
    window.dispatchEvent(new Event('unios:local-change'))
  }
  return response
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method?.toUpperCase() ?? 'GET'
  const response = await requestResponse(path, options)
  if (response.status === 204) return undefined as T
  const result = (await response.json()) as T
  if (path === '/api/host' && method === 'GET') {
    const host = result as { mode?: string; generation?: number | null }
    markHostVerified(host.mode === 'host' ? (host.generation ?? null) : null)
  }
  return result
}

export function useApi<T>(
  path: string,
  options?: { enabled?: boolean; refetchInterval?: number; retainScope?: string },
) {
  const query = useQuery<T, Error>({
    queryKey: ['api', path],
    queryFn: ({ signal }) => request<T>(path, { signal }),
    enabled: options?.enabled ?? true,
    staleTime: readFreshness(path),
    meta: { offlineCache: mayCache(path), workspaceScope: options?.retainScope },
    placeholderData: (previous, query) =>
      options?.retainScope && query?.meta?.workspaceScope === options.retainScope ? previous : undefined,
    networkMode: 'always',
    refetchInterval:
      options?.refetchInterval ?? (path === '/api/host' ? 15_000 : path === '/api/host/conflicts' ? 30_000 : false),
  })
  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['api', path] })
  }, [path])
  useEffect(() => {
    window.addEventListener(SYNC_COMPLETED_EVENT, reload)
    return () => window.removeEventListener(SYNC_COMPLETED_EVENT, reload)
  }, [reload])
  return {
    data: query.data ?? null,
    error: query.data === undefined && query.error ? query.error.message : null,
    refreshError: query.data !== undefined && query.error ? query.error.message : null,
    refreshing: query.isFetching && query.data !== undefined,
    loading: query.isPending,
    updatedAt: query.dataUpdatedAt,
    reload,
  }
}

/**
 * BCP-47 tag used for `Intl.*` formatting per active UI language. Each
 * locale's `locale.json` can override this (see `intlLocaleFor` /
 * `LocaleMeta.intlLocale`) — English does, to keep the day-month-year order
 * and 24-hour style used throughout the app (en-GB) rather than switching to
 * en-US's month-first dates. A newly contributed language works correctly
 * without setting this at all (it defaults to the language's own code).
 */
export function activeIntlLocale(): string {
  return intlLocaleFor(getLocaleMeta(i18n.language))
}

/** Stored database timestamps without an offset are UTC, never browser-local time. */
export function dateFromApi(value: string): Date {
  return new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`)
}

export function localDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
) {
  if (!value) return i18n.t('common:noData')
  const date = dateFromApi(value)
  return Number.isNaN(date.getTime())
    ? i18n.t('common:invalidDate')
    : new Intl.DateTimeFormat(activeIntlLocale(), { timeZone: 'Europe/Berlin', ...options }).format(date)
}
