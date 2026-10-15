# elem-extractor

Pick any element on a web page and copy agent-ready context to the clipboard:
selector, HTML, computed styles, accessibility info, nearby text, React
component names and source file (on React dev builds), plus a cropped
screenshot. Paste it straight into Claude Code or any other coding agent.

> [!NOTE]
> This project is **inspired by and partly adapted from [Orca](https://github.com/stablyai/orca)'s
> "Design Mode" (element grab)**, by Lovecast Inc., used under the MIT License.
> The page-side extraction scripts, payload types and payload validation were
> ported from Orca; the browser-extension shell around them is new.
> elem-extractor is an independent project. It is not affiliated with or
> endorsed by Orca or Lovecast Inc. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
> for exactly which files came from Orca.

## Use it

1. `npm install && npm run build`
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**
   and pick `dist/extension`.
3. On any page, click the toolbar icon or press **Alt+Shift+E**.

| Action | Result |
|---|---|
| Hover | Highlights the element and shows its tag, role, text and size |
| Left click | Copies the context (Markdown + PNG) and keeps picking |
| Right click | Copies, then turns the picker off |
| Esc / icon / shortcut again | Turns the picker off |

The toolbar badge shows **ON** while picking, **✓** after a copy and **!** on
errors (hover the icon for the message). Pages Chrome doesn't let extensions
touch (`chrome://`, the Web Store) show **!** instead of failing silently.

### What gets copied

````markdown
## Selected element
- Page: http://localhost:5173/settings — "Settings" (viewport 1440x900 @ 2x)
- Element: `button#save` (button, name="Save payment method")
- React: <BillingCard> <SaveButton>   source: `src/billing/SaveButton.tsx:42:7`
- Path: `.card > #save`
- Ancestors: body > main
- Box: 67x35 at (64, 182) in viewport
- Computed styles: display: inline-block; padding: 10px 18px; background: rgb(37, 99, 235); radius: 8px; …
- Text: "Save"
- Nearby text: "Update your payment method below.", "Docs", "Billing"

### HTML
```html
<button id="save" class="btn primary" aria-label="Save payment method">Save</button>
```

[Screenshot of the element (67x35) is on the clipboard as an image.]
````

The text and the PNG go on the clipboard together. Apps that accept images
(chat UIs, Claude Code's image paste) take the picture; terminals and editors
take the text.

### Privacy

Everything stays local: nothing is sent anywhere, and the extension only asks
for `activeTab`, so it can read a page only after you click the icon or press
the shortcut on it. URLs lose their query string and fragment, only a small
allowlist of attributes is kept, `<script>` tags are stripped from HTML, and
values that look like tokens or passwords become `[redacted]`. This happens
in the page and again in the extension, which never trusts the page's data.

### Limits

- Screenshots cover only the visible viewport (that's what Chrome can capture).
- Elements inside iframes can't be picked yet.
- `source:` needs a React dev build that still sets `_debugSource` (React 18
  and earlier). React 19 and production builds give component names at most.

## Develop

```sh
npm install
npm run check        # typecheck + unit tests + build
npm run watch        # rebuild on change; reload the extension in chrome://extensions
npm run build -- --e2e && npx playwright install chromium && npm run e2e
```

| Path | What it is |
|---|---|
| `src/core/` | Framework-agnostic library: payload types, `clampGrabPayload`, formatters, screenshot crop. No `chrome.*`. |
| `src/page/grab/` | The page script (Orca-derived), as fragments built into one `page/grab.js` |
| `src/page/*.ts` | Small self-contained functions run in the page via `chrome.scripting` |
| `src/extension/` | The Chrome MV3 extension: controller, ports, adapters, sinks |
| `test/` | Vitest unit tests (jsdom for page code) |
| `e2e/` | Playwright run of the real extension in Chromium |

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the design and how to
extend it: a new delivery target (side panel, local agent bridge, MCP server),
a different output format, or another browser.

## License

MIT, see [LICENSE](LICENSE). Code adapted from Orca keeps its MIT notice in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
