// Builds:
//   dist/extension/      load-unpacked Chrome extension (MV3)
//   dist/lib/            the framework-agnostic core library (ESM) + page/grab.js
//   dist/extension-e2e/  (--e2e only) same extension plus host_permissions,
//                        so e2e/run.mjs can drive it without a toolbar click
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { buildGrabScript } from './grab-script.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const watch = process.argv.includes('--watch')
const e2e = process.argv.includes('--e2e')

const common = {
  bundle: true,
  format: 'esm',
  target: 'chrome116',
  minify: false,
  sourcemap: 'linked',
  logLevel: 'info'
}

function writeStatic() {
  const ext = join(dist, 'extension')
  mkdirSync(join(ext, 'page'), { recursive: true })
  cpSync(join(root, 'src/extension/manifest.json'), join(ext, 'manifest.json'))
  cpSync(join(root, 'src/extension/icons'), join(ext, 'icons'), { recursive: true })
  const grab = buildGrabScript()
  writeFileSync(join(ext, 'page/grab.js'), grab)
  mkdirSync(join(dist, 'lib/page'), { recursive: true })
  writeFileSync(join(dist, 'lib/page/grab.js'), grab)
}

function writeE2eVariant() {
  const ext = join(dist, 'extension-e2e')
  cpSync(join(dist, 'extension'), ext, { recursive: true })
  const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'))
  manifest.host_permissions = ['<all_urls>']
  writeFileSync(join(ext, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
}

const builds = [
  {
    ...common,
    entryPoints: [join(root, 'src/extension/background.ts')],
    outfile: join(dist, 'extension/background.js')
  },
  {
    ...common,
    entryPoints: [join(root, 'src/core/index.ts'), join(root, 'src/page/selection.ts'), join(root, 'src/page/clipboard.ts')],
    outdir: join(dist, 'lib'),
    outbase: join(root, 'src'),
    target: 'es2022'
  }
]

rmSync(dist, { recursive: true, force: true })
writeStatic()

if (watch) {
  for (const options of builds) {
    const ctx = await esbuild.context({
      ...options,
      plugins: [{ name: 'static', setup: (b) => b.onEnd(writeStatic) }]
    })
    await ctx.watch()
  }
  console.log('watching for changes…')
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)))
  if (e2e) writeE2eVariant()
}
