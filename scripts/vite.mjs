// Runs Vite with PLATFORM and TARGET set, so the npm scripts work in any shell, Windows included.
//   node scripts/vite.mjs <platform> <target> [vite args...]
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const [platform, target, ...args] = process.argv.slice(2)
if (!platform || !target) {
  console.error('usage: node scripts/vite.mjs <platform> <target> [vite args...]')
  process.exit(1)
}
// Vite doesn't export its bin, so it's found next to its package.json.
const pkg = createRequire(import.meta.url).resolve('vite/package.json')
const vite = join(dirname(pkg), 'bin', 'vite.js')
const run = spawnSync(process.execPath, [vite, ...args], {
  stdio: 'inherit',
  env: { ...process.env, PLATFORM: platform, TARGET: target },
})
process.exit(run.status ?? 1)
