// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMutation } from '@tanstack/react-query'
import i18n from '@/i18n'
import { queryClient } from '@/offlineCache'

type InvalidateKeys<TVariables, TData> = readonly string[] | ((variables: TVariables, data: TData) => readonly string[])

export interface UseApiMutationOptions<TData, TVariables> {
  /** API paths to invalidate in the shared query cache after a successful mutation. */
  invalidate?: InvalidateKeys<TVariables, TData>
  onSuccess?: (data: TData, variables: TVariables) => void
}

/**
 * Extracts a user-facing message from whatever a mutation threw. `request()`
 * already turns the backend's `{"detail": "..."}` body into `Error.message`
 * (already German, user-facing text); this is the fallback for mutations that
 * talk to the API without going through `request()` (for example raw `fetch`
 * calls that return a blob) and for non-`Error` throwables.
 */
export function extractApiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return i18n.t('common:unexpectedError')
}

/**
 * Wraps TanStack `useMutation` around the app's `request()` helper so
 * components no longer hand-roll `setBusy(true)` / try-catch-finally /
 * `setError` boilerplate for every write. Pending state, error messages and
 * query invalidation after success are handled in one place; the error is
 * always surfaced (never swallowed) so callers can render it with
 * `role="alert"`.
 */
export function useApiMutation<TData = unknown, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: UseApiMutationOptions<TData, TVariables>,
) {
  const mutation = useMutation<TData, Error, TVariables>({
    mutationFn,
    onSuccess: (data, variables) => {
      const keys = typeof options?.invalidate === 'function' ? options.invalidate(variables, data) : options?.invalidate
      keys?.forEach((path) => void queryClient.invalidateQueries({ queryKey: ['api', path] }))
      options?.onSuccess?.(data, variables)
    },
  })
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    data: mutation.data ?? null,
    pending: mutation.isPending,
    variables: mutation.variables,
    error: mutation.error ? extractApiErrorMessage(mutation.error) : null,
    reset: mutation.reset,
  }
}
