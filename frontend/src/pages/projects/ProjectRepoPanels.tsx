// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { useT } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Failure, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import type { GitHubActivity, MirrorSnapshot, RepoMatch, RepoSearch } from './projectTypes'

/** The host returns at most this many matches per search. */
const MATCH_LIMIT = 30

/** Recent commits, issues and pull requests of the linked repository, loaded on demand. */
export function GitHubPanel({ projectId }: { projectId: number }) {
  const { t } = useT('projects')
  const load = useApiMutation(() => request<GitHubActivity>(`/api/projects/${projectId}/github`))
  const data = load.data
  const groups = data ? [
    { title: t('commitsTitle'), items: data.commits },
    { title: t('issuesTitle'), items: data.issues },
    { title: t('pullRequestsTitle'), items: data.pull_requests },
  ] : []
  return <Panel title={t('githubActivityTitle')}>
    <p className="muted-text">{t('githubActivityIntro')}</p>
    <Button variant="outline" disabled={load.pending} onClick={() => load.mutate()}>{load.pending ? t('loadingButton') : data ? t('refreshButton') : t('loadActivityButton')}</Button>
    {load.error && <Failure message={load.error} />}
    {data && <div className="project-github">
      <p className="row-subtitle">{t('statusPrefix', { date: localDate(data.fetched_at) })}</p>
      {groups.map((group) => <section key={group.title}>
        <h3>{group.title}</h3>
        {group.items.length ? group.items.map((item, index) => <p key={`${item.url}-${index}`}>
          <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
          <span className="row-subtitle">{item.actor ? ` · ${item.actor}` : ''}{item.at ? ` · ${localDate(item.at)}` : ''}{item.state ? ` · ${item.state}` : ''}</span>
        </p>) : <p className="muted-text">{t('noEntriesText')}</p>}
      </section>)}
      <section><h3>{t('branchesTitle')}</h3><p>{data.branches.join(', ') || t('noBranches')}</p></section>
      {data.members.length > 0 && <section><h3>{t('memberActivityTitle')}</h3>
        <p className="muted-text">{t('memberActivityHint')}</p>
        {data.members.map((member) => <p key={member.github_username}>{t('memberActivityLine', { name: member.name, commits: member.commits, issues: member.issues, pullRequests: member.pull_requests })}</p>)}
      </section>}
    </div>}
  </Panel>
}

/** A local copy of the repository: mirror it, download it as ZIP and search its files. */
export function MirrorPanel({ projectId }: { projectId: number }) {
  const { t } = useT('projects')
  const canWrite = useWritableHost()
  const { data, error, reload } = useApi<MirrorSnapshot | null>(`/api/projects/${projectId}/mirror`)
  const [term, setTerm] = useState('')
  const [searched, setSearched] = useState(false)
  const [matches, setMatches] = useState<RepoMatch[]>([])
  const search = useApiMutation(
    () => request<RepoSearch>(`/api/projects/${projectId}/mirror/search?q=${encodeURIComponent(term.trim())}`),
    { onSuccess: (result) => { setMatches(result.matches); setSearched(true) } },
  )
  const mirror = useApiMutation(
    () => request(`/api/projects/${projectId}/mirror`, { method: 'POST' }),
    { onSuccess: () => { reload(); setSearched(false); setMatches([]) } },
  )
  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    if (term.trim().length < 2) return
    search.mutate()
  }
  return <Panel title={t('mirrorTitle')}>
    <p className="muted-text">{t('mirrorIntro')}</p>
    {error && <Failure message={error} />}
    {mirror.error && <Failure message={mirror.error} />}
    {data ? <p>{t('lastMirrorLine', { date: localDate(data.fetched_at), count: data.refs_count, repo: data.repository })}</p>
      : <p className="muted-text">{t('noMirrorYet')}</p>}
    <Button variant="outline" disabled={!canWrite || mirror.pending} onClick={() => mirror.mutate()}>
      {mirror.pending ? t('mirroringButton') : data ? t('mirrorAgainButton') : t('mirrorNowButton')}
    </Button>
    {data?.head && <a className="project-archive-link" href={`/api/projects/${projectId}/mirror/archive`}>
      {t('downloadZipLink')}
    </a>}
    <p className="row-subtitle">{t('privateRepoHint')}</p>
    {data?.head && <div className="project-repo-search">
      <form onSubmit={submitSearch}>
        <label htmlFor={`repo-search-${projectId}`}>{t('searchLabel')}</label>
        <div className="project-repo-search-controls">
          <input id={`repo-search-${projectId}`} value={term} minLength={2} maxLength={100}
            placeholder={t('searchPlaceholder')} onChange={(event) => setTerm(event.target.value)} />
          <Button type="submit" variant="outline" disabled={search.pending || term.trim().length < 2}>
            {search.pending ? t('searchingButton') : t('searchButton')}
          </Button>
        </div>
      </form>
      {search.error && <Failure message={search.error} />}
      {searched && (matches.length ? <div className="project-repo-matches">
        {matches.map((item, index) => <p key={`${item.path}:${item.line}:${index}`}>
          <strong>{item.path}:{item.line}</strong><span>{item.excerpt}</span>
        </p>)}
        {matches.length === MATCH_LIMIT && <p className="muted-text">{t('moreMatchesHint')}</p>}
      </div> : <p className="muted-text">{t('noMatchesText')}</p>)}
    </div>}
  </Panel>
}
