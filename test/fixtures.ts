import type { GrabPayload } from '../src/core'

export function makePayload(overrides: Partial<GrabPayload> = {}): GrabPayload {
  return {
    page: {
      sanitizedUrl: 'https://example.com/app',
      title: 'Example App',
      viewportWidth: 1280,
      viewportHeight: 720,
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 2,
      capturedAt: '2026-10-15T00:00:00.000Z'
    },
    target: {
      tagName: 'button',
      selector: 'main > button.primary',
      elementPath: 'main > .primary',
      fullPath: 'main > button.primary',
      cssClasses: 'primary',
      nearbyElements: ['span "Label"'],
      selectedText: null,
      isFixed: false,
      reactComponents: '<App> <SaveButton>',
      sourceFile: 'src/SaveButton.tsx:12:4',
      textSnippet: 'Save',
      htmlSnippet: '<button class="primary">Save</button>',
      attributes: { class: 'primary' },
      accessibility: { role: 'button', accessibleName: 'Save', ariaLabel: null, ariaLabelledBy: null },
      rectViewport: { x: 10, y: 20, width: 100, height: 40 },
      rectPage: { x: 10, y: 20, width: 100, height: 40 },
      computedStyles: {
        display: 'inline-flex',
        position: 'static',
        width: '100px',
        height: '40px',
        margin: '0px',
        padding: '8px',
        color: 'rgb(0, 0, 0)',
        backgroundColor: 'rgb(37, 99, 235)',
        border: '',
        borderRadius: '6px',
        fontFamily: 'Inter',
        fontSize: '14px',
        fontWeight: '600',
        lineHeight: '20px',
        textAlign: 'center',
        zIndex: 'auto'
      }
    },
    nearbyText: ['Cancel'],
    ancestorPath: ['main', 'body'],
    screenshot: null,
    ...overrides
  }
}
