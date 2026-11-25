// Runs every *.check.mjs under src and scripts, with the browser export condition so solid-js
// loads its reactive build. Exits non-zero when any fails.
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const found = []
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (n.endsWith('.check.mjs')) found.push(p)
  }
}
walk(join(root, 'src'))
walk(join(root, 'scripts'))
const only = process.argv[2]
const run = found.filter((p) => !only || p.includes(only))
let failed = 0
for (const f of run) {
  const r = spawnSync(process.execPath, ['--conditions=browser', f], { cwd: root, encoding: 'utf8' })
  const ok = r.status === 0
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${relative(root, f)}${ok ? '' : '\n' + (r.stderr || r.stdout).split('\n').slice(0, 8).join('\n')}`)
}
console.log(`${run.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
