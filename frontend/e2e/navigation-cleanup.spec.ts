// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from './fixtures'

test('mobile has five main areas, one More shortcut and visible next steps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Mobile Navigation' })
  await expect(nav.getByRole('link')).toHaveText(['Heute','Kurse','Lernen','Notizen','Termine'])
  await expect(nav.getByRole('link', { name: 'Mehr' })).toHaveCount(0)
  await expect(page.locator('.more-top-link')).toBeVisible()
  const next = (await page.getByRole('heading', { name: 'Als Nächstes' }).boundingBox())!
  expect(next.y + next.height).toBeLessThan(844)
  await page.getByRole('button', { name: 'Neu', exact: true }).click()
  await expect(page.getByRole('menuitem')).toHaveText(['Neue Notiz','Schnellnotizen','Datei hinzufügen','Sprachnotizen'])
  await page.getByRole('menuitem', { name: 'Neue Notiz' }).click()
  await expect(page).toHaveURL(/\/notes\?new=1/)
})

test('pinned notes and search have a single active sidebar owner', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('unios-sidebar-layout-v1', JSON.stringify({version:1,workspace:['today','notes','search'],library:[],courseOrder:[],hiddenCourses:[],showCourses:false})))
  for (const route of ['/notes','/search']) {
    await page.goto(route)
    await expect(page.locator('.app-sidebar a.active')).toHaveCount(1)
    await expect(page.locator('.app-sidebar a.active')).toHaveAttribute('href', route)
  }
})

test('palette finds all enabled areas and hides disabled modules even on direct routes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('unios-ui-preferences-v1', JSON.stringify({modules:{projects:true,grades:true,mail:false,addons:false,search:false}})))
  await page.goto('/')
  await page.getByRole('button', { name: 'Befehlspalette öffnen' }).click()
  const dialog = page.getByRole('dialog', { name: 'Befehlspalette' })
  for (const area of ['Notizen','Eingang','Lernanalyse','Noten und ECTS','Projekte','Sprachnotizen','myCampus']) {
    await dialog.getByRole('textbox', { name: 'Befehl suchen' }).fill(area)
    await expect(dialog.getByRole('button', { name: area, exact: true })).toBeVisible()
  }
  for (const area of ['Marketplace','Uni-Mail']) {
    await dialog.getByRole('textbox', { name: 'Befehl suchen' }).fill(area)
    await expect(dialog.getByRole('button', { name: area, exact: true })).toHaveCount(0)
  }
  await page.keyboard.press('Escape')
  for (const route of ['/mail','/addons','/marketplace']) {
    await page.goto(route)
    await expect(page.getByRole('heading', { name: 'Bereich ausgeblendet' })).toBeVisible()
  }
})

test('legacy theme migrates once, then Settings owns the new persistent choice', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('marc-theme')) localStorage.setItem('marc-theme','dark') })
  await page.goto('/settings#appearance')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('combobox', { name: 'Design', exact: true }).selectOption('light')
  await page.reload()
  await expect(page).toHaveURL(/\/settings#appearance$/)
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  expect(await page.evaluate(() => [localStorage.getItem('unios-theme'),localStorage.getItem('marc-theme')])).toEqual(['light','dark'])
  await expect(page.getByRole('navigation', { name: 'Einstellungsbereiche' }).getByRole('link')).toHaveText(['Allgemein','Darstellung','Erinnerungen','Daten & Sync','Feedback'])
})

test('feedback creates an explicit GitHub draft with no automatic diagnostics', async ({ page }) => {
  await page.goto('/settings?feedback=problem&from=%2Fnotes#feedback')
  await page.getByLabel('Was wolltest du tun?').fill('Eine Notiz öffnen')
  await page.getByLabel('Deine Beschreibung').fill('Die Ansicht blieb leer.')
  await page.getByLabel('Diagnose an die heruntergeladene Datei anhängen').check()
  const href = await page.getByRole('link', { name: 'Bericht auf GitHub öffnen' }).getAttribute('href')
  const url = new URL(href!)
  expect(url.origin + url.pathname).toBe('https://github.com/EinfachMxrc/unios-app/issues/new')
  expect(url.searchParams.get('body')).toContain('Die Ansicht blieb leer.')
  expect(url.search).not.toMatch(/diagnostics|schema_version|error_codes|generation/)
})

test('PDF breadcrumbs link course hierarchy and mobile course tabs remain reachable', async ({ page }) => {
  const course = await (await page.request.get('/api/courses/1')).json()
  const resource = course.resources.find((r: {name: string}) => r.name==='04_Schleifen.pdf')
  await page.goto(`/material/${course.versions[resource.id][0].id}`)
  const trail = page.getByRole('navigation', { name: 'Seitennavigation' })
  await expect(trail.getByRole('link')).toHaveText(['Kurse','Programmieren 1','04_Schleifen.pdf'])
  await trail.getByRole('link', { name: 'Programmieren 1', exact:true }).click()
  await page.setViewportSize({ width:320,height:844 })
  const next = page.getByRole('button', { name: 'Weitere Registerkarten' })
  if (await next.isVisible()) await next.click()
  await page.getByRole('navigation', { name:'Kursansichten' }).getByRole('link', { name:/Notizen/ }).click()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('missing Moodle credentials never imply an empty collection', async ({ page }) => {
  await page.route('**/api/overview', async route => { const result=await route.fetch(); await route.fulfill({json:{...await result.json(),moodle_configured:false}}) })
  await page.goto('/')
  await expect(page.locator('.today-workspace')).toBeVisible()
  await expect(page.locator('.welcome-panel')).toHaveCount(0)
})


test('selected learning tab stays visible on narrow screens and after resizing', async ({ page }) => {
  for (const route of ['/coding', '/assessment', '/study']) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(route)
    const tabs = page.getByRole('navigation', { name: 'Lernen' })
    const selected = tabs.locator('[aria-current="page"]')
    await expect(selected).toBeVisible()
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await expect.poll(async () => {
        const strip = await tabs.boundingBox()
        const tab = await selected.boundingBox()
        return !!strip && !!tab && tab.x >= strip.x && tab.x + tab.width <= strip.x + strip.width
      }).toBe(true)
    }
  }
})
