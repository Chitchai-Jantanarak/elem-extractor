# Architecture

elem-extractor is split so the parts can be reused on their own or swapped
in a fork without touching the rest.

```
┌──────────────── page (MAIN world) ────────────────┐
│ page/grab.js        overlay, hover highlight,      │
│                     extractPayload()  ← Orca       │
│ awaitSelection()    one click / Esc / timeout      │
└───────────▲──────────────────────────┬────────────┘
            │ chrome.scripting         │ raw payload (untrusted)
┌───────────┴──────────────────────────▼────────────┐
│ background service worker                         │
│   GrabController  ── ports ──▶ PageDriver         │
│        │                       ScreenCapturer      │
│        │ clampGrabPayload      SessionStore        │
│        │ cropScreenshot        StatusIndicator     │
│        └──────────────────────▶ GrabSink[]        │
└────────────────────────────────────┬──────────────┘
                                     │ ClipboardSink → writeToClipboard()
                                     ▼ (page, ISOLATED world)
                                 clipboard
```

## Layers

| Layer | Folder | Depends on | Notes |
|---|---|---|---|
| Core | `src/core` | nothing | Types, budgets, validation, formatters, crop. Runs in a worker, a page or Node. Exported as the package's main entry. |
| Page | `src/page` | core types only | Code that runs inside the inspected page. `grab/*.js` is ES5-style (as in Orca) so it runs on any page. |
| Extension | `src/extension` | core, page | MV3 glue. `background.ts` is the only file that picks concrete classes. |

## Patterns

- **Ports and adapters.** `GrabController` only knows the interfaces in
  `src/extension/ports.ts`. Chrome specifics live in `adapters/` and `sinks/`;
  tests drive the controller with in-memory fakes (`test/grab-controller.test.ts`).
- **Composition root.** `src/extension/background.ts` builds the object graph.
  Forks change behaviour there, not inside the controller.
- **Strategy.** `GrabFormatter` decides the text (`markdownFormatter`,
  `jsonFormatter`); `GrabSink` decides where a pick goes. The controller fans
  a pick out to every sink and only reports an error if all of them fail.
- **State machine with a session token.** Each start writes a fresh token to
  `chrome.storage.session`. The wait loop re-checks it after every `await`,
  so a toggle-off, navigation or restarted service worker ends stale loops
  cleanly.
- **Defence in depth.** The page script runs in the page's MAIN world (React's
  `__reactFiber$…` properties are only visible there), so its output is
  untrusted. The page script redacts and trims, then `clampGrabPayload`
  re-checks everything on the extension side. Every call after the first is
  pinned to the `documentId` that was armed, so a navigation can't leak the
  picker into the next page.

## Why the page talks back through `executeScript`

`awaitSelection` is an `async` function passed to
`chrome.scripting.executeScript({ func })`. Chrome waits for the returned
promise and hands back the result, much like Orca's
`webContents.executeJavaScript`. This needs no content-script message bridge
and no nonce that a hostile page could read. The wait settles with
`timeout` every 20 seconds and the controller starts a new one. Each new
extension API call keeps the MV3 service worker alive while the picker is open.

Functions passed as `func` are serialized with `toString()`, so they must be
self-contained (no imports or outer variables). `test/page-dom.test.ts`
revives them from source to enforce this. Keep `keepNames`/minification off in
the build for the same reason.

## Extending

### Add a delivery target

Implement `GrabSink` and add it in `background.ts`:

```ts
class LocalBridgeSink implements GrabSink {
  readonly id = 'local-bridge'
  async deliver({ payload }) {
    await fetch('http://127.0.0.1:4317/grab', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
  }
}

sinks: [new ClipboardSink(), new LocalBridgeSink()]
```

A side panel, native messaging host or MCP server works the same way. A
side panel also needs the `sidePanel` permission and a page that listens for
`chrome.runtime` messages.

### Change the text format

```ts
new ClipboardSink({ formatter: jsonFormatter })
new ClipboardSink({ formatter: { id: 'short', format: (p) => p.target.selector } })
```

### Reuse the extraction without the extension

`page/grab.js` (built into `dist/lib/page/grab.js`) only needs a DOM. Inject it
any way you like (Puppeteer, Playwright, Electron, a bookmarklet), then call
`window.__elemGrab.extractPayload(element)` and pass the result through
`clampGrabPayload` from the core library.

### Another browser

Firefox MV3 supports `scripting.executeScript` with `world: 'MAIN'`. Add
adapters where an API differs (e.g. `browser.storage.session`). The core and
page code don't change.

## Keeping in step with Orca

The fragments in `src/page/grab/` are close to Orca's guest scripts. Apart
from the renamed global, host id and data attribute, the code is unchanged,
so upstream fixes can be diffed in directly. `test/grab-script.test.ts` fails
if the page-side budgets, safe attributes or secret patterns drift from
`src/core/types.ts`.
