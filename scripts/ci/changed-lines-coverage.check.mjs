// Self-check for lineHits in changed-lines-coverage.cjs, against V8's real coverage of a small module.
//   node scripts/ci/changed-lines-coverage.check.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { lineHits } = createRequire(import.meta.url)('./changed-lines-coverage.cjs')

const source = [
  '// a comment',
  'export const used = (n) => {',
  '  if (n > 0) {',
  '    return n * 2',
  '  }',
  '  return -n',
  '}',
  '/* a block',
  '   comment */',
  'export const unused = () => {',
  '  return 1',
  '}',
  '',
  'used(1)',
  'used(2)',
].join('\n')

const dir = mkdtempSync(join(tmpdir(), 'lines-check-'))
try {
  const file = join(dir, 'mod.mjs')
  writeFileSync(file, source)
  const coverage = join(dir, 'coverage')
  const run = spawnSync(process.execPath, [file], { env: { ...process.env, NODE_V8_COVERAGE: coverage } })
  assert.equal(run.status, 0)
  const url = pathToFileURL(file).href
  const scripts = readdirSync(coverage)
    .flatMap((name) => JSON.parse(readFileSync(join(coverage, name), 'utf8')).result)
    .filter((s) => s.url === url)
    .map((s) => s.functions.flatMap((f) => f.ranges))
  assert.equal(scripts.length, 1)

  // Comments, blank lines and lone closing brackets have no entry. used ran twice, its early
  // return twice, the fallback never, and unused never ran.
  assert.deepEqual(lineHits(source, scripts), { 2: 1, 3: 2, 4: 2, 6: 0, 10: 1, 11: 0, 14: 1, 15: 1 })
  // A file nothing loaded has every code line at 0.
  assert.deepEqual(lineHits(source, []), { 2: 0, 3: 0, 4: 0, 6: 0, 10: 0, 11: 0, 14: 0, 15: 0 })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log('changed-lines-coverage ok')
