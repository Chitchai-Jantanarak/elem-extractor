// End-to-end check of the real extension in Chromium.
//   npm run build -- --e2e && npm run e2e
// The e2e build adds host_permissions so the test can drive the picker
// without a toolbar click (which grants activeTab in normal use).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const extDir = resolve(process.argv[2] ?? join(here, '..', 'dist', 'extension-e2e'))
const outDir = resolve(process.argv[3] ?? join(here, '..', 'dist', 'e2e-output'))
mkdirSync(outDir, { recursive: true })

const fixture = readFileSync(join(here, 'fixture.html'))
const server = createServer((req, res) => {
  if (req.url === '/' || req.url?.startsWith('/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fixture)
  } else {
    res.writeHead(404).end()
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const pageUrl = `${origin}/index.html`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail && !ok ? ` (${detail})` : ''}`)
}

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  viewport: { width: 1000, height: 700 }
})
try {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto(pageUrl)
  await page.bringToFront()

  const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, pageUrl)
  const badge = () => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)
  const title = () => sw.evaluate((id) => chrome.action.getTitle({ tabId: id }), tabId)
  const toggle = () =>
    sw.evaluate(async (id) => {
      const tab = await chrome.tabs.get(id)
      await globalThis.elemExtractor.controller.toggle({ tabId: id, windowId: tab.windowId })
    }, tabId)
  const hostCount = () => page.locator('#__elem-grab-host').count()
  const waitFor = async (fn, ms = 4000) => {
    for (let t = 0; t < ms; t += 100) {
      if (await fn()) return true
      await sleep(100)
    }
    return false
  }
  const readClipboard = () =>
    page.evaluate(async () => {
      const out = { types: [], text: null, png: null }
      for (const item of await navigator.clipboard.read()) {
        out.types.push(...item.types)
        if (item.types.includes('text/plain')) out.text = await (await item.getType('text/plain')).text()
        if (item.types.includes('image/png')) {
          const bytes = new Uint8Array(await (await item.getType('image/png')).arrayBuffer())
          let binary = ''
          for (const b of bytes) binary += String.fromCharCode(b)
          out.png = btoa(binary)
        }
      }
      return out
    })

  // 1. Arm
  await toggle()
  check('overlay injected', await waitFor(async () => (await hostCount()) === 1))
  check('badge shows ON', (await badge()) === 'ON')
  check('hostile pre-existing global was torn down', await page.evaluate(() => window.hostileCleanupCalled === true))

  // 2. Hover + left click
  const box = await page.locator('#save').boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx - 5, cy - 5)
  await page.mouse.move(cx, cy, { steps: 3 })
  await sleep(100)
  await page.mouse.click(cx, cy)
  check('badge flashes ✓', await waitFor(async () => (await badge()) === '✓'), `title=${await title()}`)
  check('page never saw the click', await page.evaluate(() => !window.clicked))
  const clip = await readClipboard()
  writeFileSync(join(outDir, 'clipboard.md'), clip.text ?? '')
  if (clip.png) writeFileSync(join(outDir, 'clipboard.png'), Buffer.from(clip.png, 'base64'))
  check('clipboard holds text and PNG', clip.types.includes('text/plain') && clip.types.includes('image/png'), clip.types.join(','))
  check('markdown names the selector', !!clip.text?.includes('- Element: `button#save`'))
  check('React components and source file', !!clip.text?.includes('<BillingCard> <SaveButton>') && !!clip.text?.includes('src/billing/SaveButton.tsx:42:7'))
  check('secrets stripped', !clip.text?.includes('SECRET'))
  check('re-armed after the pick', await waitFor(async () => (await hostCount()) === 1 && (await badge()) === 'ON'))

  // 3. Escape
  await page.keyboard.press('Escape')
  check('Escape removes the overlay', await waitFor(async () => (await hostCount()) === 0))
  check('badge cleared', await waitFor(async () => (await badge()) === ''))

  // 4. Right click: copy once, then exit
  await toggle()
  await waitFor(async () => (await hostCount()) === 1)
  await page.mouse.move(cx + 1, cy, { steps: 2 })
  await sleep(100)
  await page.evaluate(() => navigator.clipboard.writeText('reset'))
  await page.mouse.click(cx + 1, cy, { button: 'right' })
  check('right click exits', await waitFor(async () => (await hostCount()) === 0))
  check('right click copied', !!(await readClipboard()).text?.includes('button#save'))

  // 5. Toggle off while armed
  await toggle()
  await waitFor(async () => (await hostCount()) === 1)
  await toggle()
  check('toggle off removes the overlay', await waitFor(async () => (await hostCount()) === 0 && (await badge()) === ''))

  // 6. Navigation ends the session and never leaks into the next page
  await toggle()
  await waitFor(async () => (await hostCount()) === 1)
  await page.reload()
  await sleep(500)
  check('reload clears the picker', (await hostCount()) === 0 && (await badge()) === '', `host=${await hostCount()} badge=${await badge()}`)
  await toggle()
  check('can pick again after reload', await waitFor(async () => (await hostCount()) === 1))
  await toggle()

  // 7. Restricted page
  await page.goto('chrome://version')
  await toggle()
  check('restricted page reports an error', await waitFor(async () => (await badge()) === '!'), `title=${await title()}`)
} finally {
  await context.close()
  server.close()
}

const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
