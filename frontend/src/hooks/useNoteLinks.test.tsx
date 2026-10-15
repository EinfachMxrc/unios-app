// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { NoteMarkdownDocument } from '@/components/editor/RichNoteDocument'
import { NoteMarkdownEditor } from '@/components/NoteMarkdownEditor'
import { noteLinkPaths, requestNoteLinkBatch, type NoteLinkResolution } from './useNoteLinks'
import { internalNoteHref } from '@/lib/noteLinks'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function wrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return function NoteTestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
  }
}

const hiddenTarget = { id: 'f549063e-a638-43b6-907b-49de0cc9890b', title: 'Straße', course_name: 'Beispielkurs' }
function resolverFetch(status: NoteLinkResolution['status'] = 'resolved') {
  return vi.fn(async (path: string) => {
    const titles = new URL(path, 'http://localhost').searchParams.getAll('titles')
    return new Response(JSON.stringify(titles.map(title => ({ title, status,
      target: status === 'resolved' ? hiddenTarget : null }))), { headers: { 'Content-Type': 'application/json' } })
  })
}

describe('global note link metadata', () => {
  it('deduplicates titles and bounds both batch count and encoded URL length', () => {
    const titles = Array.from({ length: 70 }, (_, index) => `${String(index).padStart(3, '0')}${'界'.repeat(197)}`)
    const paths = noteLinkPaths(`${titles.map(title => `[[${title}]]`).join(' ')} [[${titles[0]}]] [[ ]]`)
    const recovered = paths.flatMap(path => new URL(path, 'http://localhost').searchParams.getAll('titles'))
    expect(recovered).toEqual(titles)
    for (const path of paths) {
      expect(new URL(path, 'http://localhost').searchParams.getAll('titles').length).toBeLessThanOrEqual(32)
      expect(path.length).toBeLessThan(6100)
    }
    expect(noteLinkPaths('No links, ```code```')).toEqual([])
    const emojiTitle = '😀'.repeat(200)
    expect(new URL(noteLinkPaths(`[[${emojiTitle}]]`)[0], 'http://localhost').searchParams.get('titles')).toBe(emojiTitle)
    expect(noteLinkPaths(`[[${emojiTitle}😀]] [[${'a'.repeat(201)}]] [[A[B]] [[\r]] [[\u0085]] [[\u001c]]`)).toEqual([])
    expect(new URL(noteLinkPaths('[[\uFEFF]]')[0], 'http://localhost').searchParams.get('titles')).toBe('\uFEFF')
  })

  it('keeps a globally resolved link when the visible list changes and retains the editor DOM', async () => {
    const fetcher = resolverFetch()
    vi.stubGlobal('fetch', fetcher)
    const body = '# Quelle\n\nWeiterlesen: [[  STRASSE  ]]'
    const view = render(<NoteMarkdownDocument body={body} notes={[]} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByRole('link', { name: 'STRASSE' }).getAttribute('href'))
      .toBe(`/notes?id=${hiddenTarget.id}`))
    const document = view.container.querySelector('.studio-readonly')
    const html = document?.innerHTML
    view.rerender(<NoteMarkdownDocument body={body} notes={[{ id: 'visible', title: 'Andere Listenseite',
      course_id: 1, course_name: 'Beispielkurs', resource_id: null, current_revision: 1, created_at: '', updated_at: '' }]} />)
    expect(view.container.querySelector('.studio-readonly')).toBe(document)
    expect(document?.innerHTML).toBe(html)
    expect(screen.getByRole('link', { name: 'STRASSE' }).getAttribute('href')).toBe(`/notes?id=${hiddenTarget.id}`)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not pick a duplicate title from an incomplete visible list', async () => {
    vi.stubGlobal('fetch', resolverFetch('ambiguous'))
    const view = render(<NoteMarkdownDocument body="[[Straße]]" notes={[]} />, { wrapper: wrapper() })
    await waitFor(() => expect(view.container.querySelector('.note-unresolved-link')?.getAttribute('title'))
      .toContain('Mehrere Notizen'))
    expect(view.container.querySelector('.note-wikilink')).toBeNull()
    expect(view.container.textContent).toContain('[[Straße]]')
  })

  it('keeps the last cached target available when the host cannot be reached', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const path = noteLinkPaths('[[Straße]]')[0]
    client.setQueryData(['api', path], [{ title: 'Straße', status: 'resolved', target: hiddenTarget }], { updatedAt: 1 })
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetcher)
    render(<NoteMarkdownDocument body="[[Straße]]" notes={[]} />, { wrapper: wrapper(client) })
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: 'Straße' }).getAttribute('href')).toBe(`/notes?id=${hiddenTarget.id}`)
  })

  it('retains known targets after an offline edit changes the batch URL and uses the latest global answer', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['api', noteLinkPaths('[[Straße]]')[0]],
      [{ title: 'Straße', status: 'resolved', target: hiddenTarget }], { updatedAt: 1 })
    client.setQueryData(['api', noteLinkPaths('[[Straße]] [[Andere]]')[0]],
      [{ title: 'Straße', status: 'ambiguous', target: null }], { updatedAt: 2 })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const view = render(<NoteMarkdownDocument body="[[Straße]] [[Neu]]" notes={[]} />, { wrapper: wrapper(client) })
    await waitFor(() => expect(view.container.querySelectorAll('.note-unresolved-link')[1]?.getAttribute('title'))
      .toContain('konnte nicht geprüft'))
    expect(view.container.querySelectorAll('.note-unresolved-link')[0]?.getAttribute('title')).toContain('Mehrere Notizen')
    expect(view.container.querySelector('.note-wikilink')).toBeNull()
    view.rerender(<NoteMarkdownDocument body="[[Straße]]" notes={[]} />)
    await waitFor(() => expect(view.container.querySelector('.note-unresolved-link')?.getAttribute('title'))
      .toContain('Mehrere Notizen'))
    expect(view.container.querySelector('.note-wikilink')).toBeNull()
    client.setQueryData(['api', noteLinkPaths('[[Straße]]')[0]],
      [{ title: 'Straße', status: 'resolved', target: hiddenTarget }], { updatedAt: 3 })
    view.rerender(<NoteMarkdownDocument body="[[Straße]] [[Weitere]]" notes={[]} />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Straße' }).getAttribute('href'))
      .toBe(`/notes?id=${hiddenTarget.id}`))
  })

  it('bounds a 100000-character document to four in-flight batches and aborts queued lookups', async () => {
    const titles = Array.from({ length: 487 }, (_, index) => `${String(index).padStart(3, '0')}${'界'.repeat(197)}`)
    const body = titles.map(title => `[[${title}]]`).join('\n').padEnd(100_000, ' ')
    expect(body.length).toBe(100_000)
    const paths = noteLinkPaths(body)
    expect(paths.length).toBeGreaterThan(100)
    let pending = 0, peak = 0
    const release: (() => void)[] = []
    const fetcher = vi.fn(async () => {
      peak = Math.max(peak, ++pending)
      await new Promise<void>(resolve => release.push(resolve))
      pending--
      return new Response('[]')
    })
    vi.stubGlobal('fetch', fetcher)
    const controllers = paths.map(() => new AbortController())
    const requests = paths.map((path, index) => requestNoteLinkBatch(path, controllers[index].signal))
    const settled = Promise.allSettled(requests)
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4))
    release.shift()!()
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5))
    for (const controller of controllers.slice(5)) controller.abort()
    for (const finish of release) finish()
    const results = await settled
    expect(peak).toBe(4)
    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(paths.length - 5)
    const next = requestNoteLinkBatch('/api/notes/link-targets?titles=Next', new AbortController().signal)
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(6))
    release.at(-1)!()
    await next
  })

  it('reports an unavailable uncached lookup without dropping the original text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const view = render(<NoteMarkdownDocument body="[[Straße]]" notes={[]} />, { wrapper: wrapper() })
    await waitFor(() => expect(view.container.querySelector('.note-unresolved-link')?.getAttribute('title'))
      .toContain('konnte nicht geprüft'))
    expect(view.container.textContent).toContain('[[Straße]]')
    expect(view.container.querySelector('.note-wikilink')).toBeNull()
  })

  it('suggests a note outside the visible list in source mode and inserts its exact title', async () => {
    const fetcher = vi.fn(async (path: string) => {
      expect(path).toContain('/api/entities/note?')
      return new Response(JSON.stringify([{ id: hiddenTarget.id,
        title: 'Unsichtbare globale Quelle', course_id: 9 }]))
    })
    vi.stubGlobal('fetch', fetcher)
    function SourceNote() {
      const [body, setBody] = useState('')
      return <NoteMarkdownEditor id="source" value={body} onChange={setBody} notes={[]} />
    }
    render(<SourceNote />, { wrapper: wrapper() })
    const field = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: '[[Unsicht', selectionStart: 9 } })
    const option = await screen.findByRole('option', { name: 'Unsichtbare globale Quelle' })
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/api/entities/note?limit=40&q=Unsicht')
    fireEvent.click(option)
    expect(field.value).toBe('[[Unsichtbare globale Quelle]]')
  })

  it('opens internal source links in the current workspace and keeps modifier clicks native', () => {
    function LocationLabel() {
      const location = useLocation()
      return <output data-testid="location">{location.pathname}{location.search}</output>
    }
    render(<><NoteMarkdownDocument body="[Quelle](/material/51?page=120)" notes={[]} /><LocationLabel /></>,
      { wrapper: wrapper() })
    const link = screen.getByRole('link', { name: 'Quelle' })
    const modified = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 })
    fireEvent(link, modified)
    expect(modified.defaultPrevented).toBe(false)
    expect(screen.getByTestId('location').textContent).toBe('/')
    fireEvent.click(link)
    expect(screen.getByTestId('location').textContent).toBe('/material/51?page=120')
  })

  it.each(['/notes?id=lesson', '/assessment?task=7', '/coding?task=8',
    `${window.location.origin}/assessment?task=7`])('routes lesson and exercise links internally: %s', href => {
    function LocationLabel() {
      const location = useLocation()
      return <output data-testid="location">{location.pathname}{location.search}</output>
    }
    render(<><NoteMarkdownDocument body={`[Weiterlernen](${href})`} notes={[]} /><LocationLabel /></>,
      { wrapper: wrapper() })
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    fireEvent(screen.getByRole('link', { name: 'Weiterlernen' }), click)
    expect(click.defaultPrevented).toBe(true)
    const url = new URL(href, window.location.origin)
    expect(screen.getByTestId('location').textContent).toBe(`${url.pathname}${url.search}`)
  })

  it('allows supported relative and same-origin workspace-link routes', () => {
    for (const href of ['/notes?id=x', '/courses/12', '/material/51?page=120', '/learning?topic=1',
      '/deadlines?id=1', '/projects/1', '/assessment?task=7', '/coding?task=8']) {
      expect(internalNoteHref(href)).toBe(href)
      expect(internalNoteHref(`http://127.0.0.1:8000${href}`, 'http://127.0.0.1:8000')).toBe(href)
    }
    for (const href of [null, 'https://example.org/material/1', '//example.org/material/1',
      'javascript:alert(1)', '/settings', '/material/\\evil', '/material/1\n', 'http://%',
      'http://127.0.0.1:8001/assessment?task=7', 'http://user@127.0.0.1:8000/notes?id=x',
      'http://127.0.0.1:8000/settings', '/assessment-evil?task=7']) {
      expect(internalNoteHref(href, 'http://127.0.0.1:8000')).toBeNull()
    }
  })
})
