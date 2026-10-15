// SPDX-License-Identifier: AGPL-3.0-or-later
const search = document.querySelector('#docs-search')
const results = document.querySelector('#search-results')
const root = document.body.dataset.docsRoot || ''
const index = window.UNIOS_DOCS_INDEX || []

function updateSearch() {
  if (!search || !results) return
  const terms = search.value.trim().toLocaleLowerCase('de-DE').split(/\s+/).filter(Boolean)
  results.replaceChildren()
  if (terms.length === 0) {
    results.hidden = true
    search.setAttribute('aria-expanded', 'false')
    return
  }
  const matches = index.map((entry) => {
    const title = entry.title.toLocaleLowerCase('de-DE')
    const text = `${entry.section} ${entry.summary} ${entry.text}`.toLocaleLowerCase('de-DE')
    if (!terms.every((term) => title.includes(term) || text.includes(term))) return null
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 4 : 0) + (text.includes(term) ? 1 : 0), 0)
    return { entry, score }
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'de')).slice(0, 12)

  if (matches.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'search-no-results'
    empty.textContent = 'Kein Thema gefunden. Versuche einen anderen Begriff oder API-Pfad.'
    results.append(empty)
  }
  for (const { entry } of matches) {
    const link = document.createElement('a')
    link.href = `${root}${entry.url}`
    const label = document.createElement('span')
    label.textContent = `${entry.area === 'user' ? 'Hilfe' : 'Entwickler'} / ${entry.section}`
    const heading = document.createElement('strong')
    heading.textContent = entry.title
    const description = document.createElement('small')
    description.textContent = entry.summary.replace(/\*\*/g, '')
    link.append(label, heading, description)
    results.append(link)
  }
  results.hidden = false
  search.setAttribute('aria-expanded', 'true')
}

if (search && results) {
  search.addEventListener('input', updateSearch)
  search.addEventListener('focus', updateSearch)
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const first = results.querySelector('a')
      if (first) window.location.href = first.href
    }
    if (event.key === 'Escape') {
      search.value = ''
      updateSearch()
      search.blur()
    }
  })
  document.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLElement &&
      (event.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(event.target.tagName))
    if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      search.focus()
    }
  })
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search-wrap')) {
      results.hidden = true
      search.setAttribute('aria-expanded', 'false')
    }
  })
}

const menu = document.querySelector('.menu-toggle')
const sidebar = document.querySelector('#docs-nav')
if (menu && sidebar) {
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true'
    menu.setAttribute('aria-expanded', String(open))
    sidebar.classList.toggle('open', open)
  })
  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      menu.setAttribute('aria-expanded', 'false')
      sidebar.classList.remove('open')
    }
  })
}
