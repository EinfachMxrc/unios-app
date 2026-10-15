// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery } from '@tanstack/react-query'
import { requestResponse } from '@/api'

/** The stored file as the viewer reads it; never cached offline, it can be large. */
export function useFileContent<T extends 'text' | 'arrayBuffer'>(versionId: number, as: T) {
  return useQuery({
    queryKey: ['file-view', versionId, as],
    queryFn: async ({ signal }) => {
      const response = await requestResponse(`/files/${versionId}/view`, { signal })
      return (as === 'text' ? await response.text() : await response.arrayBuffer()) as T extends 'text'
        ? string
        : ArrayBuffer
    },
    staleTime: Infinity,
    retry: false,
  })
}
