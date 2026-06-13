// Copy renderer HTML/CSS/assets into dist/ so Electron can load them from the
// packaged app at runtime.
import { cp, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function copy(srcRel, destRel) {
  const src = resolve(root, srcRel)
  const dest = resolve(root, destRel)
  if (!existsSync(src)) return
  await mkdir(dirname(dest), { recursive: true })
  await cp(src, dest, { recursive: true })
  console.log(`copied ${srcRel} → ${destRel}`)
}

await copy('src/renderer', 'dist/renderer')
await copy('src/assets', 'dist/assets')
