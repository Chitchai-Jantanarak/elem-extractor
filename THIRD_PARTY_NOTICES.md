# Third-party notices

## Orca

Portions of this project are adapted from **Orca** (https://github.com/stablyai/orca),
studied at commit `9ebdc682`. Adapted files carry a header naming the Orca source
file they came from:

| This repo | Orca source |
|---|---|
| `src/page/grab/01-foundation.js` | `src/main/browser/grab-guest-foundation-script.ts` |
| `src/page/grab/02-content.js` | `src/main/browser/grab-guest-content-script.ts` |
| `src/page/grab/03-element-context.js` | `src/main/browser/grab-guest-element-context-script.ts` |
| `src/page/grab/04-react.js` | `src/main/browser/grab-guest-react-script.ts` |
| `src/page/grab/05-overlay.js` | `src/main/browser/grab-guest-overlay-script.ts` |
| `src/page/selection.ts` (`awaitSelection`) | `src/main/browser/grab-guest-selection-scripts.ts` |
| `src/core/types.ts` | `src/shared/browser-grab-types.ts` |
| `src/core/clamp-payload.ts` | `src/main/browser/browser-grab-payload.ts` |
| `src/core/crop.ts` (crop math) | `src/main/browser/browser-grab-screenshot.ts` |
| `test/clamp-payload.test.ts`, parts of `test/grab-script.test.ts` | `src/main/browser/browser-grab-payload.test.ts`, `src/main/browser/grab-guest-script.test.ts` |

Orca is distributed under the following license:

```
MIT License

Copyright (c) 2026 Lovecast Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
