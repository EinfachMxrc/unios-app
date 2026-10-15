// SPDX-License-Identifier: AGPL-3.0-or-later
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import type { components } from '@/generated/api'

export function ListPagination({ page, onPage }: {
  page?: components['schemas']['ListPageView'] | null
  onPage: (offset: number) => void
}) {
  const { t } = useT('quality')
  if (!page || page.total <= page.limit) return null
  return <nav className="list-pagination" aria-label={t('pagination')}>
    <Button size="sm" variant="outline" disabled={page.offset === 0}
      onClick={() => onPage(Math.max(0, page.offset - page.limit))}>
      <ChevronLeft size={16} />{t('previousPage')}
    </Button>
    <span aria-live="polite">{t('pageRange', {
      start: Math.min(page.offset + 1, page.total), end: Math.min(page.offset + page.limit, page.total), total: page.total,
    })}</span>
    <Button size="sm" variant="outline" disabled={!page.has_more}
      onClick={() => onPage(page.offset + page.limit)}>
      {t('nextPage')}<ChevronRight size={16} />
    </Button>
  </nav>
}
