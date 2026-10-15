// Builds page/grab.js: every fragment in src/page/grab/, in filename order,
// wrapped in a single IIFE. Shared by the build and the tests so both run the
// exact same script.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRAGMENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'page', 'grab')

export function listGrabFragments() {
  return readdirSync(FRAGMENT_DIR)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => join(FRAGMENT_DIR, name))
}

export function buildGrabScript() {
  const body = listGrabFragments()
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
  // Why: the IIFE keeps every helper private; the only global it leaves
  // behind is window.__elemGrab. The trailing `true` is the value
  // chrome.scripting.executeScript reports back.
  return `(function() {\n'use strict';\n\n${body}\nreturn true;\n})();\n`
}
